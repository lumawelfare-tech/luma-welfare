import { handleCors, corsHeaders } from '../shared/cors.ts'
import {
  getAuthenticatedUser,
  createAdminClient,
  loadAdminSession,
  adminSessionDeniedResponse,
  requirePermission,
  handleAdminError,
  logAudit,
} from '../shared/supabase.ts'
import { rateLimitAsync } from '../shared/rate-limit.ts'
import { FAQ_KNOWLEDGE, ABOUT_BLURB, isAiAssistantEnabled } from '../shared/faq-knowledge.ts'

/**
 * Admin KB ingest — rebuild safe chunks from FAQ + approved public/member documents.
 * Never ingests staff/admin/restricted KB, claims, or member PII.
 *
 * POST /admin-kb-ingest
 */

function hashContent(s: string): string {
  // Lightweight non-crypto fingerprint for change detection
  let h = 0
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0
  return `h${(h >>> 0).toString(16)}`
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    if (!isAiAssistantEnabled()) {
      return new Response(JSON.stringify({
        message: 'AI assistant / KB ingest is disabled. Set AI_ASSISTANT_ENABLED=true to enable.',
        code: 'AI_DISABLED',
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
    const loaded = await loadAdminSession(adminClient, user.id, { req })
    if (loaded.status !== 'ok') {
      return adminSessionDeniedResponse(loaded)
    }
    const session = loaded.session
    requirePermission(session, 'documents', 'approve')

    const rl = await rateLimitAsync(req, 'admin-kb-ingest', { userId: session.id, adminClient })
    if (!rl.ok) return rl.response!

    // Clear prior FAQ/About + kb_document chunks (safe sources only)
    await adminClient.from('kb_chunks').delete().in('source_type', ['faq', 'about', 'kb_document'])

    const rows: Record<string, unknown>[] = []

    for (const faq of FAQ_KNOWLEDGE) {
      const content = `Q: ${faq.question}\nA: ${faq.answer}`
      rows.push({
        source_type: 'faq',
        source_id: faq.id,
        access_level: 'public',
        title: faq.question,
        content,
        chunk_index: 0,
        content_hash: hashContent(content),
      })
    }

    rows.push({
      source_type: 'about',
      source_id: ABOUT_BLURB.id,
      access_level: 'public',
      title: ABOUT_BLURB.title,
      content: ABOUT_BLURB.content,
      chunk_index: 0,
      content_hash: hashContent(ABOUT_BLURB.content),
    })

    // Only approved public/member KB metadata (title + summary) — never private paths/PII
    const { data: docs, error: docsErr } = await adminClient
      .from('kb_documents')
      .select('id, title, summary, category, access_level, status')
      .eq('status', 'approved')
      .in('access_level', ['public', 'member'])
    if (docsErr) throw new Error(docsErr.message)

    for (const doc of docs ?? []) {
      const parts = [doc.title, doc.category ? `Category: ${doc.category}` : '', doc.summary ?? '']
        .filter(Boolean)
        .join('\n')
      if (parts.length < 3) continue
      rows.push({
        source_type: 'kb_document',
        source_id: doc.id,
        access_level: doc.access_level,
        title: doc.title,
        content: parts.slice(0, 8000),
        chunk_index: 0,
        content_hash: hashContent(parts),
      })
    }

    if (rows.length > 0) {
      const { error: insErr } = await adminClient.from('kb_chunks').insert(rows)
      if (insErr) throw new Error(insErr.message)
    }

    await logAudit(adminClient, {
      actor_id: session.id,
      actor_role: session.role_name,
      action: 'kb_ingest_rebuilt',
      resource: 'kb_chunks',
      meta: {
        faq: FAQ_KNOWLEDGE.length,
        about: 1,
        kb_documents: (docs ?? []).length,
        total_chunks: rows.length,
      },
    })

    return new Response(JSON.stringify({
      ok: true,
      chunks: rows.length,
      faq: FAQ_KNOWLEDGE.length,
      kb_documents: (docs ?? []).length,
      note: 'Embeddings are optional; text search is used. Never ingested staff/restricted/claim/member data.',
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return handleAdminError(err, 'admin-kb-ingest')
  }
})
