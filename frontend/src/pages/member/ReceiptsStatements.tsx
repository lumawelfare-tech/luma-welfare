import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { useToast } from '../../components/Toast'
import { EmptyState } from '../../components/EmptyState'
import { SkeletonRow } from '../../components/Skeleton'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'

function escapeHtml(str: string | null | undefined): string {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function escapeXml(str: string | null | undefined): string {
  if (!str) return ''
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

type Transaction = {
  id: string
  type: string
  description: string
  package: string | null
  amount: number
  currency: string
  status: string
  payment_method: string | null
  reference: string | null
  date: string
}

type ReceiptData = {
  type: string
  number: string
  member: { full_name: string | null; email: string | null; phone: string | null; membership_number: string | null } | null
  amount: number
  currency: string
  status: string
  payment_method: string | null
  reference: string | null
  date: string
  package: string | null
  period?: string
}

const statusColors: Record<string, string> = {
  paid: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Verified: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Paid: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  Pending: 'bg-amber-50 text-amber-700 border-amber-200',
  Submitted: 'bg-blue-50 text-blue-700 border-blue-200',
  Failed: 'bg-red-50 text-red-700 border-red-200',
  unpaid: 'bg-gray-50 text-gray-600 border-gray-200',
}

function escapeCSV(val: string): string {
  const safe = val ?? ''
  if (/^[=+\-@\t\r]/.test(safe)) return `'${safe.replace(/"/g, '""')}`
  return `"${safe.replace(/"/g, '""')}"`
}

function toCSV(transactions: Transaction[]): string {
  const headers = ['Date', 'Type', 'Description', 'Package', 'Amount', 'Currency', 'Status', 'Payment Method', 'Reference']
  const rows = transactions.map(t => [
    new Date(t.date).toLocaleDateString(),
    t.type,
    t.description,
    t.package ?? '',
    String(t.amount),
    t.currency,
    t.status,
    t.payment_method ?? '',
    t.reference ?? '',
  ].map(escapeCSV).join(','))
  return [headers.join(','), ...rows].join('\n')
}

function downloadBlob(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function downloadCSV(transactions: Transaction[], filename: string) {
  downloadBlob(toCSV(transactions), filename, 'text/csv;charset=utf-8')
}

function downloadExcel(transactions: Transaction[], _filename: string) {
  const headers = ['Date', 'Type', 'Description', 'Package', 'Amount', 'Currency', 'Status', 'Payment Method', 'Reference']
  const rows = transactions.map(t => [
    new Date(t.date).toLocaleDateString(),
    t.type,
    t.description,
    t.package ?? '',
    t.amount,
    t.currency,
    t.status,
    t.payment_method ?? '',
    t.reference ?? '',
  ])

  let xml = '<?xml version="1.0"?>\n<?mso-application progid="Excel.Sheet"?>\n'
  xml += '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"\n'
  xml += ' xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">\n'
  xml += '<Styles><Style ss:ID="header"><Font ss:Bold="1"/></Style></Styles>\n'
  xml += '<Worksheet ss:Name="Transactions">\n<Table>\n'
  xml += '<Row>' + headers.map(h => `<Cell ss:StyleID="header"><Data ss:Type="String">${h}</Data></Cell>`).join('') + '</Row>\n'
  for (const row of rows) {
    xml += '<Row>' + row.map((val) => {
      const type = typeof val === 'number' ? 'Number' : 'String'
      return `<Cell><Data ss:Type="${type}">${escapeXml(String(val))}</Data></Cell>`
    }).join('') + '</Row>\n'
  }
  xml += '</Table>\n</Worksheet>\n</Workbook>'
  downloadBlob(xml, _filename, 'application/vnd.ms-excel')
}

function downloadPDFStatement(transactions: Transaction[], _filename: string) {
  const title = 'Luma Welfare — Financial Statement'
  const date = new Date().toLocaleDateString()
  let html = `<!DOCTYPE html><html><head><title>${title}</title>
<style>
  body { font-family: Arial, sans-serif; margin: 40px; color: #333; }
  h1 { font-size: 20px; margin-bottom: 4px; }
  .subtitle { color: #666; font-size: 12px; margin-bottom: 24px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th { background: #f3f4f6; text-align: left; padding: 8px; border-bottom: 2px solid #d1d5db; }
  td { padding: 6px 8px; border-bottom: 1px solid #e5e7eb; }
  .total { font-weight: bold; border-top: 2px solid #333; }
  @media print { body { margin: 20px; } }
</style></head><body>
<h1>${title}</h1>
<p class="subtitle">Generated: ${date} | Transactions: ${transactions.length}</p>
<table><thead><tr>
  <th>Date</th><th>Type</th><th>Description</th><th>Package</th><th>Amount</th><th>Status</th><th>Reference</th>
</tr></thead><tbody>`

  let total = 0
  for (const t of transactions) {
    if (t.status === 'paid' || t.status === 'Paid' || t.status === 'Verified') total += t.amount
    html += `<tr>
      <td>${new Date(t.date).toLocaleDateString()}</td>
      <td>${escapeHtml(t.type)}</td>
      <td>${escapeHtml(t.description)}</td>
      <td>${escapeHtml(t.package ?? '—')}</td>
      <td style="text-align:right">KSh ${t.amount.toLocaleString('en-KE')}</td>
      <td>${escapeHtml(t.status)}</td>
      <td>${escapeHtml(t.reference ?? '—')}</td>
    </tr>`
  }

  html += `<tr class="total"><td colspan="4">Total Verified</td><td style="text-align:right">KSh ${total.toLocaleString('en-KE')}</td><td colspan="2"></td></tr>`
  html += '</tbody></table></body></html>'

  const blob = new Blob([html], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank')
}

function downloadReceiptPDF(r: ReceiptData) {
  const title = `${escapeHtml(r.type)} Receipt`
  const html = `<!DOCTYPE html><html><head><title>${escapeHtml(r.number)}</title>
<style>
  body { font-family: Arial, sans-serif; margin: 40px; color: #333; }
  .header { text-align: center; border-bottom: 2px solid #006B2E; padding-bottom: 16px; margin-bottom: 24px; }
  .brand { font-size: 24px; font-weight: bold; color: #006B2E; }
  .sub { color: #666; font-size: 12px; }
  .title { font-size: 16px; font-weight: bold; margin-top: 8px; }
  .receipt-no { color: #999; font-size: 11px; }
  .field { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f0f0f0; }
  .label { color: #666; }
  .value { font-weight: 600; }
  .amount { font-size: 24px; font-weight: bold; color: #006B2E; text-align: center; margin: 24px 0; }
  .footer { margin-top: 32px; text-align: center; color: #999; font-size: 10px; border-top: 1px solid #eee; padding-top: 16px; }
</style></head><body>
<div class="header">
  <div class="brand">Luma Welfare</div>
  <div class="sub">Community Welfare Management System</div>
  <div class="title">${title}</div>
  <div class="receipt-no">${escapeHtml(r.number)}</div>
</div>
<div class="field"><span class="label">Member</span><span class="value">${escapeHtml(r.member?.full_name ?? '—')}</span></div>
<div class="field"><span class="label">Membership #</span><span class="value">${escapeHtml(r.member?.membership_number ?? '—')}</span></div>
<div class="field"><span class="label">Email</span><span>${escapeHtml(r.member?.email ?? '—')}</span></div>
<div class="field"><span class="label">Phone</span><span>${escapeHtml(r.member?.phone ?? '—')}</span></div>
${r.package ? `<div class="field"><span class="label">Package</span><span class="value">${escapeHtml(r.package)}</span></div>` : ''}
${r.period ? `<div class="field"><span class="label">Period</span><span>${escapeHtml(r.period)}</span></div>` : ''}
<div class="field"><span class="label">Date</span><span>${new Date(r.date).toLocaleDateString('en-KE', { day: 'numeric', month: 'long', year: 'numeric' })}</span></div>
<div class="field"><span class="label">Status</span><span class="value">${escapeHtml(r.status)}</span></div>
${r.payment_method ? `<div class="field"><span class="label">Payment Method</span><span>${escapeHtml(r.payment_method)}</span></div>` : ''}
${r.reference ? `<div class="field"><span class="label">Reference</span><span>${escapeHtml(r.reference)}</span></div>` : ''}
<div class="amount">KSh ${r.amount.toLocaleString('en-KE')}</div>
<div class="footer">
  <p>This is a computer-generated receipt. No signature required.</p>
  <p>Generated: ${new Date().toLocaleDateString('en-KE', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
</div>
</body></html>`

  const blob = new Blob([html], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank')
}

export function ReceiptsStatements() {
  const { addToast } = useToast()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const debouncedFilter = useDebouncedValue(filter)
  const [receipt, setReceipt] = useState<ReceiptData | null>(null)

  useEffect(() => {
    api<{ transactions: Transaction[] }>('/member/receipts/transactions', { auth: true })
      .then((d) => setTransactions(d.transactions ?? []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const filtered = debouncedFilter
    ? transactions.filter((t) => t.type.toLowerCase().includes(debouncedFilter.toLowerCase()) || t.status.toLowerCase().includes(debouncedFilter.toLowerCase()))
    : transactions

  async function viewReceipt(id: string) {
    try {
      const d = await api<{ receipt: ReceiptData }>(`/member/receipts/receipt?id=${id}`, { auth: true })
      setReceipt(d.receipt)
    } catch (e) {
      addToast('error', e instanceof Error ? e.message : 'Could not load receipt.')
    }
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Receipts & Statements</h1>
          <p className="mt-1 text-sm text-gray-500">{transactions.length} transaction{transactions.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => downloadCSV(filtered, 'luma-statement.csv')} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50">CSV</button>
          <button onClick={() => downloadExcel(filtered, 'luma-statement.xls')} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50">Excel</button>
          <button onClick={() => downloadPDFStatement(filtered, 'luma-statement.pdf')} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50">PDF</button>
        </div>
      </div>

      {/* Filters */}
      <div className="mt-6 flex gap-2">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by type or status…"
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-luma-500 w-64"
        />
      </div>

      {loading && (
        <div className="mt-8 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)}
        </div>
      )}
      {error && <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {!loading && !error && (
        <div className="mt-6 overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3 hidden sm:table-cell">Package</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 hidden md:table-cell">Reference</th>
                <th className="px-4 py-3 text-right">Receipt</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3 text-xs text-gray-500">{new Date(t.date).toLocaleDateString()}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{t.type}</td>
                  <td className="px-4 py-3 text-gray-600 hidden sm:table-cell">{t.package ?? '—'}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">KSh {t.amount.toLocaleString('en-KE')}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${statusColors[t.status] ?? 'bg-gray-50 text-gray-600 border-gray-200'}`}>{t.status}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 hidden md:table-cell">{t.reference ?? '—'}</td>
                  <td className="px-4 py-3 text-right">
                    {(t.status === 'paid' || t.status === 'Paid' || t.status === 'Verified') && (
                      <button onClick={() => viewReceipt(t.id)} className="text-xs font-medium text-luma-600 hover:text-luma-700 hover:underline">View Receipt</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <EmptyState
              icon="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
              title="No transactions found"
              message="Your financial transactions will appear here."
            />
          )}
        </div>
      )}

      {/* Receipt Modal */}
      {receipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setReceipt(null)} role="dialog" aria-modal="true" aria-label="Receipt">
          <div className="w-full max-w-md rounded-xl bg-white shadow-2xl p-6" onClick={(e) => e.stopPropagation()}>
            <div className="text-center border-b border-gray-200 pb-4 mb-4">
              <div className="text-lg font-bold text-gray-900">Luma Welfare</div>
              <div className="text-xs text-gray-500">Community Welfare</div>
              <div className="mt-2 text-sm font-semibold text-gray-700">{receipt.type} Receipt</div>
              <div className="text-xs text-gray-400">{receipt.number}</div>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Member</span><span className="font-medium">{receipt.member?.full_name ?? '—'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Membership #</span><span>{receipt.member?.membership_number ?? '—'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Email</span><span>{receipt.member?.email ?? '—'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Phone</span><span>{receipt.member?.phone ?? '—'}</span></div>
              {receipt.package && <div className="flex justify-between"><span className="text-gray-500">Package</span><span className="font-medium">{receipt.package}</span></div>}
              {receipt.period && <div className="flex justify-between"><span className="text-gray-500">Period</span><span>{receipt.period}</span></div>}
              <div className="flex justify-between"><span className="text-gray-500">Date</span><span>{new Date(receipt.date).toLocaleDateString()}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Amount</span><span className="font-bold text-lg">KSh {receipt.amount.toLocaleString('en-KE')}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Status</span><span className="font-semibold">{receipt.status}</span></div>
              {receipt.reference && <div className="flex justify-between"><span className="text-gray-500">Reference</span><span>{receipt.reference}</span></div>}
              {receipt.payment_method && <div className="flex justify-between"><span className="text-gray-500">Method</span><span>{receipt.payment_method}</span></div>}
            </div>
            <div className="mt-4 pt-4 border-t border-gray-200 flex justify-end gap-2">
              <button onClick={() => downloadReceiptPDF(receipt)} className="rounded-lg bg-luma-700 px-4 py-2 text-sm font-semibold text-white hover:bg-luma-800">Download PDF</button>
              <button onClick={() => setReceipt(null)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
