import { handleCors, corsHeaders } from '../shared/cors.ts'
import { getAuthenticatedUser, createAdminClient, logAudit } from '../shared/supabase.ts'
import { rateLimitAsync } from '../shared/rate-limit.ts'
import {
  isAiAssistantEnabled,
  shouldRefuseQuery,
  matchFaq,
  ABOUT_BLURB,
} from '../shared/faq-knowledge.ts'
import {
  embedTexts,
  formatGroundedExcerpt,
  generateRagAnswer,
  getOpenAiApiKey,
  VECTOR_MATCH_THRESHOLD,
  VECTOR_TOP_K,
  type RagChunkContext,
} from '../shared/kb-rag.ts'

/**
 * Member hybrid assistant — FAQ first, then approved public/member KB retrieval.
 * Prefer vector similarity when embeddings exist; fall back to trigram search.
 * Optional OpenAI synthesis grounded on retrieved chunks only.
 * Kill switch: AI_ASSISTANT_ENABLED must be 'true'.
 * Never reads claims, payments, or private member tables for RAG.
 *
 * POST /member-assistant  { query: string }
 */

function sanitizeQuery(input: unknown): string {
  if (typeof input !== 'string') return ''
  return input.replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, 500)
}

type Source = { type: string; id: string; title: string }

type ChunkHit = {
  title: string
  content: string
  source_type: string
  source_id: string
  access_level?: string
  rank?: number
}

function toSafeContexts(chunks: ChunkHit[]): RagChunkContext[] {
  return chunks
    .filter((c) => c.access_level === 'public' || c.access_level === 'member')
    .map((c) => ({
      title: c.title,
      content: c.content,
      source_type: c.source_type,
      source_id: c.source_id,
    }))
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    if (!isAiAssistantEnabled()) {
      return new Response(JSON.stringify({
        message: 'The help assistant is not enabled yet.',
        code: 'AI_DISABLED',
        mode: 'disabled',
      }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ message: 'Method not allowed', code: 'METHOD' }), {
        status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const user = await getAuthenticatedUser(req)
    if (!user) {
      return new Response(JSON.stringify({ message: 'Not authenticated', code: 'UNAUTHORIZED' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const adminClient = createAdminClient()
    const rl = await rateLimitAsync(req, 'member-assistant', { userId: user.id, adminClient })
    if (!rl.ok) return rl.response!

    const { data: member } = await adminClient
      .from('members')
      .select('status')
      .eq('id', user.id)
      .maybeSingle()
    if (!member || !['active', 'pending_approval'].includes(member.status)) {
      return new Response(JSON.stringify({
        message: 'Your account cannot use the assistant.',
        code: 'ACCOUNT_INACTIVE',
      }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json().catch(() => ({}))
    const query = sanitizeQuery(body.query)
    if (query.length < 3) {
      return new Response(JSON.stringify({
        message: 'Ask a short question about Luma Welfare.',
        code: 'VALIDATION',
      }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const refuse = shouldRefuseQuery(query)
    if (refuse) {
      await logAudit(adminClient, {
        actor_id: user.id,
        actor_role: 'member',
        action: 'assistant_refused',
        resource: 'assistant',
        meta: { reason: 'policy' },
      })
      return new Response(JSON.stringify({
        answer: refuse,
        sources: [] as Source[],
        mode: 'refuse',
      }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Tier 1: FAQ
    const faqHits = matchFaq(query, 2)
    if (faqHits.length > 0 && faqHits[0].score >= 0.4) {
      const top = faqHits[0]
      const sources: Source[] = faqHits.map((f) => ({ type: 'faq', id: f.id, title: f.question }))
      return new Response(JSON.stringify({
        answer: top.answer,
        sources,
        mode: 'faq',
      }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Tier 2: KB retrieval — vector first (when key + embeddings), else trigram
    let hits: ChunkHit[] = []
    let retrievalMode: 'vector' | 'trigram' | 'none' = 'none'
    const openaiKey = getOpenAiApiKey()

    if (openaiKey) {
      try {
        const [qVec] = await embedTexts([query], openaiKey)
        const { data: vectorHits, error: vecErr } = await adminClient.rpc('match_kb_chunks', {
          p_query_embedding: JSON.stringify(qVec),
          p_match_count: VECTOR_TOP_K,
          p_match_threshold: VECTOR_MATCH_THRESHOLD,
        })
        if (vecErr) throw new Error(vecErr.message)
        hits = (vectorHits ?? []) as ChunkHit[]
        if (hits.length > 0) retrievalMode = 'vector'
      } catch (err) {
        console.error('[member-assistant] vector search failed, falling back to trigram', err)
      }
    }

    if (hits.length === 0) {
      const { data: chunks, error: searchErr } = await adminClient.rpc('search_kb_chunks', {
        p_query: query,
        p_limit: VECTOR_TOP_K,
      })
      if (searchErr) throw new Error(searchErr.message)
      hits = (chunks ?? []) as ChunkHit[]
      if (hits.length > 0) retrievalMode = 'trigram'
    }

    const contexts = toSafeContexts(hits)
    if (contexts.length > 0) {
      const sources: Source[] = contexts.slice(0, 3).map((c) => ({
        type: c.source_type,
        id: c.source_id,
        title: c.title,
      }))

      let answer: string
      let mode: string = retrievalMode === 'vector' ? 'rag_vector' : 'rag'

      if (openaiKey) {
        try {
          answer = await generateRagAnswer(query, contexts, openaiKey)
          mode = retrievalMode === 'vector' ? 'rag_llm_vector' : 'rag_llm'
        } catch (err) {
          console.error('[member-assistant] LLM failed, using grounded excerpt', err)
          answer = formatGroundedExcerpt(contexts)
        }
      } else {
        answer = formatGroundedExcerpt(contexts)
      }

      return new Response(JSON.stringify({
        answer,
        sources,
        mode,
      }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Tier 3: soft FAQ / about fallback — no fabrication of KB content
    if (faqHits.length > 0) {
      return new Response(JSON.stringify({
        answer: faqHits[0].answer,
        sources: [{ type: 'faq', id: faqHits[0].id, title: faqHits[0].question }],
        mode: 'faq',
      }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({
      answer: `${ABOUT_BLURB.content} That specific detail was not found in the approved LUMA knowledge base. Try asking about packages, contributions, claims process, or documents — or open Help/FAQ on the website.`,
      sources: [{ type: 'about', id: ABOUT_BLURB.id, title: ABOUT_BLURB.title }],
      mode: 'fallback',
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[member-assistant]', err)
    return new Response(JSON.stringify({ message: 'Internal error', code: 'INTERNAL' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
