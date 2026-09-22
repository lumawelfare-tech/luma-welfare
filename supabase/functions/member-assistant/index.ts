import { handleCors, corsHeaders } from '../shared/cors.ts'
import { getAuthenticatedUser, createAdminClient, logAudit } from '../shared/supabase.ts'
import { rateLimitAsync } from '../shared/rate-limit.ts'
import {
  isAiAssistantEnabled,
  shouldRefuseQuery,
  matchFaq,
  ABOUT_BLURB,
} from '../shared/faq-knowledge.ts'

/**
 * Member hybrid assistant — FAQ first, then approved public/member KB chunks.
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

    // Tier 2: KB chunk search (public/member only — enforced in RPC)
    const { data: chunks, error: searchErr } = await adminClient.rpc('search_kb_chunks', {
      p_query: query,
      p_limit: 5,
    })
    if (searchErr) throw new Error(searchErr.message)

    const safeChunks = (chunks ?? []).filter((c: { access_level?: string }) =>
      c.access_level === 'public' || c.access_level === 'member'
    )

    if (safeChunks.length > 0) {
      const top = safeChunks[0] as { title: string; content: string; source_type: string; source_id: string }
      const sources: Source[] = safeChunks.slice(0, 3).map((c: { source_type: string; source_id: string; title: string }) => ({
        type: c.source_type,
        id: c.source_id,
        title: c.title,
      }))
      const answer = `${top.content}\n\n(For more, see Organization documents or the public FAQ.)`
      return new Response(JSON.stringify({
        answer,
        sources,
        mode: 'rag',
      }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Tier 3: soft FAQ / about fallback
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
      answer: `${ABOUT_BLURB.content} Try asking about packages, contributions, claims process, or documents — or open Help/FAQ on the website.`,
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
