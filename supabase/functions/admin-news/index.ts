import { handleCors, corsHeaders } from '../shared/cors.ts'
import { getAuthenticatedUser, createAdminClient, loadAdminSession, requirePermission, logAudit } from '../shared/supabase.ts'

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
    const session = await loadAdminSession(adminClient, user.id)
    if (!session) {
      return new Response(JSON.stringify({ message: 'No admin access', code: 'FORBIDDEN' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const url = new URL(req.url)
    const pathParts = url.pathname.split('/').filter(Boolean)
    const itemId = pathParts[pathParts.length - 1]
    const isIdPath = itemId && itemId !== 'admin-news'

    // GET /admin-news — list items
    if (req.method === 'GET' && !isIdPath) {
      requirePermission(session, 'packages', 'read')
      const type = url.searchParams.get('type')
      const status = url.searchParams.get('status')
      const q = url.searchParams.get('q')
      let query = adminClient
        .from('news_events')
        .select('*')
        .order('created_at', { ascending: false })
      if (type) query = query.eq('type', type)
      if (status === 'published') query = query.eq('is_published', true)
      if (status === 'draft') query = query.eq('is_published', false)
      if (q) query = query.or(`title.ilike.%${q}%,body.ilike.%${q}%`)
      const { data, error } = await query
      if (error) throw new Error(error.message)
      return new Response(JSON.stringify({ items: data ?? [] }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // POST /admin-news — create item
    if (req.method === 'POST' && !isIdPath) {
      requirePermission(session, 'packages', 'create')
      const body = await req.json()
      const { title, body: content, type, event_date, cover_image, excerpt } = body
      if (!title || !content) {
        return new Response(JSON.stringify({ message: 'title and body are required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const { data, error } = await adminClient
        .from('news_events')
        .insert({
          title,
          body: content,
          type: type || 'news',
          event_date: event_date || null,
          is_published: false,
        })
        .select()
        .single()
      if (error) throw new Error(error.message)
      await logAudit(adminClient, { actor_id: user.id, actor_role: session.role_name, action: `${type || 'news'}.created`, resource: 'news_events', resource_id: data.id, meta: { title } })
      return new Response(JSON.stringify(data), {
        status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // PATCH /admin-news/:id — update item
    if (req.method === 'PATCH' && isIdPath) {
      requirePermission(session, 'packages', 'update')
      const body = await req.json()
      const updates: Record<string, unknown> = {}
      if (body.title !== undefined) updates.title = body.title
      if (body.body !== undefined) updates.body = body.body
      if (body.type !== undefined) updates.type = body.type
      if (body.event_date !== undefined) updates.event_date = body.event_date
      if (body.is_published !== undefined) {
        updates.is_published = body.is_published
        updates.published_at = body.is_published ? new Date().toISOString() : null
      }
      updates.updated_at = new Date().toISOString()

      const { data, error } = await adminClient
        .from('news_events')
        .update(updates)
        .eq('id', itemId)
        .select()
        .single()
      if (error) throw new Error(error.message)

      const action = body.is_published === true ? 'published' : body.is_published === false ? 'unpublished' : 'updated'
      await logAudit(adminClient, { actor_id: user.id, actor_role: session.role_name, action: `news.${action}`, resource: 'news_events', resource_id: itemId })
      return new Response(JSON.stringify(data), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // DELETE /admin-news/:id — delete item
    if (req.method === 'DELETE' && isIdPath) {
      requirePermission(session, 'packages', 'delete')
      const { error } = await adminClient.from('news_events').delete().eq('id', itemId)
      if (error) throw new Error(error.message)
      await logAudit(adminClient, { actor_id: user.id, actor_role: session.role_name, action: 'news.deleted', resource: 'news_events', resource_id: itemId })
      return new Response(JSON.stringify({ message: 'Deleted' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ message: 'Not found' }), {
      status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error'
    const status = message.includes('FORBIDDEN') ? 403 : 500
    return new Response(JSON.stringify({ message }), {
      status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
