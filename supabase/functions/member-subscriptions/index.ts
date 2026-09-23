import { handleCors, corsHeaders } from '../shared/cors.ts'
import { getAuthenticatedUser, createAdminClient, logAudit, handleUnexpectedError } from '../shared/supabase.ts'
import {
  ageFromDateOfBirth,
  assertTierAllowedForAge,
  tierHasAgeBounds,
} from '../shared/package-tiers.ts'

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  // DELETE — cancel a subscription
  if (req.method === 'DELETE') {
    try {
      const user = await getAuthenticatedUser(req)
      if (!user) return new Response(JSON.stringify({ message: 'Not authenticated' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

      const adminClient = createAdminClient()
      const url = new URL(req.url)
      // Subscription ID from path: /member-subscriptions/{id}
      const pathParts = url.pathname.split('/')
      const subId = pathParts[pathParts.length - 1]

      if (!subId) return new Response(JSON.stringify({ message: 'Subscription ID required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

      // Verify subscription belongs to this member
      const { data: sub, error } = await adminClient
        .from('subscriptions')
        .select('id, member_id, status, packages(name)')
        .eq('id', subId)
        .eq('member_id', user.id)
        .single()

      if (error || !sub) return new Response(JSON.stringify({ message: 'Subscription not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      if (sub.status === 'cancelled') return new Response(JSON.stringify({ message: 'Already cancelled' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

      const { error: cancelErr } = await adminClient
        .from('subscriptions')
        .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
        .eq('id', subId)

      if (cancelErr) throw new Error(cancelErr.message)

      await logAudit(adminClient, { actor_id: user.id, action: 'cancelled_subscription', resource: 'subscription', resource_id: subId })

      return new Response(JSON.stringify({ message: 'Subscription cancelled' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    } catch (err) {
      return handleUnexpectedError(err, 'member-subscriptions')
    }
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ message: 'Method not allowed' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  try {
    const user = await getAuthenticatedUser(req)
    if (!user) return new Response(JSON.stringify({ message: 'Not authenticated' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const adminClient = createAdminClient()
    const body = await req.json()
    const { packageId, packageTierId } = body

    if (!packageId) return new Response(JSON.stringify({ message: 'packageId is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    // Verify member exists and is not suspended/closed
    const { data: member } = await adminClient
      .from('members')
      .select('status, date_of_birth')
      .eq('id', user.id)
      .single()
    if (!member) {
      return new Response(JSON.stringify({ message: 'Member account not found.', code: 'NOT_FOUND' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    if (member.status === 'suspended' || member.status === 'closed') {
      return new Response(JSON.stringify({ message: 'Your account has been ' + member.status + '.', code: 'ACCOUNT_' + member.status.toUpperCase() }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Check registration fee has been paid
    const { data: regFee } = await adminClient
      .from('registration_fees')
      .select('status')
      .eq('member_id', user.id)
      .eq('fee_type', 'registration')
      .maybeSingle()
    if (!regFee || regFee.status !== 'paid') {
      return new Response(JSON.stringify({ message: 'You must pay the registration activation fee before subscribing to packages.', code: 'REGISTRATION_FEE_REQUIRED' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const { data: pkg } = await adminClient
      .from('packages')
      .select('id, is_active, parent_package_id')
      .eq('id', packageId)
      .maybeSingle()
    if (!pkg || !pkg.is_active) {
      return new Response(JSON.stringify({ message: 'Package not found or inactive.', code: 'PACKAGE_NOT_FOUND' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    // Parent packages with children are groupings — join a specific sub-category
    const { count: childCount } = await adminClient
      .from('packages')
      .select('id', { count: 'exact', head: true })
      .eq('parent_package_id', packageId)
      .eq('is_active', true)
    if ((childCount ?? 0) > 0) {
      return new Response(JSON.stringify({
        message: 'Choose a specific Mission of Mercy sub-category (or nested option) rather than the parent package.',
        code: 'JOIN_SUBCATEGORY',
      }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const { data: tiers } = await adminClient
      .from('package_tiers')
      .select('id, name, amount, min_age, max_age, is_active, package_id')
      .eq('package_id', packageId)
      .eq('is_active', true)

    const age = ageFromDateOfBirth(member.date_of_birth as string | null)
    let resolvedTierId: string | null = packageTierId ?? null

    if (resolvedTierId) {
      const selected = (tiers ?? []).find((t) => t.id === resolvedTierId) ?? null
      if (!selected) {
        return new Response(JSON.stringify({ message: 'Invalid contribution tier for this package.', code: 'INVALID_TIER' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      const tierErr = assertTierAllowedForAge(selected, tiers ?? [], age)
      if (tierErr) {
        return new Response(JSON.stringify({ message: tierErr, code: 'TIER_AGE_MISMATCH' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
    } else if ((tiers ?? []).length === 1) {
      const only = tiers![0]
      const tierErr = assertTierAllowedForAge(only, tiers ?? [], age)
      if (tierErr) {
        return new Response(JSON.stringify({ message: tierErr, code: 'TIER_AGE_MISMATCH' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      resolvedTierId = only.id
    } else if ((tiers ?? []).some((t) => tierHasAgeBounds(t))) {
      return new Response(JSON.stringify({
        message: age == null
          ? 'Add your date of birth on your profile before joining a package with age-based pricing.'
          : 'Select a contribution tier for this package.',
        code: age == null ? 'DOB_REQUIRED' : 'TIER_REQUIRED',
      }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Check for existing subscription
    const { data: existing } = await adminClient
      .from('subscriptions').select('id').eq('member_id', user.id).eq('package_id', packageId).maybeSingle()
    if (existing) return new Response(JSON.stringify({ message: 'You are already in this package.', code: 'ALREADY_SUBSCRIBED' }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const { data, error } = await adminClient
      .from('subscriptions').insert({ member_id: user.id, package_id: packageId, package_tier_id: resolvedTierId, status: 'pending' }).select().single()
    if (error) throw new Error(error.message)

    await logAudit(adminClient, { actor_id: user.id, action: 'requested_subscription', resource: 'subscription', resource_id: data.id })
    return new Response(JSON.stringify({ subscription: data }), { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    return handleUnexpectedError(err, 'member-subscriptions')
  }
})
