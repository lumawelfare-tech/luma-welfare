import { useState, useEffect } from 'react'
import { useHead } from '../../lib/seo'
import { api } from '../../lib/api'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

type ReportType = 'contributions' | 'subscriptions' | 'claims' | 'registration-fees' | 'members' | 'financial'

type ReportRow = Record<string, string | number | null>

type Package = { id: string; name: string; code: string | null }

const reportTypes: { value: ReportType; label: string; description: string; icon: string }[] = [
  { value: 'contributions', label: 'Contributions', description: 'Member contribution records', icon: '💰' },
  { value: 'subscriptions', label: 'Subscriptions', description: 'Package subscription records', icon: '📋' },
  { value: 'claims', label: 'Claims', description: 'Claim applications and decisions', icon: '📝' },
  { value: 'registration-fees', label: 'Registration Fees', description: 'KSh 300 activation payments', icon: '🎫' },
  { value: 'members', label: 'Members', description: 'Member registration records', icon: '👥' },
  { value: 'financial', label: 'Financial Summary', description: 'Aggregated financial overview', icon: '📊' },
]

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

function escapeCSV(val: string): string {
  if (/^[=+\-@\t\r]/.test(val)) return `'${val}`
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`
  }
  return val
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

function formatKes(amount: number | string | null): string {
  if (amount == null) return '—'
  const n = Number(amount)
  return isNaN(n) ? String(amount) : 'KSh ' + n.toLocaleString()
}

function formatDate(val: string | null): string {
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

  // KPI state
  type KpiData = {
    total_members: number
    active_subscriptions: number
    total_contributions: number
    total_claims_approved: number
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

  // Reset status filter when report type changes
  useEffect(() => {
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

      const result = await api<{ data: ReportRow[]; summary?: Record<string, number> }>(`/admin/reports?${params}`)
      setData(result.data ?? [])
      setGenerated(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to generate report')
    } finally {
      setLoading(false)
    }
  }

  function getHeaders(): string[] {
    if (data.length === 0) return []
    return Object.keys(data[0]).filter(k => !k.startsWith('_'))
  }

  function headerLabel(h: string): string {
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
      headers.map(escapeCSV).join(','),
      ...data.map(row => headers.map(h => escapeCSV(String(row[h] ?? ''))).join(',')),
    ].join('\n')
    downloadBlob(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }), `${title.replace(/\s+/g, '_')}.csv`)
  }

  function exportExcel() {
    const headers = getHeaders()
    const title = reportTypes.find(r => r.value === reportType)?.label ?? reportType
    const headerRow = headers.map(h => `<Cell><Data ss:Type="String">${escapeCSV(headerLabel(h))}</Data></Cell>`).join('')
    const dataRows = data.map(row =>
      `<Row>${headers.map(h => {
        const v = row[h]
        const val = v == null ? '' : String(v)
        const num = Number(val)
        return !isNaN(num) && val !== ''
          ? `<Cell><Data ss:Type="Number">${num}</Data></Cell>`
          : `<Cell><Data ss:Type="String">${escapeCSV(val)}</Data></Cell>`
      }).join('')}</Row>`
    ).join('')
    const xml = `<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="${escapeCSV(title)}"><Table><Row>${headerRow}</Row>${dataRows}</Table></Worksheet></Workbook>`
    downloadBlob(new Blob([xml], { type: 'application/vnd.ms-excel' }), `${title.replace(/\s+/g, '_')}.xls`)
  }

  function exportPDF() {
    const headers = getHeaders()
    const title = reportTypes.find(r => r.value === reportType)?.label ?? reportType
    const doc = new jsPDF({ orientation: headers.length > 6 ? 'landscape' : 'portrait' })

    // Header
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
        if (v == null) return ''
        const s = String(v)
        // Format dates
        if (h.includes('date') || h.includes('at') || h.includes('joined')) return formatDate(s)
        // Format amounts
        if (h.includes('amount') || h.includes('fee')) return formatKes(s)
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
    const amountCol = headers.find(h => h.includes('amount') || h.includes('fee'))
    const statusCol = headers.find(h => h === 'status')

    const total = data.length
    let totalAmount = 0
    let verifiedCount = 0
    let pendingCount = 0

    for (const row of data) {
      if (amountCol) totalAmount += Number(row[amountCol]) || 0
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
    <div className="py-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
          <p className="mt-1 text-sm text-gray-500">Generate and export financial, membership, and claims reports.</p>
        </div>
      </div>

      {/* KPI Overview */}
      {kpi && (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-2xl border border-gray-100 bg-white p-5 transition-all hover:shadow-md">
            <div className="text-2xl font-extrabold text-gray-900">{kpi.total_members.toLocaleString()}</div>
            <div className="mt-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Total Members</div>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-blue-50 p-5 transition-all hover:shadow-md">
            <div className="text-2xl font-extrabold text-blue-700">{kpi.active_subscriptions.toLocaleString()}</div>
            <div className="mt-1 text-xs font-semibold uppercase tracking-wide text-blue-600">Active Subscriptions</div>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-luma-50 p-5 transition-all hover:shadow-md">
            <div className="text-2xl font-extrabold text-luma-700">KSh {kpi.total_contributions.toLocaleString()}</div>
            <div className="mt-1 text-xs font-semibold uppercase tracking-wide text-luma-600">Total Contributions</div>
            <div className="mt-0.5 text-xs text-gray-400">
              This month: KSh {kpi.this_month_contributions.toLocaleString()}
              {kpi.contributions_growth_pct !== 0 && (
                <span className={`ml-1 font-semibold ${kpi.contributions_growth_pct > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                  {kpi.contributions_growth_pct > 0 ? '↑' : '↓'}{Math.abs(kpi.contributions_growth_pct)}%
                </span>
              )}
            </div>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-amber-50 p-5 transition-all hover:shadow-md">
            <div className="text-2xl font-extrabold text-amber-700">KSh {kpi.registration_fees_collected.toLocaleString()}</div>
            <div className="mt-1 text-xs font-semibold uppercase tracking-wide text-amber-600">Registration Fees</div>
            <div className="mt-0.5 text-xs text-gray-400">{kpi.paid_registration_fees} paid · {kpi.unpaid_registration_fees} unpaid</div>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-emerald-50 p-5 transition-all hover:shadow-md">
            <div className="text-2xl font-extrabold text-emerald-700">KSh {kpi.total_claims_approved.toLocaleString()}</div>
            <div className="mt-1 text-xs font-semibold uppercase tracking-wide text-emerald-600">Claims Approved</div>
            <div className="mt-0.5 text-xs text-gray-400">{kpi.this_month_claims} this month</div>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-purple-50 p-5 transition-all hover:shadow-md">
            <div className="flex items-baseline gap-2">
              <div className="text-2xl font-extrabold text-purple-700">{kpi.pending_contributions}</div>
              <div className="text-sm text-purple-400">/</div>
              <div className="text-lg font-bold text-purple-500">{kpi.pending_claims}</div>
            </div>
            <div className="mt-1 text-xs font-semibold uppercase tracking-wide text-purple-600">Pending</div>
            <div className="mt-0.5 text-xs text-gray-400">Contributions / Claims</div>
          </div>
        </div>
      )}

      {/* Report Type Selector */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {reportTypes.map((r) => (
          <button
            key={r.value}
            onClick={() => setReportType(r.value)}
            className={`rounded-xl border p-4 text-left transition-all ${
              reportType === r.value
                ? 'border-luma-500 bg-luma-50 shadow-sm ring-1 ring-luma-500'
                : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
            }`}
          >
            <div className="text-xl">{r.icon}</div>
            <div className={`mt-2 text-sm font-semibold ${reportType === r.value ? 'text-luma-700' : 'text-gray-900'}`}>{r.label}</div>
            <div className="mt-0.5 text-xs text-gray-500">{r.description}</div>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-luma-500 focus:ring-1 focus:ring-luma-500"
            >
              {statusOptions(reportType).map(s => (
                <option key={s} value={s}>{s === 'all' ? 'All Statuses' : s.charAt(0).toUpperCase() + s.slice(1).toLowerCase().replace(/_/g, ' ')}</option>
              ))}
            </select>
          </div>

          {reportType !== 'members' && reportType !== 'financial' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Package</label>
              <select
                value={packageId}
                onChange={(e) => setPackageId(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-luma-500 focus:ring-1 focus:ring-luma-500"
              >
                <option value="all">All Packages</option>
                {packages.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-luma-500 focus:ring-1 focus:ring-luma-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date To</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-luma-500 focus:ring-1 focus:ring-luma-500"
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            onClick={generateReport}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg bg-luma-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-luma-800 disabled:opacity-50 transition-colors"
          >
            {loading ? (
              <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
            ) : (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
            )}
            Generate Report
          </button>

          {generated && data.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">Export:</span>
              <button onClick={exportCSV} className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                📄 CSV
              </button>
              <button onClick={exportExcel} className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                📊 Excel
              </button>
              <button onClick={exportPDF} className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                📋 PDF
              </button>
            </div>
          )}
        </div>

        {error && (
          <div className="mt-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
        )}
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-2xl border border-gray-100 bg-white p-5">
            <div className="text-2xl font-extrabold text-gray-900">{summary.total.toLocaleString()}</div>
            <div className="mt-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Total Records</div>
          </div>
          {summary.amountCol && (
            <div className="rounded-2xl border border-gray-100 bg-luma-50 p-5">
              <div className="text-2xl font-extrabold text-luma-700">{formatKes(summary.totalAmount)}</div>
              <div className="mt-1 text-xs font-semibold uppercase tracking-wide text-luma-600">Total Amount</div>
            </div>
          )}
          <div className="rounded-2xl border border-gray-100 bg-emerald-50 p-5">
            <div className="text-2xl font-extrabold text-emerald-700">{summary.verifiedCount.toLocaleString()}</div>
            <div className="mt-1 text-xs font-semibold uppercase tracking-wide text-emerald-600">Verified / Active</div>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-amber-50 p-5">
            <div className="text-2xl font-extrabold text-amber-700">{summary.pendingCount.toLocaleString()}</div>
            <div className="mt-1 text-xs font-semibold uppercase tracking-wide text-amber-600">Pending</div>
          </div>
        </div>
      )}

      {/* Results Table */}
      {generated && (
        <div className="mt-6 overflow-hidden rounded-2xl border border-gray-200 bg-white">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
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
                      <th key={h} className="px-4 py-3 whitespace-nowrap">{headerLabel(h)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.slice(0, 200).map((row, i) => (
                    <tr key={i} className="hover:bg-gray-50 transition-colors">
                      {headers.map(h => {
                        const val = row[h]
                        const strVal = val == null ? '' : String(val)

                        // Status badge
                        if (h === 'status') {
                          return (
                            <td key={h} className="px-4 py-3">
                              <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusColor(strVal)}`}>
                                {strVal || '—'}
                              </span>
                            </td>
                          )
                        }

                        // Amount formatting
                        if (h.includes('amount') || h.includes('fee')) {
                          return <td key={h} className="px-4 py-3 font-semibold text-gray-900 whitespace-nowrap">{formatKes(val)}</td>
                        }

                        // Date formatting
                        if (h.includes('date') || h.includes('at') || h.includes('joined')) {
                          return <td key={h} className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDate(strVal)}</td>
                        }

                        return (
                          <td key={h} className="px-4 py-3 text-gray-700 whitespace-nowrap max-w-[200px] truncate" title={strVal}>
                            {strVal || '—'}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.length > 200 && (
                <div className="px-6 py-3 text-xs text-gray-500 border-t border-gray-100 text-center">
                  Showing 200 of {data.length.toLocaleString()} records. Export for full data.
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
