/**
 * member-push-subscriptions — Web Push API subscription management
 *
 * GET    /member-push-subscriptions          — Get member's active subscriptions
 * POST   /member-push-subscriptions          — Register a new push subscription
 * DELETE /member-push-subscriptions?id=xxx   — Remove a push subscription
 * DELETE /member-push-subscriptions?all=true — Remove all subscriptions
 *
 * Uses VAPID keys for Web Push authentication.
 * VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must be set as Supabase secrets.
 */

import { handleCors, corsHeaders } from '../shared/cors.ts'
import { getAuthenticatedUser, createAdminClient } from '../shared/supabase.ts'

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const user = await getAuthenticatedUser(req)
    if (!user) {
      return new Response(
        JSON.stringify({ message: 'Not authenticated', code: 'UNAUTHORIZED' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const adminClient = createAdminClient()
    const url = new URL(req.url)

    // GET — return member's active subscriptions
    if (req.method === 'GET') {
      const { data, error } = await adminClient
        .from('push_subscriptions')
        .select('id, endpoint, created_at, user_agent')
        .eq('member_id', user.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false })

      if (error) throw new Error(error.message)

      return new Response(
        JSON.stringify({ subscriptions: data ?? [] }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // POST — register a new push subscription
    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}))
      const { endpoint, p256dh, auth } = body

      // Validate required fields
      if (!endpoint || !p256dh || !auth) {
        return new Response(
          JSON.stringify({ message: 'Missing required fields: endpoint, p256dh, auth' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      // Validate endpoint URL
      try {
        new URL(endpoint)
      } catch {
        return new Response(
          JSON.stringify({ message: 'Invalid endpoint URL' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      // Get user agent for debugging
      const userAgent = req.headers.get('user-agent') ?? ''

      // Upsert subscription (update if endpoint already exists for this member)
      const { data, error } = await adminClient
        .from('push_subscriptions')
        .upsert(
          {
            member_id: user.id,
            endpoint,
            p256dh,
            auth,
            user_agent: userAgent.slice(0, 500),
            is_active: true,
          },
          { onConflict: 'member_id,endpoint' },
        )
        .select('id')
        .single()

      if (error) throw new Error(error.message)

      // Also ensure push_enabled is true in notification preferences
      await adminClient
        .from('notification_preferences')
        .upsert(
          { member_id: user.id, push_enabled: true },
          { onConflict: 'member_id' },
        )

      return new Response(
        JSON.stringify({ id: data.id, message: 'Push subscription registered' }),
        { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // DELETE — remove a subscription
    if (req.method === 'DELETE') {
      const subId = url.searchParams.get('id')
      const all = url.searchParams.get('all') === 'true'

      if (all) {
        // Deactivate all subscriptions for this member
        const { error } = await adminClient
          .from('push_subscriptions')
          .update({ is_active: false })
          .eq('member_id', user.id)

        if (error) throw new Error(error.message)

        return new Response(
          JSON.stringify({ message: 'All push subscriptions deactivated' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      if (!subId) {
        return new Response(
          JSON.stringify({ message: 'Provide subscription id or all=true' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      // Deactivate specific subscription
      const { error } = await adminClient
        .from('push_subscriptions')
        .update({ is_active: false })
        .eq('id', subId)
        .eq('member_id', user.id)

      if (error) throw new Error(error.message)

      return new Response(
        JSON.stringify({ message: 'Push subscription removed' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    return new Response(
      JSON.stringify({ message: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ message: err instanceof Error ? err.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
