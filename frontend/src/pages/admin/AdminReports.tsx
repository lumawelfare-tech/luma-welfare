import { useState } from 'react'
import { api } from '../../lib/api'

interface ReportRow {
  [key: string]: string | number | null
}

type ReportType = 'contributions' | 'subscriptions' | 'claims' | 'registration-fees' | 'members' | 'financial'

const reportTypes: { value: ReportType; label: string }[] = [
  { value: 'contributions', label: 'Contributions' },
  { value: 'subscriptions', label: 'Subscriptions' },
  { value: 'claims', label: 'Claims' },
  { value: 'registration-fees', label: 'Registration Fees' },
  { value: 'members', label: 'Members' },
  { value: 'financial', label: 'Financial Summary' },
]

const statusOptions = ['all', 'pending', 'verified', 'paid', 'failed', 'rejected', 'approved', 'active', 'cancelled']

function escapeCSV(value: string): string {
  // Prevent formula injection in spreadsheets
  if (/^[=+\-@\t\r]/.test(value)) {
    return `'${value}'`
  }
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function generateCSV(headers: string[], rows: ReportRow[]): string {
  const lines = [headers.map(escapeCSV).join(',')]
  for (const row of rows) {
    lines.push(headers.map(h => escapeCSV(String(row[h] ?? ''))).join(','))
  }
  return lines.join('\n')
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

async function exportExcel(headers: string[], rows: ReportRow[], title: string) {
  // Generate a simple XLSX-compatible XML (SpreadsheetML)
  const headerRow = headers.map(h => `<Cell><Data ss:Type="String">${escapeCSV(h)}</Data></Cell>`).join('')
  const dataRows = rows.map(row =>
    `<Row>${headers.map(h => {
      const v = row[h]
      const val = v == null ? '' : String(v)
      const num = Number(val)
      if (!isNaN(num) && val !== '') {
        return `<Cell><Data ss:Type="Number">${num}</Data></Cell>`
      }
      return `<Cell><Data ss:Type="String">${escapeCSV(val)}</Data></Cell>`
    }).join('')}</Row>`
  ).join('')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="${escapeCSV(title)}">
  <Table>
   <Row>${headerRow}</Row>
   ${dataRows}
  </Table>
 </Worksheet>
</Workbook>`

  const blob = new Blob([xml], { type: 'application/vnd.ms-excel' })
  downloadBlob(blob, `${title.replace(/\s+/g, '_')}.xls`)
}

async function exportPDF(headers: string[], rows: ReportRow[], title: string) {
  // Generate a simple HTML-based PDF (printable)
  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<title>${title}</title>
<style>
  body { font-family: Arial, sans-serif; margin: 20px; }
  h1 { color: #0f766e; font-size: 18px; }
  h2 { font-size: 14px; color: #333; margin-top: 4px; }
  .meta { font-size: 11px; color: #666; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th { background: #0f766e; color: white; padding: 8px 6px; text-align: left; }
  td { padding: 6px; border-bottom: 1px solid #e5e7eb; }
  tr:nth-child(even) { background: #f9fafb; }
  @media print { body { margin: 10mm; } }
</style></head><body>
<h1>Luma Welfare</h1>
<h2>${title}</h2>
<div class="meta">Generated: ${new Date().toLocaleDateString('en-KE', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
<table>
<thead><tr>${headers.map(h => `<th>${escapeCSV(h)}</th>`).join('')}</tr></thead>
<tbody>${rows.map(row => `<tr>${headers.map(h => `<td>${escapeCSV(String(row[h] ?? ''))}</td>`).join('')}</tr>`).join('')}</tbody>
</table>
</body></html>`

  const blob = new Blob([html], { type: 'text/html' })
  // Open in new window for printing/saving as PDF
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank')
}

export function AdminReports() {
  const [reportType, setReportType] = useState<ReportType>('contributions')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [status, setStatus] = useState('all')
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<ReportRow[]>([])
  const [error, setError] = useState('')
  const [generated, setGenerated] = useState(false)

  async function generateReport() {
    setLoading(true)
    setError('')
    setData([])
    setGenerated(false)

    try {
      const params = new URLSearchParams()
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)
      if (status !== 'all') params.set('status', status)
      params.set('type', reportType)

      const result = await api<{ report: string; data: ReportRow[]; generated_at: string }>(`/admin/reports?${params.toString()}`)
      const rows = result.data ?? []
      setData(rows)
      setGenerated(true)
    } catch (err: any) {
      setError(err.message || 'Failed to generate report')
    } finally {
      setLoading(false)
    }
  }

  function getHeaders(): string[] {
    if (data.length === 0) return []
    return Object.keys(data[0]).filter(k => !k.startsWith('_'))
  }

  function handleExport(format: 'csv' | 'excel' | 'pdf') {
    const headers = getHeaders()
    const title = `${reportTypes.find(r => r.value === reportType)?.label ?? reportType} Report`
    if (format === 'csv') {
      const csv = generateCSV(headers, data)
      downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${title.replace(/\s+/g, '_')}.csv`)
    } else if (format === 'excel') {
      exportExcel(headers, data, title)
    } else {
      exportPDF(headers, data, title)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
        <p className="text-sm text-gray-500 mt-1">Generate and export financial, membership, and claims reports.</p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Report Type</label>
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value as ReportType)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-luma-500 focus:ring-1 focus:ring-luma-500"
            >
              {reportTypes.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-luma-500 focus:ring-1 focus:ring-luma-500"
            >
              {statusOptions.map(s => (
                <option key={s} value={s}>{s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-luma-500 focus:ring-1 focus:ring-luma-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date To</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-luma-500 focus:ring-1 focus:ring-luma-500"
            />
          </div>
        </div>
        <div className="mt-4 flex gap-3">
          <button
            onClick={generateReport}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg bg-luma-700 px-4 py-2 text-sm font-medium text-white hover:bg-luma-800 disabled:opacity-50 transition-colors"
          >
            {loading ? (
              <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
            ) : (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75z" /></svg>
            )}
            Generate Report
          </button>
          {generated && data.length > 0 && (
            <div className="flex gap-2">
              <button onClick={() => handleExport('csv')} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
                CSV
              </button>
              <button onClick={() => handleExport('excel')} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
                Excel
              </button>
              <button onClick={() => handleExport('pdf')} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
                PDF
              </button>
            </div>
          )}
        </div>
        {error && (
          <div className="mt-3 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
      </div>

      {/* Results */}
      {generated && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">
              {reportTypes.find(r => r.value === reportType)?.label} — {data.length} record{data.length !== 1 ? 's' : ''}
            </h2>
          </div>
          {data.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-gray-500">
              No records found for the selected filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    {getHeaders().map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                        {h.replace(/_/g, ' ')}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.slice(0, 200).map((row, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      {getHeaders().map(h => (
                        <td key={h} className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">
                          {row[h] == null ? '—' : String(row[h])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.length > 200 && (
                <div className="px-6 py-3 text-xs text-gray-500 border-t border-gray-100">
                  Showing 200 of {data.length} records. Export for full data.
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
