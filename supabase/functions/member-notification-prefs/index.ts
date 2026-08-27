import { handleCors, corsHeaders } from '../shared/cors.ts'
import { getAuthenticatedUser, createAdminClient } from '../shared/supabase.ts'

/**
 * Member Notification Preferences
 *
 * GET   /member-notification-prefs         — get current preferences (or defaults)
 * PATCH /member-notification-prefs         — update preferences (upsert)
 */

type NotificationPrefs = {
  email_enabled: boolean
  sms_enabled: boolean
  in_app_enabled: boolean
}

const DEFAULT_PREFS: NotificationPrefs = {
  email_enabled: true,
  sms_enabled: true,
  in_app_enabled: true,
}

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

    // GET — return current preferences or defaults
    if (req.method === 'GET') {
      const { data, error } = await adminClient
        .from('notification_preferences')
        .select('email_enabled, sms_enabled, in_app_enabled')
        .eq('member_id', user.id)
        .single()

      if (error && error.code !== 'PGRST116') {
        throw new Error(error.message)
      }

      const prefs: NotificationPrefs = data
        ? { email_enabled: data.email_enabled, sms_enabled: data.sms_enabled, in_app_enabled: data.in_app_enabled }
        : DEFAULT_PREFS

      return new Response(
        JSON.stringify({ preferences: prefs }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // PATCH — update preferences (upsert)
    if (req.method === 'PATCH') {
      const body = await req.json().catch(() => ({}))

      // Validate: at least one channel must be provided
      const updates: Partial<NotificationPrefs> = {}
      if (typeof body.email_enabled === 'boolean') updates.email_enabled = body.email_enabled
      if (typeof body.sms_enabled === 'boolean') updates.sms_enabled = body.sms_enabled
      if (typeof body.in_app_enabled === 'boolean') updates.in_app_enabled = body.in_app_enabled

      if (Object.keys(updates).length === 0) {
        return new Response(
          JSON.stringify({ message: 'Provide at least one of: email_enabled, sms_enabled, in_app_enabled' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      // Safety: don't let members disable ALL channels
      // First, fetch current prefs (or use defaults)
      const { data: existing } = await adminClient
        .from('notification_preferences')
        .select('email_enabled, sms_enabled, in_app_enabled')
        .eq('member_id', user.id)
        .single()

      const current: NotificationPrefs = existing
        ? { email_enabled: existing.email_enabled, sms_enabled: existing.sms_enabled, in_app_enabled: existing.in_app_enabled }
        : DEFAULT_PREFS

      const merged: NotificationPrefs = { ...current, ...updates }

      // Ensure at least in_app stays enabled (so members can always receive in-app notifications)
      if (!merged.email_enabled && !merged.sms_enabled && !merged.in_app_enabled) {
        return new Response(
          JSON.stringify({
            message: 'You must keep at least one notification channel enabled. In-app notifications cannot be disabled.',
            code: 'VALIDATION_ERROR',
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      // Upsert the preferences
      const { error } = await adminClient
        .from('notification_preferences')
        .upsert(
          {
            member_id: user.id,
            email_enabled: merged.email_enabled,
            sms_enabled: merged.sms_enabled,
            in_app_enabled: merged.in_app_enabled,
          },
          { onConflict: 'member_id' },
        )

      if (error) throw new Error(error.message)

      return new Response(
        JSON.stringify({ preferences: merged, message: 'Preferences updated' }),
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
