import { handleCors, corsHeaders } from '../shared/cors.ts'
import { getAuthenticatedUser, createAdminClient, loadAdminSession, requirePermission, logAudit } from '../shared/supabase.ts'

/**
 * Admin Scheduled Reports
 *
 * GET    /admin-scheduled-reports                          — list schedules
 * POST   /admin-scheduled-reports                          — create schedule
 * PATCH  /admin-scheduled-reports?id=xxx                   — update schedule
 * DELETE /admin-scheduled-reports?id=xxx                   — delete schedule
 * POST   /admin-scheduled-reports?id=xxx&action=generate   — generate now
 * GET    /admin-scheduled-reports?action=history           — search/filter history
 * POST   /admin-scheduled-reports?action=bulk-download     — bulk download as ZIP
 * POST   /admin-scheduled-reports?action=cleanup           — delete history + storage
 * POST   /admin-scheduled-reports?action=process-all       — process all due
 */

// ─── Excel XML Generation (no external deps) ───────────────

function escapeXml(val: string): string {
  return val.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function buildExcelXml(title: string, headers: string[], rows: (string | number | null)[][]): string {
  const colCount = headers.length
  const colWidths = headers.map((h, i) => {
    const maxLen = Math.max(h.length, ...rows.map(r => String(r[i] ?? '').length))
    return Math.min(Math.max(maxLen + 2, 10), 50)
  })

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Styles>
    <Style ss:ID="header"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#6D9B3A" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center"/></Style>
    <Style ss:ID="currency"><NumberFormat ss:Format="#,##0"/></Style>
    <Style ss:ID="date"><NumberFormat ss:Format="yyyy-mm-dd hh:mm"/></Style>
  </Styles>
  <Worksheet ss:Name="${escapeXml(title.substring(0, 31))}">
    <Table ss:DefaultColumnWidth="80">`

  // Column widths
  for (const w of colWidths) {
    xml += `\n      <Column ss:Width="${w * 7}"/>`
  }

  // Header row
  xml += `\n      <Row ss:StyleID="header">`
  for (const h of headers) {
    xml += `<Cell ss:StyleID="header"><Data ss:Type="String">${escapeXml(h)}</Data></Cell>`
  }
  xml += `</Row>`

  // Data rows
  for (const row of rows) {
    xml += `\n      <Row>`
    for (let i = 0; i < colCount; i++) {
      const val = row[i]
      if (val == null || val === '') {
        xml += `<Cell><Data ss:Type="String"></Data></Cell>`
      } else if (typeof val === 'number') {
        xml += `<Cell ss:StyleID="currency"><Data ss:Type="Number">${val}</Data></Cell>`
      } else {
        const s = String(val)
        const num = Number(s)
        if (!isNaN(num) && s !== '' && s.match(/^-?\d+(\.\d+)?$/)) {
          xml += `<Cell><Data ss:Type="Number">${num}</Data></Cell>`
        } else {
          xml += `<Cell><Data ss:Type="String">${escapeXml(s)}</Data></Cell>`
        }
      }
    }
    xml += `</Row>`
  }

  xml += `\n    </Table>\n  </Worksheet>\n</Workbook>`
  return xml
}

// ─── ZIP Creation (minimal ZIP64-compatible) ────────────────

function crc32(data: Uint8Array): number {
  let crc = 0xFFFFFFFF
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
    table[i] = c
  }
  for (let i = 0; i < data.length; i++) {
    crc = table[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8)
  }
  return (crc ^ 0xFFFFFFFF) >>> 0
}

function createZip(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const encoder = new TextEncoder()
  const localHeaders: Uint8Array[] = []
  const centralHeaders: Uint8Array[] = []
  const fileDataParts: Uint8Array[] = []
  let offset = 0

  for (const file of files) {
    const nameBytes = encoder.encode(file.name)
    const crc = crc32(file.data)
    const size = file.data.length

    // Local file header
    const local = new Uint8Array(30 + nameBytes.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true) // signature
    lv.setUint16(4, 20, true) // version needed
    lv.setUint16(6, 0, true) // flags
    lv.setUint16(8, 0, true) // compression (stored)
    lv.setUint16(10, 0, true) // mod time
    lv.setUint16(12, 0, true) // mod date
    lv.setUint32(14, crc, true) // crc32
    lv.setUint32(18, size, true) // compressed size
    lv.setUint32(22, size, true) // uncompressed size
    lv.setUint16(26, nameBytes.length, true) // name length
    lv.setUint16(28, 0, true) // extra length
    local.set(nameBytes, 30)

    // Central directory header
    const central = new Uint8Array(46 + nameBytes.length)
    const cv = new DataView(central.buffer)
    cv.setUint32(0, 0x02014b50, true) // signature
    cv.setUint16(4, 20, true) // version made by
    cv.setUint16(6, 20, true) // version needed
    cv.setUint16(8, 0, true) // flags
    cv.setUint16(10, 0, true) // compression
    cv.setUint16(12, 0, true) // mod time
    cv.setUint16(14, 0, true) // mod date
    cv.setUint32(16, crc, true) // crc32
    cv.setUint32(20, size, true) // compressed size
    cv.setUint32(24, size, true) // uncompressed size
    cv.setUint16(28, nameBytes.length, true) // name length
    cv.setUint16(30, 0, true) // extra length
    cv.setUint16(32, 0, true) // comment length
    cv.setUint16(34, 0, true) // disk number start
    cv.setUint16(36, 0, true) // internal attrs
    cv.setUint32(38, 0, true) // external attrs
    cv.setUint32(42, offset, true) // offset
    central.set(nameBytes, 46)

    localHeaders.push(local)
    centralHeaders.push(central)
    fileDataParts.push(file.data)
    offset += local.length + file.data.length
  }

  const centralDirOffset = offset
  let centralDirSize = 0
  for (const ch of centralHeaders) centralDirSize += ch.length

  const endRecord = new Uint8Array(22)
  const ev = new DataView(endRecord.buffer)
  ev.setUint32(0, 0x06054b50, true) // signature
  ev.setUint16(4, 0, true) // disk number
  ev.setUint16(6, 0, true) // central dir disk
  ev.setUint16(8, files.length, true) // entries on disk
  ev.setUint16(10, files.length, true) // total entries
  ev.setUint32(12, centralDirSize, true) // central dir size
  ev.setUint32(16, centralDirOffset, true) // central dir offset
  ev.setUint16(20, 0, true) // comment length

  const totalSize = offset + centralDirSize + 22
  const result = new Uint8Array(totalSize)
  let pos = 0
  for (let i = 0; i < files.length; i++) {
    result.set(localHeaders[i], pos); pos += localHeaders[i].length
    result.set(fileDataParts[i], pos); pos += fileDataParts[i].length
  }
  for (const ch of centralHeaders) { result.set(ch, pos); pos += ch.length }
  result.set(endRecord, pos)

  return result
}

// ─── Data Query Helpers ─────────────────────────────────────

async function queryReportData(
  adminClient: ReturnType<typeof createAdminClient>,
  reportType: string,
  filters: Record<string, string>,
): Promise<{ headers: string[]; rows: (string | number | null)[][] }> {
  let query: ReturnType<typeof adminClient.from>
  let headers: string[] = []

  switch (reportType) {
    case 'members': {
      query = adminClient.from('members').select('membership_number, full_name, phone, email, status, joined_at, created_at')
      headers = ['membership_number', 'full_name', 'phone', 'email', 'status', 'joined_at', 'created_at']
      break
    }
    case 'contributions': {
      query = adminClient.from('contributions').select('status, amount, period, notes, created_at, members(full_name), packages(name)')
      headers = ['status', 'amount', 'period', 'notes', 'created_at', 'member_name', 'package_name']
      break
    }
    case 'claims': {
      query = adminClient.from('claims').select('claim_number, claim_type, amount_requested, status, created_at, submitted_at, decided_at, members(full_name), packages(name)')
      headers = ['claim_number', 'claim_type', 'amount_requested', 'status', 'created_at', 'submitted_at', 'decided_at', 'member_name', 'package_name']
      break
    }
    case 'registration-fees': {
      query = adminClient.from('registration_fees').select('amount, currency, status, payment_method, mpesa_receipt, paid_at, created_at, members(full_name, email)')
        .eq('fee_type', 'registration')
      headers = ['amount', 'currency', 'status', 'payment_method', 'mpesa_receipt', 'paid_at', 'created_at', 'member_name', 'email']
      break
    }
    case 'subscriptions': {
      query = adminClient.from('subscriptions').select('status, started_at, next_due_date, cancelled_at, created_at, members(full_name, email), packages(name), package_tiers(name, amount)')
      headers = ['status', 'started_at', 'next_due_date', 'cancelled_at', 'created_at', 'member_name', 'email', 'package_name', 'tier_name', 'tier_amount']
      break
    }
    default:
      return { headers: [], rows: [] }
  }

  if (filters.status) query = query.eq('status', filters.status)
  if (filters.dateFrom) query = query.gte('created_at', filters.dateFrom)
  if (filters.dateTo) query = query.lte('created_at', filters.dateTo + 'T23:59:59')

  const { data, error } = await query.order('created_at', { ascending: false }).limit(1000)
  if (error) throw new Error(error.message)

  // Flatten nested objects
  const rows = (data ?? []).map((row: Record<string, unknown>) => {
    return headers.map(h => {
      // Handle nested objects like members(full_name), packages(name)
      if (h === 'member_name') {
        const m = row.members as { full_name?: string } | null
        return m?.full_name ?? null
      }
      if (h === 'email' && row.members) {
        const m = row.members as { email?: string } | null
        return m?.email ?? null
      }
      if (h === 'package_name') {
        const p = row.packages as { name?: string } | null
        return p?.name ?? null
      }
      if (h === 'tier_name') {
        const t = row.package_tiers as { name?: string } | null
        return t?.name ?? null
      }
      if (h === 'tier_amount') {
        const t = row.package_tiers as { amount?: number } | null
        return t?.amount ?? null
      }
      const val = row[h]
      return val as string | number | null
    })
  })

  return { headers, rows }
}

function buildExcelBuffer(title: string, headers: string[], rows: (string | number | null)[][]): Uint8Array {
  const xml = buildExcelXml(title, headers, rows)
  return new TextEncoder().encode(xml)
}

// ─── Main Handler ───────────────────────────────────────────

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

    // ─── LIST SCHEDULES ──────────────────────────────────
    if (req.method === 'GET' && !id && !action) {
      const { data, error } = await adminClient
        .from('scheduled_reports').select('*').order('created_at', { ascending: false })
      if (error) throw new Error(error.message)
      return new Response(JSON.stringify({ schedules: data ?? [] }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ─── HISTORY (search/filter/paginate) ────────────────
    if (req.method === 'GET' && action === 'history') {
      requirePermission(session, 'members', 'read')
      const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1'))
      const perPage = Math.min(100, Math.max(1, parseInt(url.searchParams.get('per_page') ?? '20')))
      const search = url.searchParams.get('search') ?? ''
      const typeFilter = url.searchParams.get('type') ?? ''
      const statusFilter = url.searchParams.get('status') ?? ''
      const dateFrom = url.searchParams.get('date_from') ?? ''
      const dateTo = url.searchParams.get('date_to') ?? ''

      let query = adminClient.from('report_history').select('*', { count: 'exact' })

      if (search) {
        query = query.or(`schedule_name.ilike.%${search}%,filename.ilike.%${search}%`)
      }
      if (typeFilter) query = query.eq('report_type', typeFilter)
      if (statusFilter) query = query.eq('status', statusFilter)
      if (dateFrom) query = query.gte('generated_at', dateFrom)
      if (dateTo) query = query.lte('generated_at', dateTo + 'T23:59:59')

      const offset = (page - 1) * perPage
      const { data, error, count } = await query
        .order('generated_at', { ascending: false })
        .range(offset, offset + perPage - 1)

      if (error) throw new Error(error.message)

      return new Response(JSON.stringify({
        history: data ?? [],
        total: count ?? 0,
        page,
        per_page: perPage,
        total_pages: Math.ceil((count ?? 0) / perPage),
      }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ─── BULK DOWNLOAD (ZIP) ─────────────────────────────
    if (req.method === 'POST' && action === 'bulk-download') {
      requirePermission(session, 'members', 'read')
      const body = await req.json() as { ids?: string[] }
      if (!body.ids || !Array.isArray(body.ids) || body.ids.length === 0) {
        return new Response(JSON.stringify({ message: 'ids array is required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Limit to 20 files
      const ids = body.ids.slice(0, 20)

      const { data: records, error } = await adminClient
        .from('report_history').select('*').in('id', ids)
      if (error) throw new Error(error.message)

      const files: { name: string; data: Uint8Array }[] = []
      for (const rec of records ?? []) {
        try {
          const { data: blob } = await adminClient.storage.from('report-files').download(rec.filename)
          if (blob) {
            const buffer = await blob.arrayBuffer()
            const xlsxName = rec.filename.replace(/\.(csv|xlsx)$/, '.xlsx')
            files.push({ name: xlsxName, data: new Uint8Array(buffer) })
          }
        } catch {
          // Skip missing files
        }
      }

      if (files.length === 0) {
        return new Response(JSON.stringify({ message: 'No files found to download' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const zipData = createZip(files)

      await logAudit(adminClient, {
        actor_id: session.id, actor_role: session.role_name,
        action: 'bulk_download', resource: 'report_history',
        meta: { count: files.length, ids },
      })

      return new Response(zipData, {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename="luma-reports-${new Date().toISOString().split('T')[0]}.zip"`,
        },
      })
    }

    // ─── CLEANUP (delete history + storage) ──────────────
    if (req.method === 'POST' && action === 'cleanup') {
      requirePermission(session, 'members', 'read')
      const body = await req.json() as { ids?: string[] }
      if (!body.ids || !Array.isArray(body.ids) || body.ids.length === 0) {
        return new Response(JSON.stringify({ message: 'ids array is required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { data: records, error } = await adminClient
        .from('report_history').select('id, filename').in('id', body.ids)
      if (error) throw new Error(error.message)

      let deleted = 0
      let storageErrors = 0

      for (const rec of records ?? []) {
        // Delete from storage
        try {
          await adminClient.storage.from('report-files').remove([rec.filename])
        } catch {
          storageErrors++
        }
        // Delete history record
        await adminClient.from('report_history').delete().eq('id', rec.id)
        deleted++
      }

      await logAudit(adminClient, {
        actor_id: session.id, actor_role: session.role_name,
        action: 'report_history_cleanup', resource: 'report_history',
        meta: { deleted, storage_errors: storageErrors, ids: body.ids },
      })

      return new Response(JSON.stringify({ deleted, storage_errors: storageErrors }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ─── CREATE SCHEDULE ─────────────────────────────────
    if (req.method === 'POST' && !id && !action) {
      const body = await req.json()
      const { name, report_type, filters, frequency, recipients } = body
      if (!name || !report_type || !frequency) {
        return new Response(JSON.stringify({ message: 'name, report_type, and frequency are required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const nextRun = computeNextRun(frequency)
      const { data, error } = await adminClient.from('scheduled_reports').insert({
        name, report_type, filters: filters ?? {}, frequency,
        recipients: recipients ?? [], enabled: true,
        next_run_at: nextRun.toISOString(), created_by: user.id,
      }).select().single()
      if (error) throw new Error(error.message)
      await logAudit(adminClient, { actor_id: session.id, actor_role: session.role_name, action: 'scheduled_report_created', resource: 'scheduled_report', meta: { id: data.id, name, report_type, frequency } })
      return new Response(JSON.stringify({ schedule: data }), { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ─── UPDATE SCHEDULE ─────────────────────────────────
    if (req.method === 'PATCH' && id) {
      const body = await req.json()
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (body.name !== undefined) updates.name = body.name
      if (body.report_type !== undefined) updates.report_type = body.report_type
      if (body.filters !== undefined) updates.filters = body.filters
      if (body.frequency !== undefined) { updates.frequency = body.frequency; updates.next_run_at = computeNextRun(body.frequency).toISOString() }
      if (body.recipients !== undefined) updates.recipients = body.recipients
      if (body.enabled !== undefined) updates.enabled = body.enabled
      const { data, error } = await adminClient.from('scheduled_reports').update(updates).eq('id', id).select().single()
      if (error) throw new Error(error.message)
      return new Response(JSON.stringify({ schedule: data }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ─── DELETE SCHEDULE ─────────────────────────────────
    if (req.method === 'DELETE' && id) {
      const { error } = await adminClient.from('scheduled_reports').delete().eq('id', id)
      if (error) throw new Error(error.message)
      return new Response(JSON.stringify({ message: 'Deleted' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ─── GENERATE NOW ────────────────────────────────────
    if (req.method === 'POST' && id && action === 'generate') {
      const { data: schedule, error: schedErr } = await adminClient.from('scheduled_reports').select('*').eq('id', id).single()
      if (schedErr || !schedule) return new Response(JSON.stringify({ message: 'Schedule not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

      const filters = (schedule.filters ?? {}) as Record<string, string>
      const { headers, rows } = await queryReportData(adminClient, schedule.report_type, filters)

      if (rows.length === 0) {
        return new Response(JSON.stringify({ message: 'No data to report', records: 0 }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      const xlsxBuffer = buildExcelBuffer(schedule.name, headers, rows)
      const filename = `${schedule.name.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 40)}_${schedule.report_type}_${new Date().toISOString().split('T')[0]}.xlsx`

      const { error: uploadErr } = await adminClient.storage.from('report-files').upload(`${user.id}/${filename}`, xlsxBuffer, { contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', upsert: true })
      if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`)

      await adminClient.from('report_history').insert({
        schedule_id: id, schedule_name: schedule.name, report_type: schedule.report_type,
        filename, record_count: rows.length, status: 'success', generated_by: user.id,
      })

      const nextRun = computeNextRun(schedule.frequency)
      await adminClient.from('scheduled_reports').update({ last_generated_at: new Date().toISOString(), next_run_at: nextRun.toISOString(), updated_at: new Date().toISOString() }).eq('id', id)

      // Generate signed URL for download
      const { data: signedUrl } = await adminClient.storage.from('report-files').createSignedUrl(`${user.id}/${filename}`, 3600)

      await logAudit(adminClient, { actor_id: session.id, actor_role: session.role_name, action: 'report_generated', resource: 'scheduled_report', meta: { id, name: schedule.name, records: rows.length, filename } })

      return new Response(JSON.stringify({
        message: 'Report generated', filename, records: rows.length,
        signed_url: signedUrl?.signedUrl ?? null,
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ─── PROCESS ALL DUE ─────────────────────────────────
    if (req.method === 'POST' && action === 'process-all') {
      requirePermission(session, 'members', 'read')
      const { data: dueSchedules } = await adminClient.from('scheduled_reports').select('id, name').eq('enabled', true).lte('next_run_at', new Date().toISOString())
      const results: { id: string; name: string; status: string }[] = []
      for (const sched of dueSchedules ?? []) {
        try {
          const { error } = await adminClient.rpc('generate_scheduled_report', { p_report_id: sched.id })
          results.push({ id: sched.id, name: sched.name, status: error ? `Error: ${error.message}` : 'Generated' })
        } catch (e) {
          results.push({ id: sched.id, name: sched.name, status: `Error: ${e instanceof Error ? e.message : 'Unknown'}` })
        }
      }
      return new Response(JSON.stringify({ processed: results.length, results }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({ message: 'Not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return new Response(JSON.stringify({ message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})

function computeNextRun(frequency: string): Date {
  const d = new Date()
  switch (frequency) {
    case 'daily': d.setDate(d.getDate() + 1); break
    case 'weekly': d.setDate(d.getDate() + 7); break
    case 'monthly': d.setMonth(d.getMonth() + 1); break
    case 'quarterly': d.setMonth(d.getMonth() + 3); break
  }
  d.setHours(6, 0, 0, 0)
  return d
}
