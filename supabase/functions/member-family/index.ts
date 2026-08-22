import { handleCors, corsHeaders } from '../shared/cors.ts'
import { getAuthenticatedUser, createAdminClient, logAudit } from '../shared/supabase.ts'

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const user = await getAuthenticatedUser(req)
    if (!user) return new Response(JSON.stringify({ message: 'Not authenticated' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const adminClient = createAdminClient()
    const url = new URL(req.url)
    const pathParts = url.pathname.split('/').filter(Boolean)
    const familyId = pathParts[pathParts.length - 1]

    // GET /member-family — list family members
    if (req.method === 'GET' && !familyId) {
      const { data, error } = await adminClient
        .from('family_members').select('*').eq('member_id', user.id).eq('is_active', true).order('created_at')
      if (error) throw new Error(error.message)
      return new Response(JSON.stringify({ family_members: data ?? [] }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // POST /member-family — add family member
    if (req.method === 'POST' && !familyId) {
      const body = await req.json()
      const { data, error } = await adminClient
        .from('family_members').insert({
          member_id: user.id, full_name: body.fullName, relationship: body.relationship,
          id_number: body.idNumber, date_of_birth: body.dateOfBirth, tier: body.tier ?? 'nuclear',
        }).select().single()
      if (error) throw new Error(error.message)
      await logAudit(adminClient, { actor_id: user.id, action: 'added_family_member', resource: 'family_member', resource_id: data.id })
      return new Response(JSON.stringify({ family_member: data }), { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // PATCH /member-family/:id — update family member
    if (req.method === 'PATCH' && familyId) {
      const body = await req.json()
      const { data, error } = await adminClient
        .from('family_members').update(body).eq('id', familyId).eq('member_id', user.id).select().single()
      if (error) throw new Error('Family member not found')
      await logAudit(adminClient, { actor_id: user.id, action: 'updated_family_member', resource: 'family_member', resource_id: data.id })
      return new Response(JSON.stringify({ family_member: data }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // DELETE /member-family/:id — soft delete
    if (req.method === 'DELETE' && familyId) {
      const { data, error } = await adminClient
        .from('family_members').update({ is_active: false }).eq('id', familyId).eq('member_id', user.id).select().single()
      if (error) throw new Error('Family member not found')
      await logAudit(adminClient, { actor_id: user.id, action: 'removed_family_member', resource: 'family_member', resource_id: data.id })
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({ message: 'Not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    return new Response(JSON.stringify({ message: err instanceof Error ? err.message : 'Internal error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
