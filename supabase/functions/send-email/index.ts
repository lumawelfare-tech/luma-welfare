/**
 * send-email — Resend email delivery for Luma Welfare
 *
 * POST /send-email
 * Body: { to: string, subject: string, html: string }
 *
 * Environment:
 *   RESEND_API_KEY — Resend API secret (server-side only)
 *
 * Current mode: TEST/DEVELOPMENT
 *   Sender: lumawelfare@gmail.com
 *   Allowed recipient: delivered@resend.dev
 *
 * When a custom domain is verified, change the sender to:
 *   Luma Welfare <noreply@YOURDOMAIN>
 */

import { handleCors, corsHeaders } from '../shared/cors.ts'
import { getAuthenticatedUser, createAdminClient, loadAdminSession, requirePermission, logAudit } from '../shared/supabase.ts'

// ─── Configuration ──────────────────────────────────────────

const MAX_SUBJECT_LENGTH = 200
const MAX_HTML_LENGTH = 100_000
const TEST_SENDER = 'Luma Welfare <onboarding@resend.dev>'
const ALLOWED_RECIPIENT = 'delivered@resend.dev'

// ─── Helpers ────────────────────────────────────────────────

function jsonResp(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

// ─── Handler ────────────────────────────────────────────────

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  // Only POST allowed
  if (req.method !== 'POST') {
    return jsonResp({ message: 'Method not allowed' }, 405)
  }

  // ─── Authenticate ──────────────────────────────────────
  try {
    const user = await getAuthenticatedUser(req)
    if (!user) {
      return jsonResp({ message: 'Not authenticated', code: 'UNAUTHORIZED' }, 401)
    }

    const adminClient = createAdminClient()
    const session = await loadAdminSession(adminClient, user.id)
    if (!session) {
      return jsonResp({ message: 'No admin access', code: 'FORBIDDEN' }, 403)
    }

    requirePermission(session, 'members', 'read')

    // ─── Validate RESEND_API_KEY ─────────────────────────
    const apiKey = Deno.env.get('RESEND_API_KEY')
    if (!apiKey) {
      console.error('RESEND_API_KEY is not configured')
      return jsonResp({ message: 'Email service is not configured.', code: 'SERVICE_UNAVAILABLE' }, 503)
    }

    // ─── Parse & validate body ───────────────────────────
    let body: Record<string, unknown>
    try {
      body = await req.json()
    } catch {
      return jsonResp({ message: 'Invalid JSON body.', code: 'VALIDATION' }, 400)
    }

    const { to, subject, html } = body as { to?: string; subject?: string; html?: string }

    // Validate 'to'
    if (!to || typeof to !== 'string' || !validateEmail(to)) {
      return jsonResp({ message: 'A valid "to" email address is required.', code: 'VALIDATION' }, 400)
    }

    // Validate 'subject'
    if (!subject || typeof subject !== 'string' || subject.trim().length === 0) {
      return jsonResp({ message: 'Subject is required.', code: 'VALIDATION' }, 400)
    }
    if (subject.length > MAX_SUBJECT_LENGTH) {
      return jsonResp({ message: `Subject must be ${MAX_SUBJECT_LENGTH} characters or fewer.`, code: 'VALIDATION' }, 400)
    }

    // Validate 'html'
    if (!html || typeof html !== 'string' || html.trim().length === 0) {
      return jsonResp({ message: 'HTML body is required.', code: 'VALIDATION' }, 400)
    }
    if (html.length > MAX_HTML_LENGTH) {
      return jsonResp({ message: `HTML body must be ${MAX_HTML_LENGTH} characters or fewer.`, code: 'VALIDATION' }, 400)
    }

    // ─── Test mode: restrict recipient ───────────────────
    // In test mode, only allow delivered@resend.dev
    const actualTo = ALLOWED_RECIPIENT

    // ─── Send via Resend API ─────────────────────────────
    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: TEST_SENDER,
        to: [actualTo],
        subject,
        html,
      }),
    })

    const resendData = await resendResponse.json() as {
      id?: string
      name?: string
      message?: string
    }

    if (!resendResponse.ok) {
      console.error('Resend API error:', resendResponse.status, resendData.message ?? 'Unknown error')
      return jsonResp({
        message: 'Failed to send email. Please try again later.',
        code: 'EMAIL_SEND_FAILED',
      }, 502)
    }

    // ─── Audit log ──────────────────────────────────────
    await logAudit(adminClient, {
      actor_id: session.id,
      actor_role: session.role_name,
      action: 'email_sent',
      resource: 'email',
      meta: {
        to: actualTo,
        original_to: to,
        subject,
        resend_id: resendData.id,
        test_mode: true,
      },
    })

    // ─── Success response ────────────────────────────────
    return jsonResp({
      message: 'Email sent successfully.',
      id: resendData.id,
      test_mode: true,
      note: `Sent to test recipient (${ALLOWED_RECIPIENT}). Original recipient: ${to}`,
    }, 200)

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    console.error('send-email error:', message)
    return jsonResp({ message: 'An unexpected error occurred.' }, 500)
  }
})
