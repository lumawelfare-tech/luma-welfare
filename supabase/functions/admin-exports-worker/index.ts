import { handleCors, corsHeaders } from '../shared/cors.ts'
import { createAdminClient } from '../shared/supabase.ts'

/**
 * Admin Exports Worker — Background job processor for queued export jobs.
 *
 * Triggered by HTTP POST/GET (cron, pg_net) or database triggers.
 * Claims a pending job via `claim_export_job`, processes it in batches,
 * uploads CSV to storage, and updates the job record.
 *
 * No user authentication required — this is a system-level worker.
 */

const BATCH_SIZE = 5000
const SIGNED_URL_EXPIRY = 3600 // 1 hour
const MAX_RETRIES = 3

type ExportType = 'members' | 'subscriptions' | 'contributions' | 'claims' | 'registration_fees'

interface ExportJob {
  id: string
  type: string
  format: string
  status: string
  file_url: string | null
  row_count: number
  filters: Record<string, unknown>
  created_by: string
  created_at: string
  expires_at: string
  completed_at: string | null
  error_message: string | null
  retry_count: number
}

// ---------------------------------------------------------------------------
// CSV helpers
// ---------------------------------------------------------------------------

const FORMULA_PREFIXES = ['=', '+', '-', '@', '\t', '\r']

function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  const safe = FORMULA_PREFIXES.some((p) => str.startsWith(p)) ? `'${str}` : str
  if (safe.includes(',') || safe.includes('"') || safe.includes('\n') || safe.includes('\r')) {
    return `"${safe.replace(/"/g, '""')}"`
  }
  return safe
}

function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(escapeCsvCell).join(',')]
  for (const row of rows) {
    lines.push(row.map(escapeCsvCell).join(','))
  }
  return '\uFEFF' + lines.join('\n')
}

// ---------------------------------------------------------------------------
// Per-type query & flatten logic
// ---------------------------------------------------------------------------

interface TypeConfig {
  resource: string
  columns: string
  headerMap: Record<string, string>
  dateColumn: string
  flatten: (row: Record<string, unknown>) => unknown[]
}

function flattenMember(r: Record<string, unknown>): unknown[] {
  return [r.id, r.membership_number, r.full_name, r.phone, r.email, r.status, r.joined_at, r.created_at]
}

function flattenSubscription(r: Record<string, unknown>): unknown[] {
  const member = (r.members ?? {}) as Record<string, unknown>
  const pkg = (r.packages ?? {}) as Record<string, unknown>
  const tier = (r.package_tiers ?? {}) as Record<string, unknown>
  return [
    r.id,
    r.status,
    r.started_at,
    r.next_due_date,
    r.member_id,
    member.full_name ?? '',
    pkg.name ?? '',
    tier.name ?? '',
    tier.amount ?? '',
  ]
}

function flattenContribution(r: Record<string, unknown>): unknown[] {
  const member = (r.members ?? {}) as Record<string, unknown>
  const pkg = (r.packages ?? {}) as Record<string, unknown>
  const payment = (r.payments ?? {}) as Record<string, unknown>
  return [
    r.id,
    r.period,
    r.amount,
    r.status,
    member.full_name ?? '',
    pkg.name ?? '',
    payment.mpesa_receipt ?? '',
    r.created_at,
  ]
}

function flattenClaim(r: Record<string, unknown>): unknown[] {
  const member = (r.members ?? {}) as Record<string, unknown>
  const pkg = (r.packages ?? {}) as Record<string, unknown>
  return [
    r.id,
    r.claim_number,
    r.claim_type,
    r.amount_requested,
    r.status,
    member.full_name ?? '',
    pkg.name ?? '',
    r.submitted_at,
    r.decided_at,
  ]
}

function flattenRegistrationFee(r: Record<string, unknown>): unknown[] {
  const member = (r.members ?? {}) as Record<string, unknown>
  return [
    r.id,
    r.amount,
    r.status,
    member.full_name ?? '',
    r.mpesa_receipt ?? '',
    r.paid_at,
    r.created_at,
  ]
}

const TYPE_CONFIGS: Record<ExportType, TypeConfig> = {
  members: {
    resource: 'members',
    columns: 'id, membership_number, full_name, phone, email, status, joined_at, created_at',
    headerMap: {},
    dateColumn: 'created_at',
    flatten: flattenMember,
  },
  subscriptions: {
    resource: 'subscriptions',
    columns: 'id, status, started_at, next_due_date, cancelled_at, created_at, member_id, members(full_name, phone, email, membership_number), packages(code, name), package_tiers(name, amount)',
    headerMap: {},
    dateColumn: 'created_at',
    flatten: flattenSubscription,
  },
  contributions: {
    resource: 'contributions',
    columns: 'id, period, amount, status, notes, created_at, member_id, members(full_name, phone, membership_number), packages(code, name), payments(mpesa_receipt, channel)',
    headerMap: {},
    dateColumn: 'created_at',
    flatten: flattenContribution,
  },
  claims: {
    resource: 'claims',
    columns: 'id, claim_number, claim_type, amount_requested, status, created_at, submitted_at, decided_at, member_id, members(full_name, phone, email), packages(code, name)',
    headerMap: {},
    dateColumn: 'created_at',
    flatten: flattenClaim,
  },
  registration_fees: {
    resource: 'registration_fees',
    columns: 'id, amount, currency, status, payment_method, mpesa_receipt, transaction_reference, paid_at, created_at, member_id, members(full_name, phone, email, membership_number)',
    headerMap: {},
    dateColumn: 'created_at',
    flatten: flattenRegistrationFee,
  },
}

const HEADERS: Record<ExportType, string[]> = {
  members: ['id', 'membership_number', 'full_name', 'phone', 'email', 'status', 'joined_at', 'created_at'],
  subscriptions: ['id', 'status', 'started_at', 'next_due_date', 'member_id', 'member_name', 'package_name', 'tier_name', 'amount'],
  contributions: ['id', 'period', 'amount', 'status', 'member_name', 'package_name', 'payment_reference', 'created_at'],
  claims: ['id', 'claim_number', 'claim_type', 'amount_requested', 'status', 'member_name', 'package_name', 'submitted_at', 'decided_at'],
  registration_fees: ['id', 'amount', 'status', 'member_name', 'mpesa_receipt', 'paid_at', 'created_at'],
}

// ---------------------------------------------------------------------------
// Cursor-based batch fetcher (returns one batch at a time via generator)
// ---------------------------------------------------------------------------

async function* fetchBatch(
  adminClient: ReturnType<typeof createAdminClient>,
  config: TypeConfig,
  filters: Record<string, unknown>,
  lastId: string | null,
): AsyncGenerator<{ rows: unknown[][]; lastId: string; hasMore: boolean }> {
  // eslint-disable-next-line no-explicit-any
  let query = (adminClient as any)
    .from(config.resource)
    .select(config.columns)
    .order('id', { ascending: true })

  if (lastId) query = query.gt('id', lastId)

  if (filters.status) query = query.eq('status', filters.status)
  if (filters.package) query = query.eq('package_id', filters.package)
  if (filters.date_from) query = query.gte(config.dateColumn, filters.date_from as string)
  if (filters.date_to) query = query.lte(config.dateColumn, (filters.date_to as string) + 'T23:59:59')

  if (filters.q) {
    if (config.resource === 'members') {
      query = query.or(`full_name.ilike.%${filters.q}%,phone.ilike.%${filters.q}%,email.ilike.%${filters.q}%,membership_number.ilike.%${filters.q}%`)
    } else if (config.resource === 'claims') {
      query = query.or(`claim_number.ilike.%${filters.q}%`)
    }
  }

  query = query.limit(BATCH_SIZE)

  const { data, error } = await query
  if (error) throw new Error(`Query failed: ${error.message}`)

  if (!data || data.length === 0) {
    yield { rows: [], lastId: lastId ?? '', hasMore: false }
    return
  }

  const rows = data.map((row: Record<string, unknown>) => config.flatten(row))
  const newLastId = String(data[data.length - 1].id)
  const hasMore = data.length >= BATCH_SIZE

  yield { rows, lastId: newLastId, hasMore }
}

// ---------------------------------------------------------------------------
// Process a single export job
// ---------------------------------------------------------------------------

async function processJob(
  adminClient: ReturnType<typeof createAdminClient>,
  job: ExportJob,
  workerId: string,
): Promise<void> {
  const type = job.type as ExportType
  const config = TYPE_CONFIGS[type]
  if (!config) throw new Error(`Invalid export type: ${type}`)

  const filters = (job.filters ?? {}) as Record<string, unknown>
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const filePath = `${job.created_by}/${type}_${timestamp}.csv`
  const displayFileName = `${type}_${new Date().toISOString().slice(0, 10)}.csv`

  // Accumulate CSV rows in memory
  const allRows: unknown[][] = []
  let lastId: string | null = null
  let processedCount = 0

  // Fetch in batches
  while (true) {
    const gen = fetchBatch(adminClient, config, filters, lastId)
    const result = await gen.next()
    if (result.done) break

    const batch = result.value
    if (batch.rows.length === 0) break

    allRows.push(...batch.rows)
    processedCount += batch.rows.length
    lastId = batch.lastId

    // Update progress
    const progressMsg = `Processed ${processedCount} rows...`
    await adminClient
      .from('export_jobs')
      .update({ progress: progressMsg, processed_rows: processedCount })
      .eq('id', job.id)

    if (!batch.hasMore) break
  }

  if (allRows.length === 0) {
    throw new Error('No data found for the given filters.')
  }

  // Generate CSV
  const csv = toCsv(HEADERS[type], allRows)
  const rowCount = allRows.length

  // Upload to storage
  await adminClient
    .from('export_jobs')
    .update({ progress: 'Uploading to storage...' })
    .eq('id', job.id)

  const { error: uploadError } = await adminClient
    .storage
    .from('exports')
    .upload(filePath, csv, {
      contentType: 'text/csv; charset=utf-8',
      upsert: false,
    })

  if (uploadError) {
    // Try to clean up partial upload
    try {
      await adminClient.storage.from('exports').remove([filePath])
    } catch { /* ignore cleanup errors */ }
    throw new Error(`Storage upload failed: ${uploadError.message}`)
  }

  // Create signed download URL
  const { data: signedUrl, error: urlError } = await adminClient
    .storage
    .from('exports')
    .createSignedUrl(filePath, SIGNED_URL_EXPIRY)

  if (urlError) throw new Error(`Failed to create signed URL: ${urlError.message}`)

  const fileUrl = signedUrl?.signedUrl ?? ''

  // Update job to completed
  await adminClient
    .from('export_jobs')
    .update({
      status: 'completed',
      file_url: fileUrl,
      file_name: displayFileName,
      row_count: rowCount,
      completed_at: new Date().toISOString(),
      storage_path: filePath,
    })
    .eq('id', job.id)

  // Insert into report_history
  await adminClient
    .from('report_history')
    .insert({
      schedule_name: `Export: ${type}`,
      report_type: type,
      filename: filePath,
      record_count: rowCount,
      status: 'success',
      generated_by: job.created_by,
    })
}

// ---------------------------------------------------------------------------
// Handle failure: update job with error, possibly re-queue for retry
// ---------------------------------------------------------------------------

async function handleFailure(
  adminClient: ReturnType<typeof createAdminClient>,
  job: ExportJob,
  error: Error,
): Promise<void> {
  const newRetryCount = (job.retry_count ?? 0) + 1
  const canRetry = newRetryCount < MAX_RETRIES

  await adminClient
    .from('export_jobs')
    .update({
      status: canRetry ? 'pending' : 'failed',
      error_message: error.message,
      retry_count: newRetryCount,
    })
    .eq('id', job.id)

  console.error(`Export job ${job.id} failed (attempt ${newRetryCount}): ${error.message}`)
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    // Validate worker_id from query param or header
    const url = new URL(req.url)
    const workerId = url.searchParams.get('worker_id') ?? req.headers.get('x-worker-id')

    if (!workerId) {
      return new Response(JSON.stringify({ message: 'worker_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const adminClient = createAdminClient()

    // 1. Claim a job atomically
    const { data: claimedJob, error: claimError } = await adminClient
      .rpc('claim_export_job', { p_worker_id: workerId })

    if (claimError) {
      console.error('claim_export_job error:', claimError.message)
      return new Response(JSON.stringify({ message: 'Failed to claim job', error: claimError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // No jobs available — try recovering stale jobs
    if (!claimedJob) {
      const { data: recovered } = await adminClient.rpc('recover_stale_export_jobs')
      return new Response(JSON.stringify({ message: 'No pending jobs', recovered: recovered ?? 0, processed: 0 }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // claimedJob is the claimed row (should be a single object or array with 1 element)
    const job: ExportJob = Array.isArray(claimedJob) ? claimedJob[0] : claimedJob

    if (!job || !job.id) {
      const { data: recovered } = await adminClient.rpc('recover_stale_export_jobs')
      return new Response(JSON.stringify({ message: 'No pending jobs', recovered: recovered ?? 0, processed: 0 }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log(`Worker ${workerId} claimed job ${job.id} (type: ${job.type})`)

    // 2. Process the job
    try {
      await processJob(adminClient, job, workerId)
      console.log(`Job ${job.id} completed successfully`)

      return new Response(JSON.stringify({
        message: 'Job completed',
        job_id: job.id,
        type: job.type,
        status: 'completed',
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      await handleFailure(adminClient, job, error)

      return new Response(JSON.stringify({
        message: 'Job failed',
        job_id: job.id,
        error: error.message,
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
  } catch (err) {
    console.error('admin-exports-worker error:', err)
    const message = err instanceof Error ? err.message : 'An unexpected error occurred.'
    return new Response(JSON.stringify({ message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
