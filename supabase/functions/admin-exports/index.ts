import { handleCors, corsHeaders } from '../shared/cors.ts'
import {
  getAuthenticatedUser,
  createAdminClient,
  loadAdminSession,
  requirePermission,
  logAudit,
} from '../shared/supabase.ts'

/**
 * Admin Exports — Async CSV generation with background worker.
 *
 * Routes:
 *   GET /admin-exports?type=members&format=csv&status=active  → creates job, returns {id, status: 'queued'}
 *   GET /admin-exports?id=xxx                                  → returns job status with progress
 *   GET /admin-exports?action=list&page=1&per_page=20         → returns paginated export history
 *   GET /admin-exports?action=download&id=xxx                  → returns fresh signed URL
 *
 * Supported types: members, subscriptions, contributions, claims, registration_fees
 * Supported formats: csv (fully implemented), xlsx, pdf (501 stubs)
 *
 * Storage path: exports/{admin_id}/{type}_{timestamp}.csv
 * Expiry: 7 days from creation.
 */

const EXPIRY_DAYS = 7
const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 100
const SIGNED_URL_TTL_SECONDS = 3600

type ExportType = 'members' | 'subscriptions' | 'contributions' | 'claims' | 'registration_fees'

interface ExportJob {
  id: string
  type: string
  format: string
  status: string
  file_url: string | null
  file_name: string | null
  row_count: number
  total_rows: number
  processed_rows: number
  filters: Record<string, unknown>
  created_by: string
  created_at: string
  expires_at: string
  completed_at: string | null
}

// ---------------------------------------------------------------------------
// CSV helpers
// ---------------------------------------------------------------------------

/** Prefix characters that can trigger formula injection in Excel. */
const FORMULA_PREFIXES = ['=', '+', '-', '@', '\t', '\r']

function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  // Formula-injection protection: prefix with single quote
  const safe = FORMULA_PREFIXES.some((p) => str.startsWith(p)) ? `'${str}` : str
  // Wrap in quotes if the value contains a comma, quote, or newline
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
  // UTF-8 BOM for Excel compatibility
  return '\uFEFF' + lines.join('\n')
}

// ---------------------------------------------------------------------------
// Per-type query & flatten logic
// ---------------------------------------------------------------------------

interface TypeConfig {
  resource: string
  permission: string
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
    permission: 'members',
    columns: 'id, membership_number, full_name, phone, email, status, joined_at, created_at',
    headerMap: {},
    dateColumn: 'created_at',
    flatten: flattenMember,
  },
  subscriptions: {
    resource: 'subscriptions',
    permission: 'members',
    columns: 'id, status, started_at, next_due_date, cancelled_at, created_at, member_id, members(full_name, phone, email, membership_number), packages(code, name), package_tiers(name, amount)',
    headerMap: {},
    dateColumn: 'created_at',
    flatten: flattenSubscription,
  },
  contributions: {
    resource: 'contributions',
    permission: 'contributions',
    columns: 'id, period, amount, status, notes, created_at, member_id, members(full_name, phone, membership_number), packages(code, name), payments(mpesa_receipt, channel)',
    headerMap: {},
    dateColumn: 'created_at',
    flatten: flattenContribution,
  },
  claims: {
    resource: 'claims',
    permission: 'claims',
    columns: 'id, claim_number, claim_type, amount_requested, status, created_at, submitted_at, decided_at, member_id, members(full_name, phone, email), packages(code, name)',
    headerMap: {},
    dateColumn: 'created_at',
    flatten: flattenClaim,
  },
  registration_fees: {
    resource: 'registration_fees',
    permission: 'members',
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
// Export job CRUD
// ---------------------------------------------------------------------------

async function createExportJob(
  adminClient: ReturnType<typeof createAdminClient>,
  params: { id: string; type: string; format: string; file_name: string; filters: Record<string, unknown>; created_by: string; expires_at: string },
): Promise<ExportJob> {
  const { data, error } = await adminClient
    .from('export_jobs')
    .insert({
      id: params.id,
      type: params.type,
      format: params.format,
      file_name: params.file_name,
      status: 'pending',
      filters: params.filters,
      created_by: params.created_by,
      expires_at: params.expires_at,
    })
    .select()
    .single()
  if (error) throw new Error(`Failed to create export job: ${error.message}`)
  return data as ExportJob
}

async function updateExportJob(
  adminClient: ReturnType<typeof createAdminClient>,
  jobId: string,
  patch: Partial<ExportJob>,
): Promise<void> {
  const { error } = await adminClient
    .from('export_jobs')
    .update(patch)
    .eq('id', jobId)
  if (error) throw new Error(`Failed to update export job: ${error.message}`)
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    // 1. Authenticate
    const user = await getAuthenticatedUser(req)
    if (!user) return jsonResponse({ message: 'Not authenticated' }, 401)

    const adminClient = createAdminClient()
    const session = await loadAdminSession(adminClient, user.id)
    if (!session) return jsonResponse({ message: 'No admin access' }, 403)

    if (req.method !== 'GET') return jsonResponse({ message: 'Method not allowed' }, 405)

    const url = new URL(req.url)
    const action = url.searchParams.get('action')
    const jobIdParam = url.searchParams.get('id')

    // -----------------------------------------------------------------------
    // Route: ?action=download&id=xxx  →  fresh signed URL
    // -----------------------------------------------------------------------
    if (action === 'download' && jobIdParam) {
      const { data: job, error: jobError } = await adminClient
        .from('export_jobs')
        .select('*')
        .eq('id', jobIdParam)
        .eq('created_by', user.id)
        .single()

      if (jobError || !job) return jsonResponse({ message: 'Export job not found' }, 404)
      if (job.status !== 'completed') return jsonResponse({ message: 'Export is not completed' }, 409)
      if (job.expires_at && new Date(job.expires_at) < new Date()) {
        return jsonResponse({ message: 'Export has expired' }, 410)
      }
      if (!job.file_name) return jsonResponse({ message: 'No file associated with this export' }, 404)

      const filePath = `${user.id}/${job.file_name}`
      const { data: signedUrl, error: urlError } = await adminClient
        .storage
        .from('exports')
        .createSignedUrl(filePath, SIGNED_URL_TTL_SECONDS)

      if (urlError) return jsonResponse({ message: `Failed to create signed URL: ${urlError.message}` }, 500)

      await logAudit(adminClient, {
        actor_id: session.id,
        actor_role: session.role_name,
        action: 'export_downloaded',
        resource: 'export',
        resource_id: jobIdParam,
        meta: { type: job.type },
      })

      return jsonResponse({ signed_url: signedUrl?.signedUrl ?? '', expires_in: SIGNED_URL_TTL_SECONDS })
    }

    // -----------------------------------------------------------------------
    // Route: ?action=list&page=1&per_page=20  →  paginated export history
    // -----------------------------------------------------------------------
    if (action === 'list') {
      const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10))
      const perPage = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(url.searchParams.get('per_page') ?? String(DEFAULT_PAGE_SIZE), 10)))
      const offset = (page - 1) * perPage

      const { count } = await adminClient
        .from('export_jobs')
        .select('*', { count: 'exact', head: true })
        .eq('created_by', user.id)

      const { data: jobs, error: listError } = await adminClient
        .from('export_jobs')
        .select('*')
        .eq('created_by', user.id)
        .order('created_at', { ascending: false })
        .range(offset, offset + perPage - 1)

      if (listError) return jsonResponse({ message: `Failed to list exports: ${listError.message}` }, 500)

      return jsonResponse({
        exports: jobs ?? [],
        pagination: {
          page,
          per_page: perPage,
          total: count ?? 0,
          total_pages: Math.ceil((count ?? 0) / perPage),
        },
      })
    }

    // -----------------------------------------------------------------------
    // Route: ?id=xxx  →  job status with progress
    // -----------------------------------------------------------------------
    if (jobIdParam) {
      const { data: job, error: jobError } = await adminClient
        .from('export_jobs')
        .select('*')
        .eq('id', jobIdParam)
        .eq('created_by', user.id)
        .single()

      if (jobError || !job) return jsonResponse({ message: 'Export job not found' }, 404)

      return jsonResponse({
        id: job.id,
        type: job.type,
        format: job.format,
        status: job.status,
        file_name: job.file_name,
        file_url: job.file_url,
        row_count: job.row_count,
        total_rows: job.total_rows,
        processed_rows: job.processed_rows,
        progress: job.total_rows > 0 ? Math.round((job.processed_rows / job.total_rows) * 100) : 0,
        filters: job.filters,
        created_at: job.created_at,
        expires_at: job.expires_at,
        completed_at: job.completed_at,
      })
    }

    // -----------------------------------------------------------------------
    // Route: ?type=members&format=csv&...  →  create export job (async)
    // -----------------------------------------------------------------------
    const type = (url.searchParams.get('type') ?? 'members') as ExportType
    const format = url.searchParams.get('format') ?? 'csv'

    // 2. Validate export type
    if (!TYPE_CONFIGS[type]) return jsonResponse({ message: `Invalid export type: ${type}` }, 400)

    // 3. Check permission
    const config = TYPE_CONFIGS[type]
    requirePermission(session, config.permission, 'read')

    // 4. Format stubs
    if (format === 'xlsx' || format === 'pdf') {
      return jsonResponse({ message: `${format.toUpperCase()} export is not yet implemented. Use format=csv.` }, 501)
    }
    if (format !== 'csv') return jsonResponse({ message: `Unsupported format: ${format}` }, 400)

    // 5. Concurrency guard — reject if same-type export is already queued or processing
    const { data: runningJobs } = await adminClient
      .from('export_jobs')
      .select('id')
      .eq('created_by', user.id)
      .eq('type', type)
      .in('status', ['pending', 'processing'])
      .limit(1)

    if (runningJobs && runningJobs.length > 0) {
      return jsonResponse({ message: 'An export of this type is already in progress.' }, 409)
    }

    // 6. Build filters object
    const filters: Record<string, string | undefined> = {
      status: url.searchParams.get('status') ?? undefined,
      package: url.searchParams.get('package') ?? undefined,
      date_from: url.searchParams.get('date_from') ?? undefined,
      date_to: url.searchParams.get('date_to') ?? undefined,
      q: url.searchParams.get('q') ?? undefined,
    }

    // 7. Create export job (pending — worker picks it up)
    const jobId = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString()
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const fileName = `${type}_${timestamp}.csv`

    await createExportJob(adminClient, {
      id: jobId,
      type,
      format,
      file_name: fileName,
      filters,
      created_by: user.id,
      expires_at: expiresAt,
    })

    // 8. Log audit
    await logAudit(adminClient, {
      actor_id: session.id,
      actor_role: session.role_name,
      action: 'export_created',
      resource: 'export',
      resource_id: jobId,
      meta: { type, format, filters },
    })

    // 9. Return immediately — background worker processes the job
    return jsonResponse({
      id: jobId,
      type,
      format,
      status: 'queued',
      file_name: fileName,
      expires_at: expiresAt,
      created_at: new Date().toISOString(),
    })
  } catch (err) {
    console.error('admin-exports error:', err)
    const message = err instanceof Error ? err.message : 'An unexpected error occurred.'
    return jsonResponse({ message }, 500)
  }
})
