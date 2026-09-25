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
import { KB_DOC_BUCKET } from '../shared/storage-signed.ts'
import {
  chunkKbText,
  embedTexts,
  extractPdfText,
  getOpenAiApiKey,
  hashContent,
  normalizeKbText,
  MAX_INGEST_CHUNKS,
  MAX_INGEST_DOCUMENTS,
  MAX_PDF_EXTRACT_CHARS,
} from '../shared/kb-rag.ts'

/**
 * Admin KB ingest — rebuild safe chunks from FAQ + approved public/member documents.
 * Downloads private Storage PDFs server-side, extracts text, chunks, optionally embeds.
 * Never ingests staff/admin/restricted KB, claims, or member PII.
 *
 * POST /admin-kb-ingest
 */

type DocRow = {
  id: string
  title: string
  summary: string | null
  category: string | null
  access_level: string
  status: string
  storage_path: string
  mime_type: string | null
  version: number
  version_label: string | null
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

    // Clear prior FAQ/About + kb_document chunks (safe sources only) — idempotent rebuild
    await adminClient.from('kb_chunks').delete().in('source_type', ['faq', 'about', 'kb_document'])

    const rows: Record<string, unknown>[] = []
    const warnings: string[] = []
    const openaiKey = getOpenAiApiKey()

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
        metadata: { category: faq.category },
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
      metadata: { category: 'about' },
    })

    // Only approved public/member KB — never staff/admin/restricted
    const { data: docs, error: docsErr } = await adminClient
      .from('kb_documents')
      .select('id, title, summary, category, access_level, status, storage_path, mime_type, version, version_label')
      .eq('status', 'approved')
      .in('access_level', ['public', 'member'])
    if (docsErr) throw new Error(docsErr.message)

    const approvedDocs = (docs ?? []) as DocRow[]
    if (approvedDocs.length > MAX_INGEST_DOCUMENTS) {
      warnings.push(`document_cap:${approvedDocs.length}>${MAX_INGEST_DOCUMENTS}`)
    }
    const docsToProcess = approvedDocs.slice(0, MAX_INGEST_DOCUMENTS)

    let pdfExtracted = 0
    let pdfFailed = 0

    for (const doc of docsToProcess) {
      const meta = {
        category: doc.category,
        version: doc.version,
        version_label: doc.version_label,
        // Never put storage_path in member-facing answers; keep internal-only flags
        has_pdf: Boolean(doc.storage_path),
      }

      let bodyText = ''
      const mime = (doc.mime_type ?? '').toLowerCase()
      const isPdf = mime.includes('pdf') || doc.storage_path.toLowerCase().endsWith('.pdf')

      if (isPdf && doc.storage_path) {
        try {
          const { data: file, error: dlErr } = await adminClient.storage
            .from(KB_DOC_BUCKET)
            .download(doc.storage_path)
          if (dlErr || !file) {
            throw new Error(dlErr?.message ?? 'download failed')
          }
          const bytes = new Uint8Array(await file.arrayBuffer())
          bodyText = await extractPdfText(bytes)
          if (bodyText.length > MAX_PDF_EXTRACT_CHARS) {
            bodyText = bodyText.slice(0, MAX_PDF_EXTRACT_CHARS)
            warnings.push(`pdf_truncated:${doc.id}`)
          }
          if (bodyText.length < 40) {
            throw new Error('extracted text too short')
          }
          pdfExtracted++
        } catch (err) {
          pdfFailed++
          const msg = err instanceof Error ? err.message : 'extract failed'
          console.error('[admin-kb-ingest] PDF extract failed', doc.id, msg)
          warnings.push(`pdf_extract_failed:${doc.id}`)
        }
      }

      if (!bodyText) {
        const parts = [doc.title, doc.category ? `Category: ${doc.category}` : '', doc.summary ?? '']
          .filter(Boolean)
          .join('\n')
        bodyText = normalizeKbText(parts)
      }

      if (bodyText.length < 3) continue

      if (rows.length >= MAX_INGEST_CHUNKS) {
        warnings.push(`chunk_cap:${MAX_INGEST_CHUNKS}`)
        break
      }

      const remaining = MAX_INGEST_CHUNKS - rows.length
      const pieces = chunkKbText(bodyText).slice(0, remaining)
      pieces.forEach((content, chunkIndex) => {
        rows.push({
          source_type: 'kb_document',
          source_id: doc.id,
          access_level: doc.access_level,
          title: doc.title,
          content,
          chunk_index: chunkIndex,
          content_hash: hashContent(`${doc.id}:${doc.version}:${chunkIndex}:${content}`),
          metadata: meta,
        })
      })
    }

    // Optional embeddings — skip when OPENAI_API_KEY unset (trigram search still works)
    let embedded = 0
    if (openaiKey && rows.length > 0) {
      try {
        const texts = rows.map((r) => String(r.content ?? ''))
        const vectors = await embedTexts(texts, openaiKey)
        if (vectors.length !== rows.length) {
          throw new Error(`embedding count mismatch ${vectors.length}!=${rows.length}`)
        }
        for (let i = 0; i < rows.length; i++) {
          rows[i].embedding = JSON.stringify(vectors[i])
        }
        embedded = vectors.length
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'embed failed'
        console.error('[admin-kb-ingest] embedding failed — inserting text-only chunks', msg)
        warnings.push('embedding_failed')
        // Strip any partial embedding fields
        for (const r of rows) delete r.embedding
      }
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
        embedded,
        pdf_extracted: pdfExtracted,
        pdf_failed: pdfFailed,
        embeddings_enabled: Boolean(openaiKey),
      },
    })

    return new Response(JSON.stringify({
      ok: true,
      chunks: rows.length,
      faq: FAQ_KNOWLEDGE.length,
      kb_documents: (docs ?? []).length,
      embedded,
      pdf_extracted: pdfExtracted,
      pdf_failed: pdfFailed,
      warnings,
      note: openaiKey
        ? 'PDF text chunked; embeddings stored for vector search.'
        : 'PDF text chunked; OPENAI_API_KEY unset — trigram search only. Never ingested staff/restricted/claim/member data.',
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return handleAdminError(err, 'admin-kb-ingest')
  }
})
