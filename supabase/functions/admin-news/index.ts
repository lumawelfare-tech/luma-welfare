import { handleCors, corsHeaders } from '../shared/cors.ts'
import { getAuthenticatedUser, createAdminClient, loadAdminSession, requirePermission, logAudit } from '../shared/supabase.ts'

/** Generate a URL-safe slug from a title */
function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

/** Extract storage path from a public URL */
function extractStoragePath(url: string, bucket: string): string | null {
  const prefix = `/storage/v1/object/public/${bucket}/`
  const idx = url.indexOf(prefix)
  if (idx === -1) return null
  return url.slice(idx + prefix.length)
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
      if (q) query = query.or(`title.ilike.%${q}%,body.ilike.%${q}%,excerpt.ilike.%${q}%`)
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
      const { title, body: content, type, event_date, event_time, location, excerpt, cover_image, is_featured } = body
      if (!title || !content) {
        return new Response(JSON.stringify({ message: 'title and body are required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Generate slug
      let slug = slugify(title)
      const { data: existing } = await adminClient.from('news_events').select('id').eq('slug', slug).maybeSingle()
      if (existing) slug = `${slug}-${Date.now().toString(36)}`

      const { data, error } = await adminClient
        .from('news_events')
        .insert({
          title,
          body: content,
          type: type || 'news',
          slug,
          excerpt: excerpt || null,
          cover_image: cover_image || null,
          event_date: event_date || null,
          event_time: event_time || null,
          location: location || null,
          is_published: false,
          is_featured: is_featured || false,
        })
        .select()
        .single()
      if (error) throw new Error(error.message)
      await logAudit(adminClient, { actor_id: user.id, actor_role: session.role_name, action: `${type || 'news'}.created`, resource: 'news_events', resource_id: data.id, meta: { title, slug } })
      return new Response(JSON.stringify(data), {
        status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // PATCH /admin-news/:id — update item
    if (req.method === 'PATCH' && isIdPath) {
      requirePermission(session, 'packages', 'update')
      const body = await req.json()
      const updates: Record<string, unknown> = {}
      const fields = ['title', 'body', 'type', 'event_date', 'event_time', 'location', 'excerpt', 'cover_image', 'is_featured']
      for (const f of fields) {
        if (body[f] !== undefined) updates[f] = body[f]
      }
      if (body.is_published !== undefined) {
        updates.is_published = body.is_published
        updates.published_at = body.is_published ? new Date().toISOString() : null
      }
      updates.updated_at = new Date().toISOString()

      // Handle cover_image replacement — delete old storage file
      if (body.cover_image !== undefined) {
        const { data: old } = await adminClient.from('news_events').select('cover_image').eq('id', itemId).single()
        if (old?.cover_image && body.cover_image && body.cover_image !== old.cover_image) {
          const oldPath = extractStoragePath(old.cover_image, 'news')
          if (oldPath) {
            try { await adminClient.storage.from('news').remove([oldPath]) } catch { /* best-effort */ }
          }
        }
      }

      // Update slug if title changed
      if (body.title) {
        let slug = slugify(body.title)
        const { data: existing } = await adminClient.from('news_events').select('id').eq('slug', slug).neq('id', itemId).maybeSingle()
        if (existing) slug = `${slug}-${Date.now().toString(36)}`
        updates.slug = slug
      }

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

    // DELETE /admin-news/:id — delete item and storage
    if (req.method === 'DELETE' && isIdPath) {
      requirePermission(session, 'packages', 'delete')
      // Get cover_image before deleting
      const { data: item } = await adminClient.from('news_events').select('cover_image').eq('id', itemId).single()
      const { error } = await adminClient.from('news_events').delete().eq('id', itemId)
      if (error) throw new Error(error.message)

      // Clean up storage
      if (item?.cover_image) {
        const storagePath = extractStoragePath(item.cover_image, 'news')
        if (storagePath) {
          try { await adminClient.storage.from('news').remove([storagePath]) } catch { /* best-effort */ }
        }
      }

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
