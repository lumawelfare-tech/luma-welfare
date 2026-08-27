import { handleCors, corsHeaders } from '../shared/cors.ts'
import { getAuthenticatedUser, createAdminClient, loadAdminSession, requirePermission, logAudit } from '../shared/supabase.ts'

function makeStoragePath(filename: string): string {
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 50)
  return `media/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`
}

function extractStoragePath(url: string, bucket: string): string | null {
  const prefix = `/storage/v1/object/public/${bucket}/`
  const idx = url.indexOf(prefix)
  if (idx === -1) return null
  return url.slice(idx + prefix.length)
}

async function uploadBase64(
  adminClient: ReturnType<typeof createAdminClient>,
  dataUrl: string,
  filename: string,
  bucket = 'media',
): Promise<{ url: string; path: string; mimeType: string; size: number }> {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
  if (!match) throw new Error('Invalid file data.')

  const contentType = match[1]
  const base64 = match[2]
  const binaryStr = atob(base64)
  const bytes = new Uint8Array(binaryStr.length)
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i)

  if (bytes.length > 50 * 1024 * 1024) {
    throw new Error('File too large. Maximum size is 50MB.')
  }

  const path = makeStoragePath(filename)
  const { error } = await adminClient.storage
    .from(bucket)
    .upload(path, bytes, { contentType, upsert: false })
  if (error) throw new Error(`Storage upload failed: ${error.message}`)

  const { data: urlData } = adminClient.storage.from(bucket).getPublicUrl(path)
  return { url: urlData.publicUrl, path, mimeType: contentType, size: bytes.length }
}

function detectMediaType(mimeType: string): string {
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('video/')) return 'video'
  if (mimeType.startsWith('audio/')) return 'audio'
  return 'document'
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
    const isIdPath = itemId && itemId !== 'admin-media'

    // GET /admin-media — list items
    if (req.method === 'GET' && !isIdPath) {
      requirePermission(session, 'packages', 'read')
      const q = url.searchParams.get('q')
      const page = parseInt(url.searchParams.get('page') || '1')
      const perPage = Math.min(parseInt(url.searchParams.get('per_page') || '50'), 200)
      const type = url.searchParams.get('type')
      const status = url.searchParams.get('status')
      const featured = url.searchParams.get('featured')
      const category = url.searchParams.get('category')
      const sort = url.searchParams.get('sort') || 'newest'

      let query = adminClient
        .from('media_items')
        .select('*', { count: 'exact' })

      if (q) query = query.or(`title.ilike.%${q}%,description.ilike.%${q}%,category.ilike.%${q}%`)
      if (type && type !== 'all') query = query.eq('media_type', type)
      if (status === 'published') query = query.eq('is_published', true)
      else if (status === 'draft') query = query.eq('is_published', false)
      if (featured === 'true') query = query.eq('is_featured', true)
      else if (featured === 'false') query = query.eq('is_featured', false)
      if (category && category !== 'all') query = query.eq('category', category)

      switch (sort) {
        case 'oldest': query = query.order('created_at', { ascending: true }); break
        case 'title_asc': query = query.order('title', { ascending: true }); break
        case 'title_desc': query = query.order('title', { ascending: false }); break
        default: query = query.order('created_at', { ascending: false })
      }

      query = query.range((page - 1) * perPage, page * perPage - 1)
      const { data, error, count } = await query
      if (error) throw new Error(error.message)
      return new Response(JSON.stringify({ items: data ?? [], total: count ?? 0, page, per_page: perPage, pages: Math.ceil((count ?? 0) / perPage) }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // GET /admin-media?id=xxx — get single item
    if (req.method === 'GET' && isIdPath) {
      requirePermission(session, 'packages', 'read')
      const { data, error } = await adminClient.from('media_items').select('*').eq('id', itemId).single()
      if (error) throw new Error(error.message)
      return new Response(JSON.stringify(data), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // POST /admin-media — create item
    if (req.method === 'POST' && !isIdPath) {
      requirePermission(session, 'packages', 'create')
      const body = await req.json()
      const { title, description, category, tags, is_published, is_featured, sort_order, file_data, file_url, file_filename, media_type: forcedType } = body

      let fileUrl = file_url
      let storagePath: string | null = null
      let mimeType: string | null = null
      let fileSize: number | null = null
      let mediaType = forcedType || 'image'

      if (file_data && !fileUrl) {
        const uploaded = await uploadBase64(adminClient, file_data, file_filename || 'upload.bin')
        fileUrl = uploaded.url
        storagePath = uploaded.path
        mimeType = uploaded.mimeType
        fileSize = uploaded.size
        mediaType = forcedType || detectMediaType(uploaded.mimeType)
      }

      if (!fileUrl) {
        return new Response(JSON.stringify({ message: 'File is required.' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      if (!title || !title.trim()) {
        return new Response(JSON.stringify({ message: 'Title is required.' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const insertData: Record<string, unknown> = {
        title: title.trim(),
        description: description || null,
        media_type: mediaType,
        file_url: fileUrl,
        storage_path: storagePath,
        mime_type: mimeType,
        file_size: fileSize,
        category: category || null,
        tags: tags || null,
        is_published: is_published ?? false,
        is_featured: is_featured ?? false,
        sort_order: sort_order ?? 0,
        created_by: user.id,
      }

      const { data, error } = await adminClient
        .from('media_items')
        .insert(insertData)
        .select()
        .single()
      if (error) throw new Error(error.message)

      await logAudit(adminClient, { actor_id: user.id, actor_role: session.role_name, action: 'media.created', resource: 'media', resource_id: data.id, meta: { title: title.trim(), media_type: mediaType } })

      return new Response(JSON.stringify(data), {
        status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // PATCH /admin-media?id=xxx — update item
    if (req.method === 'PATCH' && isIdPath) {
      requirePermission(session, 'packages', 'update')
      const body = await req.json()
      const updates: Record<string, unknown> = {}

      if (body.title !== undefined) updates.title = body.title
      if (body.description !== undefined) updates.description = body.description
      if (body.category !== undefined) updates.category = body.category
      if (body.tags !== undefined) updates.tags = body.tags
      if (body.is_published !== undefined) updates.is_published = body.is_published
      if (body.is_featured !== undefined) updates.is_featured = body.is_featured
      if (body.sort_order !== undefined) updates.sort_order = body.sort_order
      if (body.media_type !== undefined) updates.media_type = body.media_type
      if (body.thumbnail_url !== undefined) updates.thumbnail_url = body.thumbnail_url

      // Handle file replacement
      if (body.file_data && !body.file_url) {
        const uploaded = await uploadBase64(adminClient, body.file_data, body.file_filename || 'upload.bin')
        const newUrl = uploaded.url
        const newPath = uploaded.path
        const newMimeType = uploaded.mimeType
        const newFileSize = uploaded.size
        const newMediaType = body.media_type || detectMediaType(newMimeType)

        // Get old file path before replacing
        const { data: old } = await adminClient.from('media_items').select('storage_path,file_url').eq('id', itemId).single()

        updates.file_url = newUrl
        updates.storage_path = newPath
        updates.mime_type = newMimeType
        updates.file_size = newFileSize
        updates.media_type = newMediaType

        // Remove old storage file (best-effort)
        if (old?.storage_path) {
          try { await adminClient.storage.from('media').remove([old.storage_path]) } catch { /* best-effort */ }
        } else if (old?.file_url) {
          const oldPath = extractStoragePath(old.file_url, 'media')
          if (oldPath) {
            try { await adminClient.storage.from('media').remove([oldPath]) } catch { /* best-effort */ }
          }
        }

        await logAudit(adminClient, { actor_id: user.id, actor_role: session.role_name, action: 'media.file_replaced', resource: 'media', resource_id: itemId })
      } else if (body.file_url !== undefined) {
        updates.file_url = body.file_url
      }

      const { data, error } = await adminClient
        .from('media_items')
        .update(updates)
        .eq('id', itemId)
        .select()
        .single()
      if (error) throw new Error(error.message)

      // Determine audit action
      let auditAction = 'media.updated'
      if (body.is_published === true) auditAction = 'media.published'
      else if (body.is_published === false && !('file_data' in body)) auditAction = 'media.unpublished'
      else if (body.is_featured === true) auditAction = 'media.featured'
      else if (body.is_featured === false && !('file_data' in body)) auditAction = 'media.unfeatured'

      await logAudit(adminClient, { actor_id: user.id, actor_role: session.role_name, action: auditAction, resource: 'media', resource_id: itemId, meta: { changes: Object.keys(updates) } })

      return new Response(JSON.stringify(data), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // DELETE /admin-media?id=xxx — delete item and storage file
    if (req.method === 'DELETE' && isIdPath) {
      requirePermission(session, 'packages', 'delete')
      const { data: item } = await adminClient.from('media_items').select('storage_path,file_url').eq('id', itemId).single()
      const { error } = await adminClient.from('media_items').delete().eq('id', itemId)
      if (error) throw new Error(error.message)

      if (item?.storage_path) {
        try { await adminClient.storage.from('media').remove([item.storage_path]) } catch { /* best-effort */ }
      } else if (item?.file_url) {
        const storagePath = extractStoragePath(item.file_url, 'media')
        if (storagePath) {
          try { await adminClient.storage.from('media').remove([storagePath]) } catch { /* best-effort */ }
        }
      }

      await logAudit(adminClient, { actor_id: user.id, actor_role: session.role_name, action: 'media.deleted', resource: 'media', resource_id: itemId })
      return new Response(JSON.stringify({ message: 'Deleted' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ message: 'Not found' }), {
      status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('admin-media error:', err)
    return new Response(JSON.stringify({ message: 'An unexpected error occurred.', code: 'INTERNAL' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
