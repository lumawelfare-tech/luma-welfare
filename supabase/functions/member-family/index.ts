import { handleCors, corsHeaders } from '../shared/cors.ts'
import { getAuthenticatedUser, createAdminClient, logAudit, handleUnexpectedError } from '../shared/supabase.ts'
import { parseFamilyMemberBody, ValidationError } from '../shared/validate.ts'
import { maskIdNumberLast4 } from '../shared/pii.ts'

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const user = await getAuthenticatedUser(req)
    if (!user) return new Response(JSON.stringify({ message: 'Not authenticated' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const adminClient = createAdminClient()
    const url = new URL(req.url)
    // Use query param resource_id for sub-resource operations (Supabase Edge Functions don't support path params)
    const resourceId = url.searchParams.get('resource_id')

    // GET /member-family — list family members
    if (req.method === 'GET' && !resourceId) {
      const { data, error } = await adminClient
        .from('family_members').select('*').eq('member_id', user.id).eq('is_active', true).order('created_at')
      if (error) throw new Error(error.message)
      const family_members = (data ?? []).map((row: Record<string, unknown>) => {
        const idRaw = typeof row.id_number === 'string' ? row.id_number : null
        const { id_number: _omit, ...rest } = row
        return { ...rest, id_number_masked: maskIdNumberLast4(idRaw) }
      })
      return new Response(JSON.stringify({ family_members }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // POST /member-family — add family member
    if (req.method === 'POST' && !resourceId) {
      const parsed = parseFamilyMemberBody(await req.json())
      const { data, error } = await adminClient
        .from('family_members').insert({
          member_id: user.id,
          full_name: parsed.fullName,
          relationship: parsed.relationship,
          id_number: parsed.idNumber,
          date_of_birth: parsed.dateOfBirth,
          phone: parsed.phone,
          tier: parsed.tier,
          beneficiary_status: parsed.beneficiaryStatus,
        }).select().single()
      if (error) throw new Error(error.message)
      await logAudit(adminClient, { actor_id: user.id, action: 'added_family_member', resource: 'family_member', resource_id: data.id })
      return new Response(JSON.stringify({ family_member: data }), { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // PATCH /member-family?id=xxx — update family member
    if (req.method === 'PATCH' && resourceId) {
      const parsed = parseFamilyMemberBody(await req.json())
      const allowedFields: Record<string, unknown> = {
        full_name: parsed.fullName,
        relationship: parsed.relationship,
        id_number: parsed.idNumber,
        date_of_birth: parsed.dateOfBirth,
        phone: parsed.phone,
        tier: parsed.tier,
        beneficiary_status: parsed.beneficiaryStatus,
      }
      const { data, error } = await adminClient
        .from('family_members').update(allowedFields).eq('id', resourceId).eq('member_id', user.id).select().single()
      if (error) throw new Error('Family member not found')
      await logAudit(adminClient, { actor_id: user.id, action: 'updated_family_member', resource: 'family_member', resource_id: data.id })
      return new Response(JSON.stringify({ family_member: data }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // DELETE /member-family?id=xxx — soft delete
    if (req.method === 'DELETE' && resourceId) {
      const { data, error } = await adminClient
        .from('family_members').update({ is_active: false }).eq('id', resourceId).eq('member_id', user.id).select().single()
      if (error) throw new Error('Family member not found')
      await logAudit(adminClient, { actor_id: user.id, action: 'removed_family_member', resource: 'family_member', resource_id: data.id })
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({ message: 'Not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    if (err instanceof ValidationError) {
      return new Response(JSON.stringify({ message: err.message, code: 'VALIDATION' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    return handleUnexpectedError(err, 'member-family')
  }
})
