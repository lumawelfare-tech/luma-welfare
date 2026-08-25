import { useEffect, useState } from 'react'
import { api } from '../../lib/api'

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
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`
  }
  return val
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
  // Simple XML-based Excel (SpreadsheetML)
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
      return `<Cell><Data ss:Type="${type}">${val}</Data></Cell>`
    }).join('') + '</Row>\n'
  }
  xml += '</Table>\n</Worksheet>\n</Workbook>'
  downloadBlob(xml, _filename, 'application/vnd.ms-excel')
}

function downloadPDF(transactions: Transaction[], _filename: string) {
  // Generate a printable HTML that the browser can print as PDF
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
      <td>${t.type}</td>
      <td>${t.description}</td>
      <td>${t.package ?? '—'}</td>
      <td style="text-align:right">KSh ${t.amount.toLocaleString('en-KE')}</td>
      <td>${t.status}</td>
      <td>${t.reference ?? '—'}</td>
    </tr>`
  }

  html += `<tr class="total"><td colspan="4">Total Verified</td><td style="text-align:right">KSh ${total.toLocaleString('en-KE')}</td><td colspan="2"></td></tr>`
  html += '</tbody></table></body></html>'

  const blob = new Blob([html], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank')
}

export function ReceiptsStatements() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [receipt, setReceipt] = useState<ReceiptData | null>(null)

  useEffect(() => {
    api<{ transactions: Transaction[] }>('/member/receipts/transactions', { auth: true })
      .then((d) => setTransactions(d.transactions ?? []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const filtered = filter
    ? transactions.filter((t) => t.type.toLowerCase().includes(filter.toLowerCase()) || t.status.toLowerCase().includes(filter.toLowerCase()))
    : transactions

  async function viewReceipt(id: string) {
    try {
      const d = await api<{ receipt: ReceiptData }>(`/member/receipts/receipt?id=${id}`, { auth: true })
      setReceipt(d.receipt)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load receipt.')
    }
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Receipts & Statements</h1>
          <p className="mt-1 text-sm text-gray-500">View your financial history and download statements.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => downloadCSV(filtered, 'luma-statement.csv')} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50">CSV</button>
          <button onClick={() => downloadExcel(filtered, 'luma-statement.xls')} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50">Excel</button>
          <button onClick={() => downloadPDF(filtered, 'luma-statement.pdf')} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50">PDF</button>
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

      {loading && <div className="mt-8 space-y-3">      {[1, 2, 3].map((i) => <div key={i} className="h-14 rounded-lg bg-gray-100 animate-pulse" />)}</div>}
      {error && <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {!loading && !error && (
        <div className="mt-6 overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Package</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Reference</th>
                <th className="px-4 py-3 text-right">Receipt</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3 text-xs text-gray-500">{new Date(t.date).toLocaleDateString()}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{t.type}</td>
                  <td className="px-4 py-3 text-gray-600">{t.package ?? '—'}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">KSh {t.amount.toLocaleString('en-KE')}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${statusColors[t.status] ?? 'bg-gray-50 text-gray-600 border-gray-200'}`}>{t.status}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{t.reference ?? '—'}</td>
                  <td className="px-4 py-3 text-right">
                    {(t.status === 'paid' || t.status === 'Paid' || t.status === 'Verified') && (
                      <button onClick={() => viewReceipt(t.id)} className="text-xs font-medium text-luma-600 hover:text-luma-700 hover:underline">View Receipt</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && <div className="p-12 text-center text-gray-500 text-sm">No transactions found.</div>}
        </div>
      )}

      {/* Receipt Modal */}
      {receipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setReceipt(null)}>
          <div className="w-full max-w-md rounded-xl bg-white shadow-2xl p-6" onClick={(e) => e.stopPropagation()}>
            <div className="text-center border-b border-gray-200 pb-4 mb-4">
              <div className="text-lg font-bold text-gray-900">Luma Welfare</div>
              <div className="text-xs text-gray-500">Community Welfare</div>
              <div className="mt-2 text-sm font-semibold text-gray-700">{receipt.type} Receipt</div>
              <div className="text-xs text-gray-400">{receipt.number}</div>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Member</span><span className="font-medium">{receipt.member?.full_name ?? '—'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Email</span><span>{receipt.member?.email ?? '—'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Phone</span><span>{receipt.member?.phone ?? '—'}</span></div>
              {receipt.package && <div className="flex justify-between"><span className="text-gray-500">Package</span><span className="font-medium">{receipt.package}</span></div>}
              <div className="flex justify-between"><span className="text-gray-500">Date</span><span>{new Date(receipt.date).toLocaleDateString()}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Amount</span><span className="font-bold text-lg">KSh {receipt.amount.toLocaleString('en-KE')}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Status</span><span className="font-semibold">{receipt.status}</span></div>
              {receipt.reference && <div className="flex justify-between"><span className="text-gray-500">Reference</span><span>{receipt.reference}</span></div>}
              {receipt.payment_method && <div className="flex justify-between"><span className="text-gray-500">Method</span><span>{receipt.payment_method}</span></div>}
            </div>
            <div className="mt-4 pt-4 border-t border-gray-200 flex justify-end gap-2">
              <button onClick={() => setReceipt(null)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
