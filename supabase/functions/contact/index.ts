/**
 * contact — public contact-form inbox delivery (Resend).
 *
 * POST /contact
 * Body: { name, email, subject, message, phone?, company? }
 *   `company` is a honeypot — if filled, respond success without sending.
 *
 * Env: RESEND_API_KEY, EMAIL_FROM (optional), CONTACT_INBOX (optional inbox)
 * Gateway: verify_jwt = false (rate-limited in-function)
 */

import { handleCors, corsHeaders } from '../shared/cors.ts'
import { sendEmail } from '../shared/email.ts'
import { rateLimitAsync } from '../shared/rate-limit.ts'

const MAX_NAME = 100
const MAX_SUBJECT = 120
const MAX_MESSAGE = 2000
const MAX_PHONE = 30
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function json(status: number, payload: Record<string, unknown>): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function asTrimmedString(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > max) return null
  return trimmed
}

function inboxAddress(): string {
  const configured = Deno.env.get('CONTACT_INBOX')?.trim()
  if (configured && EMAIL_RE.test(configured)) return configured
  return 'info@lumawelfare.or.ke'
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  const limit = await rateLimitAsync(req, 'contact', { windowMs: 600_000, max: 5 })
  if (!limit.ok) return limit.response!

  if (req.method !== 'POST') {
    return json(405, { message: 'Method not allowed' })
  }

  let raw: Record<string, unknown>
  try {
    raw = await req.json() as Record<string, unknown>
  } catch {
    return json(400, { message: 'Invalid JSON body.', code: 'VALIDATION' })
  }

  // Honeypot: bots often fill hidden "company" fields
  const honeypot = typeof raw.company === 'string' ? raw.company.trim() : ''
  if (honeypot) {
    return json(200, { message: 'Thank you. Your message has been sent.', code: 'OK' })
  }

  const name = asTrimmedString(raw.name, MAX_NAME)
  const email = asTrimmedString(raw.email, 254)
  const subject = asTrimmedString(raw.subject, MAX_SUBJECT)
  const message = asTrimmedString(raw.message, MAX_MESSAGE)
  const phoneRaw = typeof raw.phone === 'string' ? raw.phone.trim() : ''
  const phone = phoneRaw ? phoneRaw.slice(0, MAX_PHONE) : ''

  if (!name || name.length < 2) {
    return json(400, { message: 'Please enter your full name.', code: 'VALIDATION' })
  }
  if (!email || !EMAIL_RE.test(email)) {
    return json(400, { message: 'Please enter a valid email address.', code: 'VALIDATION' })
  }
  if (!subject || subject.length < 3) {
    return json(400, { message: 'Please enter a subject.', code: 'VALIDATION' })
  }
  if (!message || message.length < 10) {
    return json(400, { message: 'Please enter a message (at least 10 characters).', code: 'VALIDATION' })
  }

  const safeName = escapeHtml(name)
  const safeEmail = escapeHtml(email)
  const safeSubject = escapeHtml(subject)
  const safePhone = phone ? escapeHtml(phone) : ''
  const safeMessage = escapeHtml(message).replace(/\n/g, '<br>')

  const html = `
    <div style="font-family:system-ui,sans-serif;line-height:1.5;color:#111">
      <h2 style="margin:0 0 12px;color:#006B2E">New website contact message</h2>
      <p style="margin:0 0 8px"><strong>Name:</strong> ${safeName}</p>
      <p style="margin:0 0 8px"><strong>Email:</strong> ${safeEmail}</p>
      ${safePhone ? `<p style="margin:0 0 8px"><strong>Phone:</strong> ${safePhone}</p>` : ''}
      <p style="margin:0 0 8px"><strong>Subject:</strong> ${safeSubject}</p>
      <hr style="border:none;border-top:1px solid #ddd;margin:16px 0" />
      <p style="margin:0;white-space:pre-wrap">${safeMessage}</p>
    </div>
  `

  const result = await sendEmail(
    inboxAddress(),
    `Contact: ${subject.slice(0, 80)}`,
    html,
    undefined,
    email,
  )

  if (!result.success) {
    console.error('contact: send failed', result.error ?? 'unknown')
    return json(503, {
      message: 'Unable to send your message right now. Please try WhatsApp or email instead.',
      code: 'EMAIL_UNAVAILABLE',
    })
  }

  return json(200, { message: 'Thank you. Your message has been sent.', code: 'OK' })
})
