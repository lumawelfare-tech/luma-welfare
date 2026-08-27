import { handleCors, corsHeaders } from '../shared/cors.ts'
import { getAuthenticatedUser, createAdminClient, loadAdminSession, requirePermission, logAudit } from '../shared/supabase.ts'

/** Generate a safe storage path */
function makeStoragePath(filename: string): string {
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 50)
  return `gallery/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`
}

/** Extract storage path from a public URL */
function extractStoragePath(url: string, bucket: string): string | null {
  const prefix = `/storage/v1/object/public/${bucket}/`
  const idx = url.indexOf(prefix)
  if (idx === -1) return null
  return url.slice(idx + prefix.length)
}

/** Upload a base64 data URL to Storage and return the public URL */
async function uploadBase64(
  adminClient: ReturnType<typeof createAdminClient>,
  dataUrl: string,
  filename: string,
): Promise<string> {
  // Parse data URL: data:image/jpeg;base64,/9j/4AAQ...
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
  if (!match) throw new Error('Invalid image data.')

  const contentType = match[1]
  const base64 = match[2]
  const binaryStr = atob(base64)
  const bytes = new Uint8Array(binaryStr.length)
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i)

  // Limit: 10MB (base64 is ~33% larger than binary)
  if (bytes.length > 10 * 1024 * 1024) {
    throw new Error('File too large. Maximum size is 10MB.')
  }

  const path = makeStoragePath(filename)
  const { error } = await adminClient.storage
    .from('gallery')
    .upload(path, bytes, { contentType, upsert: false })
  if (error) throw new Error(`Storage upload failed: ${error.message}`)

  const { data: urlData } = adminClient.storage.from('gallery').getPublicUrl(path)
  return urlData.publicUrl
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
    const resourceId = url.searchParams.get("resource_id")
    const itemId = resourceId
    const isIdPath = itemId && itemId !== 'admin-gallery'

    // GET /admin-gallery — list items
    if (req.method === 'GET' && !isIdPath) {
      requirePermission(session, 'packages', 'read')
      const q = url.searchParams.get('q')
      const page = parseInt(url.searchParams.get('page') || '1')
      const perPage = Math.min(parseInt(url.searchParams.get('per_page') || '50'), 200)
      let query = adminClient
        .from('gallery_items')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
      if (q) query = query.or(`title.ilike.%${q}%,caption.ilike.%${q}%`)
      query = query.range((page - 1) * perPage, page * perPage - 1)
      const { data, error, count } = await query
      if (error) throw new Error(error.message)
      return new Response(JSON.stringify({ items: data ?? [], total: count ?? 0, page, per_page: perPage, pages: Math.ceil((count ?? 0) / perPage) }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // POST /admin-gallery — create item
    if (req.method === 'POST' && !isIdPath) {
      requirePermission(session, 'packages', 'create')
      const body = await req.json()
      const { title, caption, image_url, image_data, image_filename } = body

      let imageUrl = image_url

      // If base64 image data is provided, upload to Storage
      if (image_data && !imageUrl) {
        imageUrl = await uploadBase64(adminClient, image_data, image_filename || 'upload.jpg')
      }

      if (!imageUrl) {
        return new Response(JSON.stringify({ message: 'Image is required.' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { data, error } = await adminClient
        .from('gallery_items')
        .insert({ title: title || null, caption: caption || null, image_url: imageUrl })
        .select()
        .single()
      if (error) throw new Error(error.message)

      await logAudit(adminClient, { actor_id: user.id, actor_role: session.role_name, action: 'gallery.created', resource: 'gallery', resource_id: data.id, meta: { title } })

      return new Response(JSON.stringify(data), {
        status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // PATCH /admin-gallery?id=xxx — update item
    if (req.method === 'PATCH' && isIdPath) {
      requirePermission(session, 'packages', 'update')
      const body = await req.json()
      const updates: Record<string, unknown> = {}

      if (body.title !== undefined) updates.title = body.title
      if (body.caption !== undefined) updates.caption = body.caption

      // Handle image replacement
      if (body.image_data && !body.image_url) {
        const newUrl = await uploadBase64(adminClient, body.image_data, body.image_filename || 'upload.jpg')
        body.image_url = newUrl
      }

      if (body.image_url !== undefined) {
        // Clean up old storage file
        const { data: old } = await adminClient.from('gallery_items').select('image_url').eq('id', itemId).single()
        if (old?.image_url && body.image_url && body.image_url !== old.image_url) {
          const oldPath = extractStoragePath(old.image_url, 'gallery')
          if (oldPath) {
            try { await adminClient.storage.from('gallery').remove([oldPath]) } catch { /* best-effort */ }
          }
        }
        updates.image_url = body.image_url
      }

      const { data, error } = await adminClient
        .from('gallery_items')
        .update(updates)
        .eq('id', itemId)
        .select()
        .single()
      if (error) throw new Error(error.message)

      await logAudit(adminClient, { actor_id: user.id, actor_role: session.role_name, action: 'gallery.updated', resource: 'gallery', resource_id: itemId, meta: body.image_url ? { image_replaced: true } : undefined })

      return new Response(JSON.stringify(data), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // DELETE /admin-gallery?id=xxx — delete item and storage file
    if (req.method === 'DELETE' && isIdPath) {
      requirePermission(session, 'packages', 'delete')
      const { data: item } = await adminClient.from('gallery_items').select('image_url').eq('id', itemId).single()
      const { error } = await adminClient.from('gallery_items').delete().eq('id', itemId)
      if (error) throw new Error(error.message)

      if (item?.image_url) {
        try {
          const storagePath = extractStoragePath(item.image_url, 'gallery')
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
    console.error('admin-gallery error:', err)
    return new Response(JSON.stringify({ message: 'An unexpected error occurred.', code: 'INTERNAL' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
