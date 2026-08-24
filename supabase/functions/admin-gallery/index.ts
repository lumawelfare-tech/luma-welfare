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
    const isIdPath = itemId && itemId !== 'admin-gallery'

    // GET /admin-gallery — list items
    if (req.method === 'GET' && !isIdPath) {
      requirePermission(session, 'packages', 'read')
      const q = url.searchParams.get('q')
      let query = adminClient
        .from('gallery_items')
        .select('*')
        .order('created_at', { ascending: false })
      if (q) query = query.or(`title.ilike.%${q}%,caption.ilike.%${q}%`)
      const { data, error } = await query
      if (error) throw new Error(error.message)
      return new Response(JSON.stringify({ items: data ?? [] }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // POST /admin-gallery — create item
    if (req.method === 'POST' && !isIdPath) {
      requirePermission(session, 'packages', 'create')
      const body = await req.json()
      const { title, caption, image_url } = body
      if (!image_url) {
        return new Response(JSON.stringify({ message: 'image_url is required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const { data, error } = await adminClient
        .from('gallery_items')
        .insert({ title: title || null, caption: caption || null, image_url })
        .select()
        .single()
      if (error) throw new Error(error.message)
      await logAudit(adminClient, { actor_id: user.id, actor_role: session.role_name, action: 'gallery.created', resource: 'gallery', resource_id: data.id, meta: { title } })
      return new Response(JSON.stringify(data), {
        status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // PATCH /admin-gallery/:id — update item
    if (req.method === 'PATCH' && isIdPath) {
      requirePermission(session, 'packages', 'update')
      const body = await req.json()
      const updates: Record<string, unknown> = {}
      if (body.title !== undefined) updates.title = body.title
      if (body.caption !== undefined) updates.caption = body.caption
      if (body.image_url !== undefined) updates.image_url = body.image_url
      const { data, error } = await adminClient
        .from('gallery_items')
        .update(updates)
        .eq('id', itemId)
        .select()
        .single()
      if (error) throw new Error(error.message)
      await logAudit(adminClient, { actor_id: user.id, actor_role: session.role_name, action: 'gallery.updated', resource: 'gallery', resource_id: itemId })
      return new Response(JSON.stringify(data), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // DELETE /admin-gallery/:id — delete item and storage file
    if (req.method === 'DELETE' && isIdPath) {
      requirePermission(session, 'packages', 'delete')
      // Get the item to find the storage path
      const { data: item } = await adminClient.from('gallery_items').select('image_url').eq('id', itemId).single()
      const { error } = await adminClient.from('gallery_items').delete().eq('id', itemId)
      if (error) throw new Error(error.message)

      // Try to delete associated storage file
      if (item?.image_url) {
        try {
          const storagePath = item.image_url.split('/storage/v1/object/public/gallery/')[1]
          if (storagePath) {
            await adminClient.storage.from('gallery').remove([storagePath])
          }
        } catch { /* storage cleanup is best-effort */ }
      }

      await logAudit(adminClient, { actor_id: user.id, actor_role: session.role_name, action: 'gallery.deleted', resource: 'gallery', resource_id: itemId })
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
