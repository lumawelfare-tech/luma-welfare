/**
 * send-report-email — Send scheduled report notification emails with Excel attachment
 *
 * POST /send-report-email
 * Body: { schedule_name, report_type, record_count, filename, recipient_email, recipient_name, schedule_id }
 *
 * Downloads the Excel report from Supabase Storage and attaches it to the email.
 * Called by pg_net from the SQL cron function after report generation.
 */

import { handleCors, corsHeaders } from '../shared/cors.ts'
import { sendEmail, buildEmailTemplate, readFileAsAttachment } from '../shared/email.ts'
import { createAdminClient } from '../shared/supabase.ts'

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ message: 'Method not allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const apiKey = Deno.env.get('RESEND_API_KEY')
    if (!apiKey) {
      return new Response(JSON.stringify({ message: 'Email service not configured' }), {
        status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json() as {
      schedule_name?: string
      report_type?: string
      record_count?: number
      filename?: string
      recipient_email?: string
      recipient_name?: string
      schedule_id?: string
    }

    const { schedule_name, report_type, record_count, filename, recipient_email, recipient_name } = body

    if (!schedule_name || !report_type || !recipient_email) {
      return new Response(JSON.stringify({ message: 'schedule_name, report_type, and recipient_email are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const typeLabels: Record<string, string> = {
      'contributions': 'Contributions', 'subscriptions': 'Subscriptions',
      'claims': 'Claims', 'registration-fees': 'Registration Fees',
      'members': 'Members', 'financial': 'Financial Summary',
    }
    const typeLabel = typeLabels[report_type] ?? report_type

    // Build email content
    const subject = `Luma Welfare Report: ${schedule_name}`
    const bodyText = [
      `Hello ${recipient_name || 'there'},`,
      '',
      `Your scheduled report "${schedule_name}" has been generated and is attached to this email.`,
      '',
      `Report Details:`,
      `• Type: ${typeLabel}`,
      `• Records: ${(record_count ?? 0).toLocaleString()}`,
      `• File: ${filename ?? 'N/A'}`,
      `• Generated: ${new Date().toLocaleDateString('en-KE', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`,
      '',
      `You can also download this report from the Scheduled Reports section of your admin dashboard.`,
      '',
      `Best regards,`,
      `Luma Welfare Team`,
    ].join('\n')

    const html = buildEmailTemplate(
      `Report Ready: ${schedule_name}`,
      `Hello ${recipient_name || 'there'},\n\nYour scheduled report "${schedule_name}" has been generated and is attached to this email.\n\nReport Details:\n• Type: ${typeLabel}\n• Records: ${(record_count ?? 0).toLocaleString()}\n• File: ${filename ?? 'N/A'}\n• Generated: ${new Date().toLocaleDateString('en-KE', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}\n\nYou can also download this report from the Scheduled Reports section of your admin dashboard.`,
      'View Reports',
      'https://luma-welfare.vercel.app/admin/scheduled-reports',
    )

    // Try to read the report file from Storage for attachment
    const adminClient = createAdminClient()
    let attachments: Awaited<ReturnType<typeof readFileAsAttachment>>[] = []

    if (filename) {
      // Search for the file in any user folder
      const { data: files } = await adminClient.storage.from('report-files').list('', { search: filename })
      if (files && files.length > 0) {
        const attachment = await readFileAsAttachment(adminClient, 'report-files', files[0].name)
        if (attachment) {
          attachments = [attachment]
        }
      }
    }

    // Send email with attachment
    const result = await sendEmail(recipient_email, subject, html, attachments.length > 0 ? attachments as NonNullable<Awaited<ReturnType<typeof readFileAsAttachment>>[]> : undefined)

    if (!result.success) {
      console.error('send-report-email: Failed to send:', result.error)
      return new Response(JSON.stringify({ message: 'Failed to send email', error: result.error }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Audit log
    await adminClient.from('audit_logs').insert({
      action: 'report_email_sent',
      resource: 'email',
      meta: {
        schedule_name, report_type, record_count: record_count ?? 0,
        filename, recipient_email, resend_id: result.id,
        attachment_attached: attachments.length > 0,
      },
    })

    return new Response(JSON.stringify({
      message: 'Email sent successfully',
      id: result.id,
      attachment_attached: attachments.length > 0,
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    console.error('send-report-email error:', message)
    return new Response(JSON.stringify({ message: 'An unexpected error occurred' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
