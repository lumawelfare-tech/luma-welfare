import { handleCors, corsHeaders } from '../shared/cors.ts'
import { getAuthenticatedUser, createAdminClient, loadAdminSession, requirePermission, logAudit } from '../shared/supabase.ts'

/**
 * Admin Scheduled Reports
 *
 * GET    /admin-scheduled-reports              — list all schedules
 * POST   /admin-scheduled-reports              — create a schedule
 * PATCH  /admin-scheduled-reports?id=xxx       — update a schedule
 * DELETE /admin-scheduled-reports?id=xxx       — delete a schedule
 * POST   /admin-scheduled-reports?id=xxx&action=generate  — generate report now
 * GET    /admin-scheduled-reports?id=xxx&action=download   — download generated report
 */

function computeNextRun(frequency: string, from?: Date): Date {
  const d = from ?? new Date()
  switch (frequency) {
    case 'daily': d.setDate(d.getDate() + 1); break
    case 'weekly': d.setDate(d.getDate() + 7); break
    case 'monthly': d.setMonth(d.getMonth() + 1); break
    case 'quarterly': d.setMonth(d.getMonth() + 3); break
  }
  // Set to 6:00 AM UTC
  d.setHours(6, 0, 0, 0)
  return d
}

function buildReportFilename(name: string, type: string): string {
  const slug = name.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 40)
  const date = new Date().toISOString().split('T')[0]
  return `${slug}_${type}_${date}.csv`
}

function escapeCSV(val: string): string {
  if (/^[=+\-@\t\r]/.test(val)) return `'${val}`
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`
  }
  return val
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const user = await getAuthenticatedUser(req)
    if (!user) {
      return new Response(JSON.stringify({ message: 'Not authenticated' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const adminClient = createAdminClient()
    const session = await loadAdminSession(adminClient, user.id)
    if (!session) {
      return new Response(JSON.stringify({ message: 'No admin access' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    requirePermission(session, 'members', 'read')

    const url = new URL(req.url)
    const id = url.searchParams.get('id')
    const action = url.searchParams.get('action')

    // ─── LIST ───────────────────────────────────────────
    if (req.method === 'GET' && !id) {
      const { data, error } = await adminClient
        .from('scheduled_reports')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw new Error(error.message)

      return new Response(JSON.stringify({ schedules: data ?? [] }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ─── CREATE ─────────────────────────────────────────
    if (req.method === 'POST' && !id) {
      const body = await req.json()
      const { name, report_type, filters, frequency, recipients } = body

      if (!name || !report_type || !frequency) {
        return new Response(JSON.stringify({ message: 'name, report_type, and frequency are required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const nextRun = computeNextRun(frequency)

      const { data, error } = await adminClient
        .from('scheduled_reports')
        .insert({
          name,
          report_type,
          filters: filters ?? {},
          frequency,
          recipients: recipients ?? [],
          enabled: true,
          next_run_at: nextRun.toISOString(),
          created_by: user.id,
        })
        .select()
        .single()

      if (error) throw new Error(error.message)

      await logAudit(adminClient, {
        actor_id: session.id, actor_role: session.role_name,
        action: 'scheduled_report_created', resource: 'scheduled_report',
        meta: { id: data.id, name, report_type, frequency },
      })

      return new Response(JSON.stringify({ schedule: data }), {
        status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ─── UPDATE ─────────────────────────────────────────
    if (req.method === 'PATCH' && id) {
      const body = await req.json()
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }

      if (body.name !== undefined) updates.name = body.name
      if (body.report_type !== undefined) updates.report_type = body.report_type
      if (body.filters !== undefined) updates.filters = body.filters
      if (body.frequency !== undefined) {
        updates.frequency = body.frequency
        updates.next_run_at = computeNextRun(body.frequency).toISOString()
      }
      if (body.recipients !== undefined) updates.recipients = body.recipients
      if (body.enabled !== undefined) updates.enabled = body.enabled

      const { data, error } = await adminClient
        .from('scheduled_reports')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

      if (error) throw new Error(error.message)

      await logAudit(adminClient, {
        actor_id: session.id, actor_role: session.role_name,
        action: 'scheduled_report_updated', resource: 'scheduled_report',
        meta: { id, updates: Object.keys(updates) },
      })

      return new Response(JSON.stringify({ schedule: data }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ─── DELETE ─────────────────────────────────────────
    if (req.method === 'DELETE' && id) {
      const { error } = await adminClient
        .from('scheduled_reports')
        .delete()
        .eq('id', id)

      if (error) throw new Error(error.message)

      await logAudit(adminClient, {
        actor_id: session.id, actor_role: session.role_name,
        action: 'scheduled_report_deleted', resource: 'scheduled_report',
        meta: { id },
      })

      return new Response(JSON.stringify({ message: 'Deleted' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ─── GENERATE NOW ───────────────────────────────────
    if (req.method === 'POST' && id && action === 'generate') {
      // Fetch the schedule
      const { data: schedule, error: schedErr } = await adminClient
        .from('scheduled_reports')
        .select('*')
        .eq('id', id)
        .single()

      if (schedErr || !schedule) {
        return new Response(JSON.stringify({ message: 'Schedule not found' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Generate report data based on type
      const filters = schedule.filters as Record<string, string>
      let reportData: unknown[] = []
      const reportType = schedule.report_type

      if (reportType === 'contributions') {
        let q = adminClient.from('contributions')
          .select('id, period, amount, status, notes, created_at, members(full_name, phone, membership_number), packages(code, name)')
          .order('created_at', { ascending: false })
        if (filters.status) q = q.eq('status', filters.status)
        if (filters.dateFrom) q = q.gte('created_at', filters.dateFrom)
        if (filters.dateTo) q = q.lte('created_at', filters.dateTo + 'T23:59:59')
        const { data } = await q.limit(1000)
        reportData = data ?? []
      } else if (reportType === 'subscriptions') {
        let q = adminClient.from('subscriptions')
          .select('id, status, started_at, next_due_date, cancelled_at, created_at, members(full_name, phone, email), packages(code, name), package_tiers(name, amount)')
          .order('created_at', { ascending: false })
        if (filters.status) q = q.eq('status', filters.status)
        if (filters.dateFrom) q = q.gte('created_at', filters.dateFrom)
        if (filters.dateTo) q = q.lte('created_at', filters.dateTo + 'T23:59:59')
        const { data } = await q.limit(1000)
        reportData = data ?? []
      } else if (reportType === 'claims') {
        let q = adminClient.from('claims')
          .select('id, claim_number, claim_type, amount_requested, status, created_at, submitted_at, decided_at, members(full_name, phone, email), packages(code, name)')
          .order('created_at', { ascending: false })
        if (filters.status) q = q.eq('status', filters.status)
        if (filters.dateFrom) q = q.gte('created_at', filters.dateFrom)
        if (filters.dateTo) q = q.lte('created_at', filters.dateTo + 'T23:59:59')
        const { data } = await q.limit(1000)
        reportData = data ?? []
      } else if (reportType === 'registration-fees') {
        let q = adminClient.from('registration_fees')
          .select('id, amount, currency, status, payment_method, mpesa_receipt, paid_at, created_at, members(full_name, phone, email, membership_number)')
          .eq('fee_type', 'registration')
          .order('created_at', { ascending: false })
        if (filters.status) q = q.eq('status', filters.status)
        if (filters.dateFrom) q = q.gte('created_at', filters.dateFrom)
        if (filters.dateTo) q = q.lte('created_at', filters.dateTo + 'T23:59:59')
        const { data } = await q.limit(1000)
        reportData = data ?? []
      } else if (reportType === 'members') {
        let q = adminClient.from('members')
          .select('id, membership_number, full_name, phone, email, status, joined_at, created_at')
          .order('created_at', { ascending: false })
        if (filters.status) q = q.eq('status', filters.status)
        if (filters.dateFrom) q = q.gte('created_at', filters.dateFrom)
        if (filters.dateTo) q = q.lte('created_at', filters.dateTo + 'T23:59:59')
        const { data } = await q.limit(1000)
        reportData = data ?? []
      } else if (reportType === 'financial') {
        const [regFees, contribs, claims] = await Promise.all([
          adminClient.from('registration_fees').select('status, amount').eq('fee_type', 'registration'),
          adminClient.from('contributions').select('status, amount'),
          adminClient.from('claims').select('status, amount_requested'),
        ])
        const totalRegFees = (regFees.data ?? []).filter(f => f.status === 'paid').reduce((s, f) => s + Number(f.amount), 0)
        const totalContribs = (contribs.data ?? []).filter(c => c.status === 'Verified' || c.status === 'Paid').reduce((s, c) => s + Number(c.amount), 0)
        const totalClaims = (claims.data ?? []).filter(c => c.status === 'Approved' || c.status === 'Paid').reduce((s, c) => s + Number(c.amount_requested ?? 0), 0)
        reportData = [
          { metric: 'Registration Fees Collected', value: totalRegFees },
          { metric: 'Total Contributions', value: totalContribs },
          { metric: 'Total Claims Approved', value: totalClaims },
          { metric: 'Registration Fees Paid', value: (regFees.data ?? []).filter(f => f.status === 'paid').length },
          { metric: 'Contributions Verified', value: (contribs.data ?? []).filter(c => c.status === 'Verified' || c.status === 'Paid').length },
          { metric: 'Claims Approved', value: (claims.data ?? []).filter(c => c.status === 'Approved' || c.status === 'Paid').length },
        ]
      }

      // Flatten nested objects for CSV
      const flatData = reportData.map((row: Record<string, unknown>) => {
        const flat: Record<string, string | number | null> = {}
        for (const [key, val] of Object.entries(row)) {
          if (val && typeof val === 'object' && !Array.isArray(val)) {
            for (const [subKey, subVal] of Object.entries(val as Record<string, unknown>)) {
              if (subKey === 'id') continue
              flat[`${key}_${subKey}`] = subVal as string | number | null
            }
          } else {
            flat[key] = val as string | number | null
          }
        }
        return flat
      })

      // Build CSV
      if (flatData.length > 0) {
        const headers = Object.keys(flatData[0])
        const csv = [
          `Luma Welfare — ${schedule.name}`,
          `Report Type: ${schedule.report_type}`,
          `Generated: ${new Date().toLocaleDateString('en-KE', { year: 'numeric', month: 'long', day: 'numeric' })}`,
          '',
          headers.map(escapeCSV).join(','),
          ...flatData.map(row => headers.map(h => escapeCSV(String(row[h] ?? ''))).join(',')),
        ].join('\n')

        const filename = buildReportFilename(schedule.name, schedule.report_type)

        // Upload to storage
        const { error: uploadErr } = await adminClient.storage
          .from('report-files')
          .upload(`${user.id}/${filename}`, csv, {
            contentType: 'text/csv',
            upsert: true,
          })

        if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`)

        // Update schedule
        const nextRun = computeNextRun(schedule.frequency)
        await adminClient
          .from('scheduled_reports')
          .update({
            last_generated_at: new Date().toISOString(),
            next_run_at: nextRun.toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', id)

        await logAudit(adminClient, {
          actor_id: session.id, actor_role: session.role_name,
          action: 'report_generated', resource: 'scheduled_report',
          meta: { id, name: schedule.name, type: schedule.report_type, records: flatData.length, filename },
        })

        return new Response(JSON.stringify({
          message: 'Report generated',
          filename,
          records: flatData.length,
          storage_path: `${user.id}/${filename}`,
        }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      return new Response(JSON.stringify({ message: 'No data to report', records: 0 }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ─── DOWNLOAD ───────────────────────────────────────
    if (req.method === 'GET' && id && action === 'download') {
      const filename = url.searchParams.get('file')
      if (!filename) {
        return new Response(JSON.stringify({ message: 'filename query param required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Sanitize path - prevent directory traversal
      const safePath = `${user.id}/${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`

      const { data, error } = await adminClient.storage
        .from('report-files')
        .download(safePath)

      if (error || !data) {
        return new Response(JSON.stringify({ message: 'File not found' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      return new Response(data, {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      })
    }

    return new Response(JSON.stringify({ message: 'Not found' }), {
      status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return new Response(JSON.stringify({ message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
