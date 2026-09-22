import { handleCors, corsHeaders } from '../shared/cors.ts'
import { getAuthenticatedUser, createAdminClient } from '../shared/supabase.ts'
import { withSignedKbDocumentUrls } from '../shared/storage-signed.ts'

/**
 * Member Knowledge-Base Documents — Approved + Public/Member only.
 *
 * GET /member-documents              — list
 * GET /member-documents?id=xxx       — detail + signed download URL
 */

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

    if (req.method !== 'GET') {
      return new Response(JSON.stringify({ message: 'Method not allowed', code: 'METHOD' }), {
        status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const adminClient = createAdminClient()
    const { data: member } = await adminClient
      .from('members')
      .select('status')
      .eq('id', user.id)
      .maybeSingle()

    if (!member || !['active', 'pending_approval'].includes(member.status)) {
      return new Response(JSON.stringify({
        message: 'Your account cannot access organization documents.',
        code: 'ACCOUNT_INACTIVE',
      }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const url = new URL(req.url)
    const docId = url.searchParams.get('id') || url.searchParams.get('resource_id')

    if (docId) {
      const { data, error } = await adminClient
        .from('kb_documents')
        .select('id, title, slug, summary, category, tags, access_level, status, file_name, mime_type, file_size, version, approved_at, storage_path, created_at')
        .eq('id', docId)
        .eq('status', 'approved')
        .in('access_level', ['public', 'member'])
        .maybeSingle()
      if (error) throw new Error(error.message)
      if (!data) {
        return new Response(JSON.stringify({ message: 'Document not found', code: 'NOT_FOUND' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const [signed] = await withSignedKbDocumentUrls(adminClient, [data])
      const { storage_path: _path, ...safe } = signed
      return new Response(JSON.stringify({ document: safe }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data, error } = await adminClient
      .from('kb_documents')
      .select('id, title, slug, summary, category, tags, access_level, status, file_name, mime_type, file_size, version, approved_at, created_at')
      .eq('status', 'approved')
      .in('access_level', ['public', 'member'])
      .order('approved_at', { ascending: false })
    if (error) throw new Error(error.message)

    return new Response(JSON.stringify({ documents: data ?? [] }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[member-documents]', err)
    return new Response(JSON.stringify({ message: 'Internal error', code: 'INTERNAL' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
