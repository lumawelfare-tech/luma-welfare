import { useState, useEffect, useCallback } from 'react'
import { useHead } from '../../lib/seo'
import { api, ApiError } from '../../lib/api'
import { sanitizeExportCell, sanitizeSpreadsheetCell, escapeXml } from '../../lib/sanitize'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

type ReportType = 'contributions' | 'subscriptions' | 'claims' | 'registration-fees' | 'members' | 'financial'

type ReportRow = Record<string, string | number | null>

type Package = { id: string; name: string; code: string | null }

/** Baseline columns required in every generated/exported report. */
const BASELINE_KEYS = [
  'full_name',
  'phone_number',
  'national_id_number',
  'amount_paid',
  'package_paid_for',
  'period',
] as const

const BASELINE_LABELS: Record<(typeof BASELINE_KEYS)[number], string> = {
  full_name: 'Full Name',
  phone_number: 'Phone Number',
  national_id_number: 'National ID Number',
  amount_paid: 'Amount Paid',
  package_paid_for: 'Package Paid For',
  period: 'Period',
}

const reportTypes: { value: ReportType; label: string; description: string; icon: string }[] = [
  { value: 'contributions', label: 'Contributions', description: 'Member contribution records', icon: '💰' },
  { value: 'subscriptions', label: 'Subscriptions', description: 'Package subscription records', icon: '📋' },
  { value: 'claims', label: 'Claims', description: 'Claim applications and decisions', icon: '📝' },
  { value: 'registration-fees', label: 'Registration Fees', description: 'KSh 300 activation payments', icon: '🎫' },
  { value: 'members', label: 'Members', description: 'Member registration records', icon: '👥' },
  { value: 'financial', label: 'Financial Summary', description: 'Aggregated financial overview', icon: '📊' },
]

const filterControlClass =
  'h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 outline-none transition-colors focus:border-luma-500 focus:ring-1 focus:ring-luma-500'

function statusOptions(type: ReportType): string[] {
  switch (type) {
    case 'contributions': return ['all', 'Pending', 'Verified', 'Failed']
    case 'subscriptions': return ['all', 'active', 'pending', 'paused', 'cancelled']
    case 'claims': return ['all', 'Draft', 'Submitted', 'Under Review', 'Additional Information Required', 'Approved', 'Rejected', 'Paid']
    case 'registration-fees': return ['all', 'unpaid', 'pending', 'paid', 'failed']
    case 'members': return ['all', 'active', 'pending_approval', 'suspended', 'closed']
    default: return ['all']
  }
}

const escapeCSV = sanitizeExportCell

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

function formatKes(amount: number | string | null): string {
  if (amount == null || amount === '') return '—'
  const n = Number(amount)
  return isNaN(n) ? String(amount) : 'KSh ' + n.toLocaleString()
}

function formatDate(val: string | null | undefined): string {
  if (!val) return '—'
  try {
    return new Date(val).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch { return String(val) }
}

function statusColor(s: string): string {
  switch (s?.toLowerCase()) {
    case 'active': case 'verified': case 'paid': case 'approved': return 'bg-emerald-100 text-emerald-700'
    case 'pending': case 'pending_approval': case 'under review': return 'bg-amber-100 text-amber-700'
    case 'failed': case 'rejected': case 'suspended': case 'closed': return 'bg-red-100 text-red-700'
    case 'draft': case 'additional information required': return 'bg-blue-100 text-blue-700'
    case 'cancelled': return 'bg-gray-100 text-gray-500'
    default: return 'bg-gray-100 text-gray-600'
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return null
}

function pickText(...values: unknown[]): string {
  for (const value of values) {
    if (value == null || value === '') continue
    if (typeof value === 'object') continue
    return String(value)
  }
  return ''
}

function pickAmount(...values: unknown[]): string | number | null {
  for (const value of values) {
    if (value == null || value === '') continue
    if (typeof value === 'object') continue
    const n = Number(value)
    if (!Number.isNaN(n)) return n
    return String(value)
  }
  return null
}

function filterPeriodLabel(dateFrom: string, dateTo: string): string {
  if (dateFrom && dateTo) return `${formatDate(dateFrom)} – ${formatDate(dateTo)}`
  if (dateFrom) return `From ${formatDate(dateFrom)}`
  if (dateTo) return `Until ${formatDate(dateTo)}`
  return 'All periods'
}

/**
 * Flatten nested API rows and guarantee the six baseline export columns,
 * then append report-type-specific fields.
 */
function normalizeReportRows(
  type: ReportType,
  raw: ReportRow[],
  dateFrom: string,
  dateTo: string,
): ReportRow[] {
  const fallbackPeriod = filterPeriodLabel(dateFrom, dateTo)

  return raw.map((row) => {
    const members = asRecord(row.members) ?? {}
    const packages = asRecord(row.packages) ?? {}
    const tiers = asRecord(row.package_tiers) ?? {}

    const fullName = pickText(row.full_name, members.full_name) || '—'
    const phone = pickText(row.phone_number, row.phone, members.phone) || '—'
    const nationalId = pickText(
      row.national_id_number,
      row.id_number,
      row.national_id,
      members.id_number,
      members.national_id,
    ) || '—'

    let amountPaid: string | number | null = null
    let packagePaidFor = '—'
    let period = fallbackPeriod
    const extras: ReportRow = {}

    switch (type) {
      case 'contributions':
        amountPaid = pickAmount(row.amount_paid, row.amount)
        packagePaidFor = pickText(row.package_paid_for, packages.name, packages.code, row.package_name) || '—'
        period = pickText(row.period) || fallbackPeriod
        extras.status = pickText(row.status) || '—'
        extras.membership_number = pickText(members.membership_number) || '—'
        extras.notes = pickText(row.notes) || '—'
        extras.created_at = pickText(row.created_at) || '—'
        break
      case 'subscriptions':
        amountPaid = pickAmount(row.amount_paid, tiers.amount, row.amount)
        packagePaidFor = pickText(row.package_paid_for, packages.name, packages.code) || '—'
        period = pickText(row.period)
          || (pickText(row.started_at) && pickText(row.next_due_date)
            ? `${formatDate(pickText(row.started_at))} – ${formatDate(pickText(row.next_due_date))}`
            : fallbackPeriod)
        extras.status = pickText(row.status) || '—'
        extras.tier = pickText(tiers.name) || '—'
        extras.membership_number = pickText(members.membership_number) || '—'
        extras.email = pickText(members.email, row.email) || '—'
        extras.next_due_date = pickText(row.next_due_date) || '—'
        break
      case 'claims':
        amountPaid = pickAmount(row.amount_paid, row.approved_amount, row.amount_requested)
        packagePaidFor = pickText(row.package_paid_for, packages.name, packages.code) || '—'
        period = pickText(row.period, row.submitted_at, row.decided_at, row.created_at)
          ? formatDate(pickText(row.period, row.submitted_at, row.decided_at, row.created_at))
          : fallbackPeriod
        extras.claim_number = pickText(row.claim_number) || '—'
        extras.claim_type = pickText(row.claim_type) || '—'
        extras.status = pickText(row.status) || '—'
        extras.amount_requested = pickAmount(row.amount_requested)
        extras.approved_amount = pickAmount(row.approved_amount)
        extras.submitted_at = pickText(row.submitted_at) || '—'
        extras.decided_at = pickText(row.decided_at) || '—'
        break
      case 'registration-fees':
        amountPaid = pickAmount(row.amount_paid, row.amount)
        packagePaidFor = pickText(row.package_paid_for) || 'Registration / Activation'
        period = pickText(row.period, row.paid_at, row.created_at)
          ? formatDate(pickText(row.period, row.paid_at, row.created_at))
          : fallbackPeriod
        extras.status = pickText(row.status) || '—'
        extras.payment_method = pickText(row.payment_method) || '—'
        extras.mpesa_receipt = pickText(row.mpesa_receipt) || '—'
        extras.membership_number = pickText(members.membership_number) || '—'
        break
      case 'members':
        amountPaid = pickAmount(row.amount_paid) ?? '—'
        packagePaidFor = pickText(row.package_paid_for) || '—'
        period = pickText(row.period, row.joined_at, row.created_at)
          ? formatDate(pickText(row.period, row.joined_at, row.created_at))
          : fallbackPeriod
        extras.membership_number = pickText(row.membership_number) || '—'
        extras.email = pickText(row.email) || '—'
        extras.status = pickText(row.status) || '—'
        extras.joined_at = pickText(row.joined_at) || '—'
        break
      case 'financial':
        amountPaid = pickAmount(row.amount_paid, row.amount)
        packagePaidFor = pickText(row.package_paid_for, row.category) || 'All packages'
        period = pickText(row.period) || fallbackPeriod
        extras.category = pickText(row.category) || '—'
        extras.count = row.count == null ? '—' : Number(row.count)
        extras.total = pickAmount(row.amount)
        break
      default:
        amountPaid = pickAmount(row.amount_paid, row.amount)
        packagePaidFor = pickText(row.package_paid_for, packages.name) || '—'
        period = pickText(row.period) || fallbackPeriod
    }

    return {
      full_name: fullName,
      phone_number: phone,
      national_id_number: nationalId,
      amount_paid: amountPaid ?? '—',
      package_paid_for: packagePaidFor,
      period,
      ...extras,
    }
  })
}

function orderedHeaders(rows: ReportRow[]): string[] {
  if (rows.length === 0) return [...BASELINE_KEYS]
  const present = new Set<string>()
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!key.startsWith('_')) present.add(key)
    }
  }
  const extras = [...present].filter((k) => !(BASELINE_KEYS as readonly string[]).includes(k))
  return [...BASELINE_KEYS, ...extras]
}

export function AdminReports() {
  useHead('Admin Reports', undefined, { noindex: true })

  const [reportType, setReportType] = useState<ReportType>('contributions')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [status, setStatus] = useState('all')
  const [packageId, setPackageId] = useState('all')
  const [packages, setPackages] = useState<Package[]>([])
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<ReportRow[]>([])
  const [error, setError] = useState('')
  const [generated, setGenerated] = useState(false)

  // Bookmark state
  type Bookmark = { id: string; name: string; report_type: string; filters: Record<string, string>; created_at: string }
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [showSaveBookmark, setShowSaveBookmark] = useState(false)
  const [bookmarkName, setBookmarkName] = useState('')

  const loadBookmarks = useCallback(() => {
    api<{ bookmarks: Bookmark[] }>('/admin/reports?action=bookmarks', { auth: true })
      .then(d => setBookmarks(d.bookmarks ?? []))
      .catch(() => {})
  }, [])

  useEffect(() => { loadBookmarks() }, [loadBookmarks])

  function applyBookmark(b: Bookmark) {
    setReportType(b.report_type as ReportType)
    setStatus(b.filters.status ?? 'all')
    setPackageId(b.filters.package ?? 'all')
    setDateFrom(b.filters.dateFrom ?? '')
    setDateTo(b.filters.dateTo ?? '')
  }

  async function saveBookmark() {
    if (!bookmarkName.trim()) return
    try {
      const filters: Record<string, string> = {}
      if (status !== 'all') filters.status = status
      if (packageId !== 'all') filters.package = packageId
      if (dateFrom) filters.dateFrom = dateFrom
      if (dateTo) filters.dateTo = dateTo

      await api('/admin/reports?action=bookmarks', {
        method: 'POST',
        auth: true,
        body: { name: bookmarkName.trim(), report_type: reportType, filters },
      })
      setBookmarkName('')
      setShowSaveBookmark(false)
      loadBookmarks()
    } catch (e: unknown) {
      setError(e instanceof ApiError ? e.message : 'Failed to save bookmark')
    }
  }

  async function deleteBookmark(id: string) {
    try {
      await api(`/admin/reports?action=bookmarks&bookmark_id=${id}`, { method: 'DELETE', auth: true })
      loadBookmarks()
    } catch (e: unknown) {
      setError(e instanceof ApiError ? e.message : 'Failed to delete bookmark')
    }
  }

  // KPI state
  type KpiData = {
    total_members: number
    active_subscriptions: number
    total_contributions: number
    total_claims_approved: number
    total_claims_requested: number
    registration_fees_collected: number
    pending_contributions: number
    pending_claims: number
    this_month_contributions: number
    this_month_claims: number
    contributions_growth_pct: number
    paid_registration_fees: number
    unpaid_registration_fees: number
  }
  const [kpi, setKpi] = useState<KpiData | null>(null)

  // Load KPI + packages on mount
  useEffect(() => {
    api<{ kpi: KpiData }>('/admin/reports?type=kpi', { auth: true })
      .then(d => setKpi(d.kpi))
      .catch(() => {})
    api<{ packages: Package[] }>('/admin/reports?type=packages', { auth: true })
      .then(d => setPackages(d.packages ?? []))
      .catch(() => {})
  }, [])

  // eslint-disable-next-line oxc/react/set-state-in-effect — setStatus/setPackageId/setData/setGenerated reset filter state on reportType change
  useEffect(() => {
    // eslint-disable-next-line oxc/react/set-state-in-effect — reset form state on filter type change
    setStatus('all')
    setPackageId('all')
    setData([])
    setGenerated(false)
  }, [reportType])

  async function generateReport() {
    setLoading(true)
    setError('')
    setData([])
    setGenerated(false)

    try {
      const params = new URLSearchParams({ type: reportType })
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)
      if (status !== 'all') params.set('status', status)
      if (packageId !== 'all') params.set('package', packageId)

      const result = await api<{ data: ReportRow[]; summary?: Record<string, number> }>(`/admin/reports?${params}`, { auth: true })
      const normalized = normalizeReportRows(reportType, result.data ?? [], dateFrom, dateTo)
      setData(normalized)
      setGenerated(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to generate report')
    } finally {
      setLoading(false)
    }
  }

  function getHeaders(): string[] {
    return orderedHeaders(data)
  }

  function headerLabel(h: string): string {
    if (h in BASELINE_LABELS) return BASELINE_LABELS[h as keyof typeof BASELINE_LABELS]
    return h.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  }

  // ─── Exports ──────────────────────────────────────────────

  function exportCSV() {
    const headers = getHeaders()
    const title = reportTypes.find(r => r.value === reportType)?.label ?? reportType
    const csv = [
      `Luma Welfare — ${title} Report`,
      `Generated: ${new Date().toLocaleDateString('en-KE')}`,
      `Filters: ${[status !== 'all' && `Status: ${status}`, packageId !== 'all' && `Package: ${packages.find(p => p.id === packageId)?.name ?? packageId}`, dateFrom && `From: ${dateFrom}`, dateTo && `To: ${dateTo}`].filter(Boolean).join(', ') || 'None'}`,
      '',
      headers.map((h) => escapeCSV(headerLabel(h))).join(','),
      ...data.map(row => headers.map(h => escapeCSV(String(row[h] ?? ''))).join(',')),
    ].join('\n')
    downloadBlob(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }), `${title.replace(/\s+/g, '_')}.csv`)
  }

  function exportExcel() {
    const headers = getHeaders()
    const title = reportTypes.find(r => r.value === reportType)?.label ?? reportType
    const headerRow = headers.map(h => `<Cell><Data ss:Type="String">${sanitizeSpreadsheetCell(headerLabel(h))}</Data></Cell>`).join('')
    const dataRows = data.map(row =>
      `<Row>${headers.map(h => {
        const v = row[h]
        const val = v == null ? '' : String(v)
        const num = Number(val)
        return !isNaN(num) && val !== '' && val !== '—'
          ? `<Cell><Data ss:Type="Number">${num}</Data></Cell>`
          : `<Cell><Data ss:Type="String">${sanitizeSpreadsheetCell(val)}</Data></Cell>`
      }).join('')}</Row>`
    ).join('')
    const xml = `<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="${escapeXml(title)}"><Table><Row>${headerRow}</Row>${dataRows}</Table></Worksheet></Workbook>`
    downloadBlob(new Blob([xml], { type: 'application/vnd.ms-excel' }), `${title.replace(/\s+/g, '_')}.xls`)
  }

  function exportPDF() {
    const headers = getHeaders()
    const title = reportTypes.find(r => r.value === reportType)?.label ?? reportType
    const doc = new jsPDF({ orientation: headers.length > 6 ? 'landscape' : 'portrait' })

    doc.setFontSize(16)
    doc.setFont('helvetica', 'bold')
    doc.text('Luma Welfare', 14, 18)
    doc.setFontSize(11)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(100)
    doc.text('Community Welfare Management System', 14, 25)

    doc.setTextColor(0)
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text(`${title} Report`, 14, 37)

    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(130)
    const filters = [status !== 'all' && `Status: ${status}`, packageId !== 'all' && `Package: ${packages.find(p => p.id === packageId)?.name ?? packageId}`, dateFrom && `From: ${dateFrom}`, dateTo && `To: ${dateTo}`].filter(Boolean).join(' | ')
    doc.text(`Generated: ${new Date().toLocaleDateString('en-KE', { day: 'numeric', month: 'long', year: 'numeric' })}${filters ? ` | Filters: ${filters}` : ''}`, 14, 43)
    doc.text(`${data.length} records`, 14, 48)

    autoTable(doc, {
      startY: 53,
      head: [headers.map(headerLabel)],
      body: data.map(row => headers.map(h => {
        const v = row[h]
        if (v == null || v === '') return '—'
        const s = String(v)
        if (h === 'amount_paid' || h.includes('amount') || h.includes('fee') || h === 'total') return formatKes(s)
        if (h.includes('date') || h.includes('_at') || h.includes('joined')) return formatDate(s)
        return s
      })),
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [109, 155, 58] },
      alternateRowStyles: { fillColor: [249, 250, 251] },
      margin: { left: 14, right: 14 },
    })

    doc.save(`${title.replace(/\s+/g, '_')}.pdf`)
  }

  // ─── Summary stats ────────────────────────────────────────

  function computeSummary() {
    if (data.length === 0) return null
    const headers = getHeaders()
    const amountCol = headers.find(h => h === 'amount_paid' || h.includes('amount') || h.includes('fee'))
    const statusCol = headers.find(h => h === 'status')

    const total = data.length
    let totalAmount = 0
    let verifiedCount = 0
    let pendingCount = 0

    for (const row of data) {
      if (amountCol) {
        const n = Number(row[amountCol])
        if (!Number.isNaN(n)) totalAmount += n
      }
      if (statusCol) {
        const s = String(row[statusCol] ?? '').toLowerCase()
        if (['verified', 'paid', 'active', 'approved'].includes(s)) verifiedCount++
        else if (['pending', 'pending_approval', 'under review', 'submitted', 'draft'].includes(s)) pendingCount++
      }
    }

    return { total, totalAmount, verifiedCount, pendingCount, amountCol: amountCol ?? null }
  }

  const summary = generated ? computeSummary() : null
  const headers = data.length > 0 ? getHeaders() : []

  return (
    <div className="space-y-8 py-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Reports</h1>
        <p className="mt-1.5 text-sm text-gray-500">Generate and export financial, membership, and claims reports.</p>
      </div>

      {/* KPI Overview */}
      {kpi && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-xl border border-gray-100 bg-white px-4 py-3.5 shadow-sm transition-all duration-[var(--motion-fast)] ease-[var(--luma-ease-out)] motion-reduce:transition-none hover:-translate-y-0.5 hover:shadow-md">
            <div className="text-xl font-extrabold tabular-nums text-gray-900 sm:text-2xl">{kpi.total_members.toLocaleString()}</div>
            <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Total Members</div>
          </div>
          <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3.5 shadow-sm transition-all duration-[var(--motion-fast)] ease-[var(--luma-ease-out)] motion-reduce:transition-none hover:-translate-y-0.5 hover:shadow-md">
            <div className="text-xl font-extrabold tabular-nums text-blue-700 sm:text-2xl">{kpi.active_subscriptions.toLocaleString()}</div>
            <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-blue-600">Active Subscriptions</div>
          </div>
          <div className="rounded-xl border border-luma-100 bg-luma-50 px-4 py-3.5 shadow-sm transition-all duration-[var(--motion-fast)] ease-[var(--luma-ease-out)] motion-reduce:transition-none hover:-translate-y-0.5 hover:shadow-md">
            <div className="text-xl font-extrabold tabular-nums text-luma-700 sm:text-2xl">KSh {kpi.total_contributions.toLocaleString()}</div>
            <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-luma-600">Total Contributions</div>
            <div className="mt-0.5 text-[11px] text-gray-500">
              This month: KSh {kpi.this_month_contributions.toLocaleString()}
              {kpi.contributions_growth_pct !== 0 && (
                <span className={`ml-1 font-semibold ${kpi.contributions_growth_pct > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                  {kpi.contributions_growth_pct > 0 ? '↑' : '↓'}{Math.abs(kpi.contributions_growth_pct)}%
                </span>
              )}
            </div>
          </div>
          <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3.5 shadow-sm transition-all duration-[var(--motion-fast)] ease-[var(--luma-ease-out)] motion-reduce:transition-none hover:-translate-y-0.5 hover:shadow-md">
            <div className="text-xl font-extrabold tabular-nums text-amber-700 sm:text-2xl">KSh {kpi.registration_fees_collected.toLocaleString()}</div>
            <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-amber-600">Registration Fees</div>
            <div className="mt-0.5 text-[11px] text-gray-500">{kpi.paid_registration_fees} paid · {kpi.unpaid_registration_fees} unpaid</div>
          </div>
          <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3.5 shadow-sm transition-all duration-[var(--motion-fast)] ease-[var(--luma-ease-out)] motion-reduce:transition-none hover:-translate-y-0.5 hover:shadow-md">
            <div className="text-xl font-extrabold tabular-nums text-emerald-700 sm:text-2xl">KSh {kpi.total_claims_approved.toLocaleString()}</div>
            <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-600">Claims Approved</div>
            <div className="mt-0.5 text-[11px] text-gray-500">
              {kpi.total_claims_requested > 0 && kpi.total_claims_approved !== kpi.total_claims_requested ? (
                <span>
                  Requested: KSh {kpi.total_claims_requested.toLocaleString()}
                  <span className={`ml-1 font-semibold ${kpi.total_claims_approved > kpi.total_claims_requested ? 'text-emerald-600' : 'text-amber-600'}`}>
                    ({kpi.total_claims_approved > kpi.total_claims_requested ? '+' : ''}{(((kpi.total_claims_approved - kpi.total_claims_requested) / kpi.total_claims_requested) * 100).toFixed(0)}%)
                  </span>
                </span>
              ) : (
                <span>{kpi.this_month_claims} this month</span>
              )}
            </div>
          </div>
          <div className="rounded-xl border border-purple-100 bg-purple-50 px-4 py-3.5 shadow-sm transition-all duration-[var(--motion-fast)] ease-[var(--luma-ease-out)] motion-reduce:transition-none hover:-translate-y-0.5 hover:shadow-md">
            <div className="flex items-baseline gap-1.5">
              <div className="text-xl font-extrabold tabular-nums text-purple-700 sm:text-2xl">{kpi.pending_contributions}</div>
              <div className="text-sm text-purple-400">/</div>
              <div className="text-base font-bold tabular-nums text-purple-500">{kpi.pending_claims}</div>
            </div>
            <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-purple-600">Pending</div>
            <div className="mt-0.5 text-[11px] text-gray-500">Contributions / Claims</div>
          </div>
        </div>
      )}

      {/* Report Type Selector */}
      <div>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Report type</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {reportTypes.map((r) => {
            const selected = reportType === r.value
            return (
              <button
                key={r.value}
                type="button"
                onClick={() => setReportType(r.value)}
                aria-pressed={selected}
                className={`rounded-xl border p-3.5 text-left transition-all duration-[var(--motion-fast)] ease-[var(--luma-ease-out)] motion-reduce:transition-none ${
                  selected
                    ? 'border-luma-600 bg-luma-100/90 shadow-sm ring-2 ring-luma-600/30'
                    : 'border-gray-200 bg-white hover:-translate-y-0.5 hover:border-luma-300 hover:bg-luma-50/40 hover:shadow-sm'
                }`}
              >
                <div className="text-lg" aria-hidden="true">{r.icon}</div>
                <div className={`mt-1.5 text-sm font-semibold ${selected ? 'text-luma-800' : 'text-gray-900'}`}>{r.label}</div>
                <div className={`mt-0.5 text-xs leading-snug ${selected ? 'text-luma-700/80' : 'text-gray-500'}`}>{r.description}</div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="report-status" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Status</label>
            <select
              id="report-status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className={filterControlClass}
            >
              {statusOptions(reportType).map(s => (
                <option key={s} value={s}>{s === 'all' ? 'All Statuses' : s.charAt(0).toUpperCase() + s.slice(1).toLowerCase().replace(/_/g, ' ')}</option>
              ))}
            </select>
          </div>

          {reportType !== 'members' && reportType !== 'financial' && (
            <div>
              <label htmlFor="report-package" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Package</label>
              <select
                id="report-package"
                value={packageId}
                onChange={(e) => setPackageId(e.target.value)}
                className={filterControlClass}
              >
                <option value="all">All Packages</option>
                {packages.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label htmlFor="report-date-from" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Date From</label>
            <input
              id="report-date-from"
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className={`${filterControlClass} appearance-none`}
            />
          </div>

          <div>
            <label htmlFor="report-date-to" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Date To</label>
            <input
              id="report-date-to"
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className={`${filterControlClass} appearance-none`}
            />
          </div>
        </div>

        {/* Saved Bookmarks */}
        {bookmarks.length > 0 && (
          <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-4">
            <span className="text-xs font-medium text-gray-500">Saved:</span>
            {bookmarks.map((b) => (
              <div key={b.id} className="group inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs transition-colors hover:border-luma-300 hover:bg-luma-50">
                <button type="button" onClick={() => applyBookmark(b)} className="font-medium text-gray-700 hover:text-luma-700">
                  {b.name}
                </button>
                <button
                  type="button"
                  onClick={() => deleteBookmark(b.id)}
                  className="ml-0.5 text-gray-300 opacity-0 transition-all group-hover:opacity-100 hover:text-red-500"
                  title="Remove bookmark"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-gray-100 pt-4">
          <button
            type="button"
            onClick={generateReport}
            disabled={loading}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-luma-700 px-5 text-sm font-semibold text-white shadow-sm shadow-luma-700/20 transition-colors hover:bg-luma-800 disabled:opacity-50"
          >
            {loading ? (
              <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
            ) : (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
            )}
            Generate Report
          </button>

          <button
            type="button"
            onClick={() => setShowSaveBookmark(true)}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 transition-colors hover:border-gray-400 hover:bg-gray-50"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" /></svg>
            Save Filter
          </button>

          {generated && data.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
              <span className="text-xs font-medium text-gray-400">Export:</span>
              <button type="button" onClick={exportCSV} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50">
                📄 CSV
              </button>
              <button type="button" onClick={exportExcel} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50">
                📊 Excel
              </button>
              <button type="button" onClick={exportPDF} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50">
                📋 PDF
              </button>
            </div>
          )}
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</div>
        )}
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-gray-100 bg-white px-4 py-3.5 shadow-sm">
            <div className="text-xl font-extrabold tabular-nums text-gray-900 sm:text-2xl">{summary.total.toLocaleString()}</div>
            <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Total Records</div>
          </div>
          {summary.amountCol && (
            <div className="rounded-xl border border-luma-100 bg-luma-50 px-4 py-3.5 shadow-sm">
              <div className="text-xl font-extrabold tabular-nums text-luma-700 sm:text-2xl">{formatKes(summary.totalAmount)}</div>
              <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-luma-600">Total Amount</div>
            </div>
          )}
          <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3.5 shadow-sm">
            <div className="text-xl font-extrabold tabular-nums text-emerald-700 sm:text-2xl">{summary.verifiedCount.toLocaleString()}</div>
            <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-600">Verified / Active</div>
          </div>
          <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3.5 shadow-sm">
            <div className="text-xl font-extrabold tabular-nums text-amber-700 sm:text-2xl">{summary.pendingCount.toLocaleString()}</div>
            <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-amber-600">Pending</div>
          </div>
        </div>
      )}

      {/* Results Table */}
      {generated && (
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 sm:px-6">
            <h2 className="text-sm font-bold text-gray-900">
              {reportTypes.find(r => r.value === reportType)?.label} — {data.length.toLocaleString()} record{data.length !== 1 ? 's' : ''}
            </h2>
          </div>

          {data.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <svg className="mx-auto h-10 w-10 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m6 4.125l2.25 2.25m0 0l2.25 2.25M12 13.875l2.25-2.25M12 13.875l-2.25 2.25M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
              </svg>
              <p className="mt-3 text-sm text-gray-500">No records found for the selected filters.</p>
              <p className="mt-1 text-xs text-gray-400">Try adjusting your filters or date range.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    {headers.map(h => (
                      <th key={h} className="whitespace-nowrap px-4 py-3">{headerLabel(h)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.slice(0, 200).map((row, i) => (
                    <tr key={i} className="transition-colors hover:bg-gray-50">
                      {headers.map(h => {
                        const val = row[h]
                        const strVal = val == null ? '' : String(val)

                        if (h === 'status') {
                          return (
                            <td key={h} className="px-4 py-3">
                              <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusColor(strVal)}`}>
                                {strVal || '—'}
                              </span>
                            </td>
                          )
                        }

                        if (h === 'amount_paid' || h.includes('amount') || h.includes('fee') || h === 'total') {
                          return <td key={h} className="whitespace-nowrap px-4 py-3 font-semibold tabular-nums text-gray-900">{formatKes(val)}</td>
                        }

                        if (h.includes('date') || h.includes('_at') || h.includes('joined')) {
                          return <td key={h} className="whitespace-nowrap px-4 py-3 text-gray-500">{formatDate(strVal)}</td>
                        }

                        return (
                          <td key={h} className="max-w-[200px] truncate whitespace-nowrap px-4 py-3 text-gray-700" title={strVal}>
                            {strVal || '—'}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.length > 200 && (
                <div className="border-t border-gray-100 px-6 py-3 text-center text-xs text-gray-500">
                  Showing 200 of {data.length.toLocaleString()} records. Export for full data.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Save Bookmark Modal */}
      {showSaveBookmark && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
            <div className="px-6 py-5">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-gray-900">Save Filter Combination</h3>
                <button type="button" onClick={() => setShowSaveBookmark(false)} className="text-gray-400 hover:text-gray-600" aria-label="Close">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>

              <div className="mt-4 rounded-lg bg-gray-50 px-4 py-3 text-xs text-gray-600">
                <div className="font-medium text-gray-700">Current filters:</div>
                <div className="mt-1 space-y-0.5">
                  <div>Type: {reportTypes.find(r => r.value === reportType)?.label}</div>
                  {status !== 'all' && <div>Status: {status}</div>}
                  {packageId !== 'all' && <div>Package: {packages.find(p => p.id === packageId)?.name ?? packageId}</div>}
                  {dateFrom && <div>From: {dateFrom}</div>}
                  {dateTo && <div>To: {dateTo}</div>}
                </div>
              </div>

              <div className="mt-4">
                <label htmlFor="bookmark-name" className="mb-1.5 block text-sm font-medium text-gray-700">Bookmark Name</label>
                <input
                  id="bookmark-name"
                  value={bookmarkName}
                  onChange={(e) => setBookmarkName(e.target.value)}
                  placeholder="e.g. Monthly Active Subscriptions"
                  className={filterControlClass}
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && saveBookmark()}
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-6 py-4">
              <button
                type="button"
                onClick={() => { setShowSaveBookmark(false); setBookmarkName('') }}
                className="inline-flex h-10 items-center rounded-lg border border-gray-200 px-4 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveBookmark}
                disabled={!bookmarkName.trim()}
                className="inline-flex h-10 items-center rounded-lg bg-luma-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-luma-800 disabled:opacity-50"
              >
                Save Bookmark
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
