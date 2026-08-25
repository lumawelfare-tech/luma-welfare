/**
 * Shared email helper for Luma Welfare Edge Functions.
 * Sends emails via Resend API using the RESEND_API_KEY secret.
 *
 * Current mode: TEST (recipient locked to delivered@resend.dev)
 * Sender: onboarding@resend.dev (Resend test sender)
 *
 * When a custom domain is verified, change SENDER to:
 *   Luma Welfare <noreply@YOURDOMAIN>
 */

const SENDER = 'Luma Welfare <noreply@luma-welfare.vercel.app>'
const TEST_RECIPIENT = 'delivered@resend.dev'
const MAX_SUBJECT = 200
const MAX_HTML = 100_000

export interface EmailResult {
  success: boolean
  id?: string
  error?: string
}

/**
 * Send an email via Resend.
 *
 * In test mode, all emails are sent to delivered@resend.dev regardless
 * of the `to` parameter. The original recipient is included in a note.
 *
 * @param to - Original recipient email (overridden in test mode)
 * @param subject - Email subject line
 * @param html - HTML email body
 * @returns EmailResult with Resend message ID or error
 */
export async function sendEmail(
  to: string,
  subject: string,
  html: string,
): Promise<EmailResult> {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  if (!apiKey) {
    console.error('send-email: RESEND_API_KEY not configured')
    return { success: false, error: 'Email service not configured' }
  }

  // Validate inputs
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return { success: false, error: 'Invalid recipient email' }
  }
  if (!subject || subject.length > MAX_SUBJECT) {
    return { success: false, error: 'Invalid subject' }
  }
  if (!html || html.length > MAX_HTML) {
    return { success: false, error: 'Invalid HTML body' }
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: SENDER,
        to: [TEST_RECIPIENT], // Test mode: override recipient
        subject,
        html,
      }),
    })

    const data = await response.json() as { id?: string; message?: string }

    if (!response.ok) {
      console.error('send-email: Resend API error:', response.status, data.message)
      return { success: false, error: data.message ?? 'Email send failed' }
    }

    return { success: true, id: data.id }
  } catch (err) {
    console.error('send-email: Network error:', err instanceof Error ? err.message : err)
    return { success: false, error: 'Network error sending email' }
  }
}

/**
 * Build an HTML email template for Luma Welfare notifications.
 *
 * @param title - Email heading
 * @param body - Plain text body (will be wrapped in HTML)
 * @param buttonText - Optional CTA button text
 * @param buttonUrl - Optional CTA button URL
 */
export function buildEmailTemplate(
  title: string,
  body: string,
  buttonText?: string,
  buttonUrl?: string,
): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:system-ui,-apple-system,sans-serif;">
  <div style="max-width:600px;margin:40px auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <!-- Header -->
    <div style="background:#6D9B3A;padding:24px 32px;">
      <h1 style="margin:0;color:white;font-size:20px;font-weight:700;">Luma Welfare</h1>
      <p style="margin:4px 0 0;color:rgba(255,255,255,0.8);font-size:13px;">Community Welfare Management</p>
    </div>
    <!-- Content -->
    <div style="padding:32px;">
      <h2 style="margin:0 0 16px;color:#111827;font-size:18px;font-weight:600;">${escapeHtml(title)}</h2>
      <div style="color:#4b5563;font-size:15px;line-height:1.6;white-space:pre-wrap;">${escapeHtml(body)}</div>
      ${buttonText && buttonUrl ? `
      <div style="margin-top:24px;">
        <a href="${escapeHtml(buttonUrl)}" style="display:inline-block;background:#6D9B3A;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">${escapeHtml(buttonText)}</a>
      </div>` : ''}
    </div>
    <!-- Footer -->
    <div style="padding:16px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;">
      <p style="margin:0;color:#9ca3af;font-size:12px;">This is an automated notification from Luma Welfare. Do not reply to this email.</p>
    </div>
  </div>
</body>
</html>`
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
