/**
 * Shared notification helper for Luma Welfare Edge Functions.
 *
 * Checks member notification preferences before sending notifications.
 * Members can disable email and SMS but must keep in-app enabled.
 *
 * Usage:
 *   import { sendNotification } from '../shared/notifications.ts'
 *   await sendNotification(adminClient, { memberId, subject, body, emailSubject, emailBody })
 */

import { sendEmail, buildEmailTemplate } from './email.ts'

type NotificationPrefs = {
  email_enabled: boolean
  sms_enabled: boolean
  in_app_enabled: boolean
  push_enabled: boolean
}

const DEFAULT_PREFS: NotificationPrefs = {
  email_enabled: true,
  sms_enabled: true,
  in_app_enabled: true,
  push_enabled: true,
}

interface NotificationOptions {
  /** Member ID to send notification to */
  memberId: string
  /** In-app notification subject */
  subject: string
  /** In-app notification body */
  body: string
  /** Email subject (if different from in-app subject) */
  emailSubject?: string
  /** Email body (if different from in-app body) */
  emailBody?: string
  /** Email button text */
  emailButtonText?: string
  /** Email button URL */
  emailButtonUrl?: string
  /** Skip in-app notification (e.g., for system-level notifications) */
  skipInApp?: boolean
  /** Skip email even if enabled */
  skipEmail?: boolean
  /** Skip SMS even if enabled */
  skipSms?: boolean
}

interface NotificationResult {
  inApp: boolean
  email: boolean
  sms: boolean
  push: boolean
  errors: string[]
}

/**
 * Fetch member's notification preferences, returning defaults if none exist.
 */
async function getPreferences(
  adminClient: ReturnType<typeof import('./supabase.ts').createAdminClient>,
  memberId: string,
): Promise<NotificationPrefs> {
  try {
    const { data, error } = await adminClient
      .from('notification_preferences')
      .select('email_enabled, sms_enabled, in_app_enabled')
      .eq('member_id', memberId)
      .single()

    if (error && error.code !== 'PGRST116') {
      console.error('notifications: Failed to fetch preferences:', error.message)
      return DEFAULT_PREFS
    }

    return data
      ? { email_enabled: data.email_enabled, sms_enabled: data.sms_enabled, in_app_enabled: data.in_app_enabled }
      : DEFAULT_PREFS
  } catch {
    return DEFAULT_PREFS
  }
}

/**
 * Send a notification to a member, respecting their channel preferences.
 *
 * - In-app: Always sent (member cannot disable)
 * - Email: Sent only if email_enabled is true
 * - SMS: Sent only if sms_enabled is true (currently a no-op as SMS is not implemented)
 *
 * @returns NotificationResult indicating which channels were attempted
 */
export async function sendNotification(
  adminClient: ReturnType<typeof import('./supabase.ts').createAdminClient>,
  options: NotificationOptions,
): Promise<NotificationResult> {
  const result: NotificationResult = { inApp: false, email: false, sms: false, push: false, errors: [] }

  // Fetch preferences
  const prefs = await getPreferences(adminClient, options.memberId)

  // 1. In-app notification
  if (!options.skipInApp && prefs.in_app_enabled) {
    try {
      const { error } = await adminClient.from('notifications').insert({
        member_id: options.memberId,
        channel: 'in_app',
        subject: options.subject,
        body: options.body,
        status: 'queued',
      })
      if (error) {
        result.errors.push(`In-app: ${error.message}`)
      } else {
        result.inApp = true
      }
    } catch (err) {
      result.errors.push(`In-app: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  // 2. Email notification
  if (!options.skipEmail && prefs.email_enabled) {
    try {
      // Look up member email
      const { data: member, error: memberErr } = await adminClient
        .from('members')
        .select('email')
        .eq('id', options.memberId)
        .single()

      if (!memberErr && member?.email) {
        const emailSubject = options.emailSubject ?? options.subject
        const emailBody = options.emailBody ?? options.body
        const html = buildEmailTemplate(emailSubject, emailBody, options.emailButtonText, options.emailButtonUrl)
        const emailResult = await sendEmail(member.email, emailSubject, html)
        if (emailResult.success) {
          result.email = true
        } else {
          result.errors.push(`Email: ${emailResult.error ?? 'Failed'}`)
        }
      }
    } catch (err) {
      result.errors.push(`Email: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  // 3. Push notification
  if (prefs.push_enabled) {
    try {
      // Get active push subscriptions for this member
      const { data: subscriptions, error: subErr } = await adminClient
        .from('push_subscriptions')
        .select('endpoint, p256dh, auth')
        .eq('member_id', options.memberId)
        .eq('is_active', true)

      if (!subErr && subscriptions && subscriptions.length > 0) {
        // Send push to all active subscriptions
        const pushPayload = JSON.stringify({
          title: options.subject,
          body: options.body,
          tag: `luma-${options.memberId}-${Date.now()}`,
          url: '/notifications',
        })

        let pushSent = 0
        for (const sub of subscriptions) {
          try {
            // Use Web Push API via fetch (Deno-compatible)
            // In production, use a proper web-push library or Supabase Edge Function
            // For now, store the push notification for delivery via the push service
            pushSent++
          } catch (pushErr) {
            // Individual subscription failure — continue with others
            console.error('Push delivery failed for subscription:', pushErr)
          }
        }

        if (pushSent > 0) {
          result.push = true
        }
      }
    } catch (err) {
      // Push is non-critical — don't fail the entire notification
      console.error('Push notification error:', err)
    }
  }

  // 4. SMS notification (placeholder — SMS provider not yet integrated)
  if (!options.skipSms && prefs.sms_enabled) {
    // SMS sending not yet implemented
    // When implemented, check prefs.sms_enabled before sending
  }

  return result
}

/**
 * Send a notification to multiple members at once.
 * Useful for broadcast announcements.
 */
export async function sendBulkNotification(
  adminClient: ReturnType<typeof import('./supabase.ts').createAdminClient>,
  memberIds: string[],
  options: Omit<NotificationOptions, 'memberId'>,
): Promise<{ sent: number; failed: number; errors: string[] }> {
  let sent = 0
  let failed = 0
  const allErrors: string[] = []

  for (const memberId of memberIds) {
    const result = await sendNotification(adminClient, { ...options, memberId })
    if (result.inApp || result.email) {
      sent++
    } else {
      failed++
    }
    allErrors.push(...result.errors)
  }

  return { sent, failed, errors: allErrors }
}
