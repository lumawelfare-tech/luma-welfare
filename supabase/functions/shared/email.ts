/**
 * Shared email helper for Luma Welfare Edge Functions.
 * Sends emails via Resend API using the RESEND_API_KEY secret.
 *
 * Sender: Luma Welfare <noreply@luma-welfare.vercel.app>
 * Test mode: set EMAIL_TEST_MODE=true to force all mail to delivered@resend.dev
 * (sandbox testing). Default (unset/false) delivers to real recipients.
 */

const SENDER = 'Luma Welfare <noreply@luma-welfare.vercel.app>'
const TEST_RECIPIENT = 'delivered@resend.dev'
const MAX_SUBJECT = 200
const MAX_HTML = 100_000

export interface EmailAttachment {
  filename: string
  content: string // base64-encoded
  contentType: string
}

export interface EmailResult {
  success: boolean
  id?: string
  error?: string
}

/**
 * Send an email via Resend, optionally with file attachments.
 *
 * @param to - Recipient email (overridden only when EMAIL_TEST_MODE=true)
 * @param subject - Email subject line
 * @param html - HTML email body
 * @param attachments - Optional array of file attachments
 */
export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  attachments?: EmailAttachment[],
): Promise<EmailResult> {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  if (!apiKey) {
    console.error('send-email: RESEND_API_KEY not configured')
    return { success: false, error: 'Email service not configured' }
  }

  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return { success: false, error: 'Invalid recipient email' }
  }
  if (!subject || subject.length > MAX_SUBJECT) {
    return { success: false, error: 'Invalid subject' }
  }
  if (!html || html.length > MAX_HTML) {
    return { success: false, error: 'Invalid HTML body' }
  }

  const testMode = (Deno.env.get('EMAIL_TEST_MODE') ?? '').toLowerCase() === 'true'
  const recipient = testMode ? TEST_RECIPIENT : to

  try {
    const payload: Record<string, unknown> = {
      from: SENDER,
      to: [recipient],
      subject,
      html,
    }

    // Add attachments if provided (Resend supports up to 10MB total)
    if (attachments && attachments.length > 0) {
      payload.attachments = attachments.map(a => ({
        filename: a.filename,
        content: a.content,
        content_type: a.contentType,
      }))
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
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
 * Read a file from Supabase Storage and return as base64 attachment.
 */
export async function readFileAsAttachment(
  adminClient: ReturnType<typeof import('../shared/supabase.ts').createAdminClient>,
  bucket: string,
  path: string,
): Promise<EmailAttachment | null> {
  try {
    const { data: blob, error } = await adminClient.storage.from(bucket).download(path)
    if (error || !blob) return null

    const buffer = await blob.arrayBuffer()
    const bytes = new Uint8Array(buffer)
    let binary = ''
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    const base64 = btoa(binary)

    // Determine content type from filename
    const ext = path.split('.').pop()?.toLowerCase() ?? ''
    const contentTypes: Record<string, string> = {
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      csv: 'text/csv',
      pdf: 'application/pdf',
      zip: 'application/zip',
    }

    return {
      filename: path.split('/').pop() ?? path,
      content: base64,
      contentType: contentTypes[ext] ?? 'application/octet-stream',
    }
  } catch {
    return null
  }
}

/**
 * Build an HTML email template for Luma Welfare notifications.
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
    <div style="background:#6D9B3A;padding:24px 32px;">
      <h1 style="margin:0;color:white;font-size:20px;font-weight:700;">Luma Welfare</h1>
      <p style="margin:4px 0 0;color:rgba(255,255,255,0.8);font-size:13px;">Community Welfare Management</p>
    </div>
    <div style="padding:32px;">
      <h2 style="margin:0 0 16px;color:#111827;font-size:18px;font-weight:600;">${escapeHtml(title)}</h2>
      <div style="color:#4b5563;font-size:15px;line-height:1.6;white-space:pre-wrap;">${escapeHtml(body)}</div>
      ${buttonText && buttonUrl ? `
      <div style="margin-top:24px;">
        <a href="${escapeHtml(buttonUrl)}" style="display:inline-block;background:#6D9B3A;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">${escapeHtml(buttonText)}</a>
      </div>` : ''}
    </div>
    <div style="padding:16px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;">
      <p style="margin:0;color:#9ca3af;font-size:12px;">This is an automated notification from Luma Welfare. Do not reply to this email.</p>
    </div>
  </div>
</body>
</html>`
}

/**
 * Build the branded OTP verification email.
 * Renders the 6-digit code prominently with expiry and safety notices.
 */
export function buildOtpEmail(code: string, expiresInMinutes: number): string {
  const digits = code
    .split('')
    .map((d) =>
      `<td align="center" style="padding:0 4px;"><div style="width:52px;height:64px;line-height:64px;background:#f0f5ec;border:1px solid #cfe0c3;border-radius:10px;font-family:'Courier New',monospace;font-size:30px;font-weight:700;color:#1f2937;">${d}</div></td>`
    )
    .join('')

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:system-ui,-apple-system,sans-serif;">
  <div style="max-width:600px;margin:40px auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <div style="background:#6D9B3A;padding:24px 32px;">
      <h1 style="margin:0;color:white;font-size:20px;font-weight:700;">Luma Welfare</h1>
      <p style="margin:4px 0 0;color:rgba(255,255,255,0.85);font-size:13px;">Community Welfare Society</p>
    </div>
    <div style="padding:32px;">
      <h2 style="margin:0 0 16px;color:#111827;font-size:18px;font-weight:600;">Verify Your Email</h2>
      <p style="margin:0 0 20px;color:#4b5563;font-size:15px;line-height:1.6;">
        Your verification code is:
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto 20px;">
        <tr>${digits}</tr>
      </table>
      <p style="margin:0 0 8px;color:#4b5563;font-size:14px;line-height:1.6;">
        This code expires in <strong>${expiresInMinutes} minutes</strong>.
      </p>
      <p style="margin:0;color:#9ca3af;font-size:13px;line-height:1.6;">
        If you did not request this code, please ignore this email.
      </p>
    </div>
    <div style="padding:16px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;">
      <p style="margin:0 0 4px;color:#9ca3af;font-size:12px;">This is an automated notification from Luma Welfare. Do not reply to this email.</p>
      <p style="margin:0;color:#9ca3af;font-size:12px;">&copy; Luma Welfare</p>
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
