import { handleCors, corsHeaders } from '../shared/cors.ts'
import { getAuthenticatedUser, createAdminClient, logAudit } from '../shared/supabase.ts'

/**
 * Member Profile — Update profile and upload avatar
 *
 * PATCH /member-profile              — update profile fields
 * POST  /member-profile?action=avatar — upload avatar image
 */

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const user = await getAuthenticatedUser(req)
    if (!user) return new Response(JSON.stringify({ message: 'Not authenticated' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const adminClient = createAdminClient()
    const url = new URL(req.url)

    // POST — upload avatar
    if (req.method === 'POST' && url.searchParams.get('action') === 'avatar') {
      const body = await req.json()
      const { fileName, fileData, fileType } = body

      if (!fileName || !fileData) {
        return new Response(JSON.stringify({ message: 'fileName and fileData (base64) are required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Validate file size (< 5MB)
      const decodedSize = Math.ceil((fileData.length * 3) / 4)
      if (decodedSize > 5 * 1024 * 1024) {
        return new Response(JSON.stringify({ message: 'File size must be under 5MB' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Validate file type
      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']
      if (!allowedTypes.includes(fileType)) {
        return new Response(JSON.stringify({ message: 'Only JPG, PNG, and WebP images are allowed' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Decode base64
      const binaryStr = atob(fileData)
      const bytes = new Uint8Array(binaryStr.length)
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i)
      }

      // Generate storage path
      const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
      const ext = safeName.split('.').pop() ?? 'jpg'
      const storagePath = `${user.id}/avatar.${ext}`

      // Delete old avatar if exists
      try {
        const { data: existingFiles } = await adminClient.storage
          .from('avatars')
          .list(user.id)
        if (existingFiles && existingFiles.length > 0) {
          const paths = existingFiles.map((f: { name: string }) => `${user.id}/${f.name}`)
          await adminClient.storage.from('avatars').remove(paths)
        }
      } catch { /* best effort cleanup */ }

      // Upload to Supabase Storage
      const { error: uploadErr } = await adminClient.storage
        .from('avatars')
        .upload(storagePath, bytes, {
          contentType: fileType,
          upsert: true,
        })

      if (uploadErr) {
        throw new Error(`Storage upload failed: ${uploadErr.message}`)
      }

      // Get public URL
      const { data: urlData } = adminClient.storage
        .from('avatars')
        .getPublicUrl(storagePath)

      const avatarUrl = urlData.publicUrl

      // Update member profile with photo_url
      const { error: updateErr } = await adminClient
        .from('members')
        .update({ photo_url: avatarUrl })
        .eq('id', user.id)

      if (updateErr) throw new Error(updateErr.message)

      await logAudit(adminClient, {
        actor_id: user.id,
        action: 'avatar_updated',
        resource: 'member',
        resource_id: user.id,
        meta: { avatar_url: avatarUrl },
      })

      return new Response(JSON.stringify({ photo_url: avatarUrl }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // PATCH — update profile fields
    if (req.method === 'PATCH') {
      const body = await req.json()

      const { data, error } = await adminClient
        .from('members').update({
          full_name: body.fullName, id_number: body.idNumber, alt_phone: body.altPhone,
          date_of_birth: body.dateOfBirth, county: body.county, location: body.location,
          occupation: body.occupation, photo_url: body.photoUrl || undefined,
        }).eq('id', user.id).select().single()
      if (error) throw new Error(error.message)

      await logAudit(adminClient, { actor_id: user.id, action: 'updated_profile', resource: 'member', resource_id: user.id })
      return new Response(JSON.stringify({ member: data }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({ message: 'Method not allowed' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    return new Response(JSON.stringify({ message: err instanceof Error ? err.message : 'Internal error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
