import { handleCors, corsHeaders } from '../shared/cors.ts'
import { getAuthenticatedUser, createAdminClient, logAudit } from '../shared/supabase.ts'

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  if (req.method !== 'PATCH') {
    return new Response(JSON.stringify({ message: 'Method not allowed' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  try {
    const user = await getAuthenticatedUser(req)
    if (!user) return new Response(JSON.stringify({ message: 'Not authenticated' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const adminClient = createAdminClient()
    const body = await req.json()

    const { data, error } = await adminClient
      .from('members').update({
        full_name: body.fullName, id_number: body.idNumber, alt_phone: body.altPhone,
        date_of_birth: body.dateOfBirth, county: body.county, location: body.location,
        occupation: body.occupation, photo_url: body.photoUrl || null,
      }).eq('id', user.id).select().single()
    if (error) throw new Error(error.message)

    await logAudit(adminClient, { actor_id: user.id, action: 'updated_profile', resource: 'member', resource_id: user.id })
    return new Response(JSON.stringify({ member: data }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    return new Response(JSON.stringify({ message: err instanceof Error ? err.message : 'Internal error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
