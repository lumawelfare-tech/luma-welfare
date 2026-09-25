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
import { buildIlikeOrFilter } from '../shared/search.ts'
import { rateLimitAsync } from '../shared/rate-limit.ts'
import { detectAllowedUpload, looksLikeScriptableMarkup } from '../shared/file-upload.ts'
import { KB_DOC_BUCKET, withSignedKbDocumentUrls } from '../shared/storage-signed.ts'
import { MAX_DOCUMENT_BYTES, documentTooLargeMessage } from '../shared/upload-limits.ts'

/**
 * Admin Knowledge-Base Documents — ACL + lifecycle (Phase 6).
 *
 * GET    /admin-documents
 * GET    /admin-documents?resource_id=xxx
 * POST   /admin-documents              — create + upload (JSON base64)
 * PATCH  /admin-documents?resource_id= — metadata / approve / archive
 * DELETE /admin-documents?resource_id=
 */

const ACCESS_LEVELS = new Set(['public', 'member', 'staff', 'admin', 'restricted'])
const STATUSES = new Set(['draft', 'under_review', 'approved', 'archived'])
const CATEGORIES = new Set([
  'ORGANIZATIONAL', 'PUBLIC_CONTENT', 'MEMBERSHIP', 'POLICY', 'PROGRAM',
  'CLAIMS', 'FINANCE', 'COMMUNITY', 'OTHER',
])

function sanitizeText(input: unknown, max: number): string {
  if (typeof input !== 'string') return ''
  return input.replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, max)
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

function decodeBase64File(dataUrlOrB64: string): Uint8Array {
  const match = dataUrlOrB64.match(/^data:([^;]+);base64,(.+)$/)
  const b64 = match ? match[2] : dataUrlOrB64
  const binaryStr = atob(b64)
  const bytes = new Uint8Array(binaryStr.length)
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i)
  return bytes
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
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

    if (req.method !== 'GET') {
      const rl = await rateLimitAsync(req, 'admin-documents-mutation', { userId: session.id, adminClient })
      if (!rl.ok) return rl.response!
    }

    const url = new URL(req.url)
    const resourceId = url.searchParams.get('resource_id')
    const isIdPath = Boolean(resourceId && resourceId !== 'admin-documents')

    // GET list
    if (req.method === 'GET' && !isIdPath) {
      requirePermission(session, 'documents', 'read')
      const status = url.searchParams.get('status')
      const access = url.searchParams.get('access_level')
      const q = url.searchParams.get('q')
      const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1)
      const perPage = Math.min(Math.max(1, parseInt(url.searchParams.get('per_page') || '50', 10) || 50), 200)

      let query = adminClient
        .from('kb_documents')
        .select('id, title, slug, summary, category, tags, access_level, status, file_name, mime_type, file_size, version, approved_at, archived_at, created_at, updated_at', { count: 'exact' })
        .order('created_at', { ascending: false })

      if (status && STATUSES.has(status)) query = query.eq('status', status)
      if (access && ACCESS_LEVELS.has(access)) query = query.eq('access_level', access)
      if (q) {
        const orFilter = buildIlikeOrFilter(['title', 'summary', 'category', 'file_name'], q)
        if (orFilter) query = query.or(orFilter)
      }
      query = query.range((page - 1) * perPage, page * perPage - 1)

      const { data, error, count } = await query
      if (error) throw new Error(error.message)

      return new Response(JSON.stringify({
        documents: data ?? [],
        total: count ?? 0,
        page,
        per_page: perPage,
        pages: Math.ceil((count ?? 0) / perPage) || 1,
      }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // GET detail (+ signed URL)
    if (req.method === 'GET' && isIdPath) {
      requirePermission(session, 'documents', 'read')
      const { data, error } = await adminClient
        .from('kb_documents')
        .select('*')
        .eq('id', resourceId!)
        .maybeSingle()
      if (error) throw new Error(error.message)
      if (!data) {
        return new Response(JSON.stringify({ message: 'Document not found', code: 'NOT_FOUND' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const [signed] = await withSignedKbDocumentUrls(adminClient, [data])
      return new Response(JSON.stringify({ document: signed }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // POST create + upload
    if (req.method === 'POST' && !isIdPath) {
      requirePermission(session, 'documents', 'create')
      const body = await req.json()
      const title = sanitizeText(body.title, 200)
      if (title.length < 2) {
        return new Response(JSON.stringify({ message: 'Title is required.', code: 'VALIDATION' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const fileBase64 = typeof body.fileBase64 === 'string' ? body.fileBase64 : ''
      const clientName = sanitizeText(body.fileName, 255) || 'document'
      if (!fileBase64) {
        return new Response(JSON.stringify({ message: 'File upload is required.', code: 'VALIDATION' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      let bytes: Uint8Array
      try {
        bytes = decodeBase64File(fileBase64)
      } catch {
        return new Response(JSON.stringify({ message: 'Invalid file encoding.', code: 'VALIDATION' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      if (bytes.length > MAX_DOCUMENT_BYTES) {
        return new Response(JSON.stringify({ message: documentTooLargeMessage('File'), code: 'VALIDATION' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const detected = detectAllowedUpload(bytes)
      if (!detected) {
        return new Response(JSON.stringify({ message: 'Unsupported file type. Use PDF, DOCX, JPEG, PNG, or WebP.', code: 'VALIDATION' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      if (looksLikeScriptableMarkup(bytes)) {
        return new Response(JSON.stringify({ message: 'File rejected by content check.', code: 'VALIDATION' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const accessLevel = sanitizeText(body.accessLevel ?? body.access_level, 32) || 'member'
      if (!ACCESS_LEVELS.has(accessLevel)) {
        return new Response(JSON.stringify({ message: 'Invalid access level.', code: 'VALIDATION' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const summary = sanitizeText(body.summary, 2000) || null
      const category = sanitizeText(body.category, 100) || null
      const slugRaw = sanitizeText(body.slug, 80)
      const slug = slugRaw || slugify(title) || null
      const tags = Array.isArray(body.tags)
        ? body.tags.filter((t: unknown) => typeof t === 'string').map((t: string) => sanitizeText(t, 40)).filter(Boolean).slice(0, 20)
        : []

      const safeBase = clientName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 50)
      const storagePath = `${session.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeBase}.${detected.ext}`

      const { error: upErr } = await adminClient.storage
        .from(KB_DOC_BUCKET)
        .upload(storagePath, bytes, { contentType: detected.mime, upsert: false })
      if (upErr) throw new Error(`Storage upload failed: ${upErr.message}`)

      const { data: created, error: insertErr } = await adminClient
        .from('kb_documents')
        .insert({
          title,
          slug,
          summary,
          category,
          tags,
          access_level: accessLevel,
          status: 'draft',
          storage_path: storagePath,
          file_name: clientName.includes('.') ? clientName : `${clientName}.${detected.ext}`,
          mime_type: detected.mime,
          file_size: bytes.length,
          created_by: session.id,
        })
        .select('*')
        .single()
      if (insertErr) {
        await adminClient.storage.from(KB_DOC_BUCKET).remove([storagePath])
        throw new Error(insertErr.message)
      }

      await logAudit(adminClient, {
        actor_id: session.id,
        actor_role: session.role_name,
        action: 'kb_document_created',
        resource: 'kb_document',
        resource_id: created.id,
      })

      return new Response(JSON.stringify({ document: created }), {
        status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // PATCH metadata / lifecycle
    if (req.method === 'PATCH' && isIdPath) {
      const body = await req.json()
      const lifecycle = typeof body.lifecycle === 'string' ? body.lifecycle : null

      const { data: existing, error: loadErr } = await adminClient
        .from('kb_documents')
        .select('*')
        .eq('id', resourceId!)
        .maybeSingle()
      if (loadErr) throw new Error(loadErr.message)
      if (!existing) {
        return new Response(JSON.stringify({ message: 'Document not found', code: 'NOT_FOUND' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const now = new Date().toISOString()
      const updates: Record<string, unknown> = { updated_at: now }

      if (lifecycle === 'approve') {
        requirePermission(session, 'documents', 'approve')
        if (existing.status === 'archived') {
          return new Response(JSON.stringify({ message: 'Archived documents cannot be approved.', code: 'VALIDATION' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        updates.status = 'approved'
        updates.approved_at = now
        updates.approved_by = session.id
        updates.archived_at = null
        updates.archived_by = null
      } else if (lifecycle === 'archive') {
        requirePermission(session, 'documents', 'approve')
        updates.status = 'archived'
        updates.archived_at = now
        updates.archived_by = session.id
      } else if (lifecycle === 'under_review') {
        requirePermission(session, 'documents', 'update')
        if (existing.status === 'archived') {
          return new Response(JSON.stringify({ message: 'Archived documents cannot be submitted for review.', code: 'VALIDATION' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        updates.status = 'under_review'
        updates.approved_at = null
        updates.approved_by = null
        updates.archived_at = null
        updates.archived_by = null
      } else if (lifecycle === 'draft') {
        requirePermission(session, 'documents', 'update')
        updates.status = 'draft'
        updates.approved_at = null
        updates.approved_by = null
        updates.archived_at = null
        updates.archived_by = null
      } else {
        requirePermission(session, 'documents', 'update')
        if (typeof body.title === 'string') {
          const title = sanitizeText(body.title, 200)
          if (title.length < 2) {
            return new Response(JSON.stringify({ message: 'Title is required.', code: 'VALIDATION' }), {
              status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
          }
          updates.title = title
        }
        if (body.summary !== undefined) updates.summary = sanitizeText(body.summary, 2000) || null
        if (body.category !== undefined) {
          const category = sanitizeText(body.category, 100) || null
          if (category && !CATEGORIES.has(category)) {
            return new Response(JSON.stringify({ message: 'Invalid document category.', code: 'VALIDATION' }), {
              status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
          }
          updates.category = category
        }
        if (body.slug !== undefined) updates.slug = sanitizeText(body.slug, 80) || null
        if (typeof body.accessLevel === 'string' || typeof body.access_level === 'string') {
          const accessLevel = sanitizeText(body.accessLevel ?? body.access_level, 32)
          if (!ACCESS_LEVELS.has(accessLevel)) {
            return new Response(JSON.stringify({ message: 'Invalid access level.', code: 'VALIDATION' }), {
              status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
          }
          updates.access_level = accessLevel
        }
        if (Array.isArray(body.tags)) {
          updates.tags = body.tags.filter((t: unknown) => typeof t === 'string').map((t: string) => sanitizeText(t, 40)).filter(Boolean).slice(0, 20)
        }
        if (body.versionLabel !== undefined || body.version_label !== undefined) {
          updates.version_label = sanitizeText(body.versionLabel ?? body.version_label, 40) || null
        }
        if (body.effectiveDate !== undefined || body.effective_date !== undefined) {
          const raw = body.effectiveDate ?? body.effective_date
          updates.effective_date = typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null
        }
      }

      const { data: updated, error: updErr } = await adminClient
        .from('kb_documents')
        .update(updates)
        .eq('id', resourceId!)
        .select('*')
        .single()
      if (updErr) throw new Error(updErr.message)

      await logAudit(adminClient, {
        actor_id: session.id,
        actor_role: session.role_name,
        action: lifecycle ? `kb_document_${lifecycle}` : 'kb_document_updated',
        resource: 'kb_document',
        resource_id: resourceId!,
      })

      return new Response(JSON.stringify({ document: updated }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // DELETE
    if (req.method === 'DELETE' && isIdPath) {
      requirePermission(session, 'documents', 'delete')
      const { data: existing, error: loadErr } = await adminClient
        .from('kb_documents')
        .select('id, storage_path')
        .eq('id', resourceId!)
        .maybeSingle()
      if (loadErr) throw new Error(loadErr.message)
      if (!existing) {
        return new Response(JSON.stringify({ message: 'Document not found', code: 'NOT_FOUND' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { error: delErr } = await adminClient.from('kb_documents').delete().eq('id', resourceId!)
      if (delErr) throw new Error(delErr.message)
      if (existing.storage_path) {
        await adminClient.storage.from(KB_DOC_BUCKET).remove([existing.storage_path])
      }

      await logAudit(adminClient, {
        actor_id: session.id,
        actor_role: session.role_name,
        action: 'kb_document_deleted',
        resource: 'kb_document',
        resource_id: resourceId!,
      })

      return new Response(JSON.stringify({ ok: true }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ message: 'Method not allowed', code: 'METHOD' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return handleAdminError(err, 'admin-documents')
  }
})
