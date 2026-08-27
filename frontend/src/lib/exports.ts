// ─── CSV Helpers ────────────────────────────────────────────
// PDF and Excel imports are lazy-loaded to reduce initial bundle size

function sanitizeCell(val: string | number | null | undefined): string {
  const str = String(val ?? '')
  // Prevent CSV formula injection
  if (/^[=+\-@\t\r]/.test(str)) return `'${str}`
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function downloadCSV(filename: string, headers: string[], rows: (string | number | null | undefined)[][]) {
  const csv = [
    headers.map(sanitizeCell).join(','),
    ...rows.map(row => row.map(sanitizeCell).join(',')),
  ].join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ─── PDF Helpers (lazy-loaded) ─────────────────────────────

async function loadPDFLib() {
  const [jsPDFModule, autoTableModule] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ])
  return { jsPDF: jsPDFModule.default, autoTable: autoTableModule.default }
}

async function createPDF(title: string) {
  const { jsPDF } = await loadPDFLib()
  const doc = new jsPDF()
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
  doc.text(title, 14, 37)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(130)
  doc.text(`Generated: ${new Date().toLocaleDateString('en-KE', { day: 'numeric', month: 'long', year: 'numeric' })}`, 14, 43)
  return doc
}

async function downloadPDF(doc: Awaited<ReturnType<typeof createPDF>>, filename: string) {
  doc.save(filename)
}

function formatKes(amount: number): string {
  return 'KSh ' + amount.toLocaleString()
}

// ─── Exports: Monthly Contributions ────────────────────────

export function exportContributionsCSV(data: { label: string; total: number; verified: number; pending: number }[]) {
  downloadCSV(
    'monthly_contributions.csv',
    ['Month', 'Total (KSh)', 'Verified (KSh)', 'Pending (KSh)'],
    data.map(d => [d.label, d.total, d.verified, d.pending]),
  )
}

export async function exportContributionsPDF(data: { label: string; total: number; verified: number; pending: number }[]) {
  const { autoTable } = await loadPDFLib()
  const doc = await createPDF('Monthly Contributions Report')
  const totalAll = data.reduce((s, d) => s + d.total, 0)
  const verifiedAll = data.reduce((s, d) => s + d.verified, 0)
  const pendingAll = data.reduce((s, d) => s + d.pending, 0)

  autoTable(doc, {
    startY: 50,
    head: [['Month', 'Total (KSh)', 'Verified (KSh)', 'Pending (KSh)']],
    body: data.map(d => [d.label, formatKes(d.total), formatKes(d.verified), formatKes(d.pending)]),
    foot: [['TOTAL', formatKes(totalAll), formatKes(verifiedAll), formatKes(pendingAll)]],
    footStyles: { fillColor: [109, 155, 58], textColor: 255, fontStyle: 'bold' },
    styles: { fontSize: 9 },
    headStyles: { fillColor: [109, 155, 58] },
  })

  downloadPDF(doc, 'monthly_contributions.pdf')
}

// ─── Exports: Package Breakdown ─────────────────────────────

export function exportPackageBreakdownCSV(data: { name: string; count: number }[]) {
  downloadCSV(
    'package_subscriptions.csv',
    ['Package', 'Active Subscribers'],
    data.map(d => [d.name, d.count]),
  )
}

export async function exportPackageBreakdownPDF(data: { name: string; count: number }[]) {
  const { autoTable } = await loadPDFLib()
  const doc = await createPDF('Active Subscriptions by Package')

  autoTable(doc, {
    startY: 50,
    head: [['Package', 'Active Subscribers']],
    body: data.map(d => [d.name, String(d.count)]),
    foot: [['TOTAL', String(data.reduce((s, d) => s + d.count, 0))]],
    footStyles: { fillColor: [109, 155, 58], textColor: 255, fontStyle: 'bold' },
    styles: { fontSize: 9 },
    headStyles: { fillColor: [109, 155, 58] },
  })

  downloadPDF(doc, 'package_subscriptions.pdf')
}

// ─── Exports: Claims by Status ──────────────────────────────

export function exportClaimsStatusCSV(data: Record<string, number>) {
  const entries = Object.entries(data).filter(([, v]) => v > 0)
  downloadCSV(
    'claims_by_status.csv',
    ['Status', 'Count'],
    entries.map(([name, count]) => [name, count]),
  )
}

export async function exportClaimsStatusPDF(data: Record<string, number>) {
  const { autoTable } = await loadPDFLib()
  const doc = await createPDF('Claims by Status')
  const entries = Object.entries(data).filter(([, v]) => v > 0)
  const total = entries.reduce((s, [, v]) => s + v, 0)

  autoTable(doc, {
    startY: 50,
    head: [['Status', 'Count', 'Percentage']],
    body: entries.map(([name, count]) => [name, String(count), `${((count / total) * 100).toFixed(1)}%`]),
    foot: [['TOTAL', String(total), '100%']],
    footStyles: { fillColor: [109, 155, 58], textColor: 255, fontStyle: 'bold' },
    styles: { fontSize: 9 },
    headStyles: { fillColor: [109, 155, 58] },
  })

  downloadPDF(doc, 'claims_by_status.pdf')
}

// ─── Exports: Registration Fees ─────────────────────────────

export function exportRegistrationFeesCSV(data: { total: number; paid: number; unpaid: number }) {
  downloadCSV(
    'registration_fees.csv',
    ['Metric', 'Value'],
    [
      ['Total Fees', data.total],
      ['Paid', data.paid],
      ['Unpaid', data.unpaid],
      ['Revenue (KSh)', data.paid * 300],
    ],
  )
}

export async function exportRegistrationFeesPDF(data: { total: number; paid: number; unpaid: number }) {
  const { autoTable } = await loadPDFLib()
  const doc = await createPDF('Registration Fees Report')

  autoTable(doc, {
    startY: 50,
    head: [['Metric', 'Value']],
    body: [
      ['Total Fees', String(data.total)],
      ['Paid', String(data.paid)],
      ['Unpaid', String(data.unpaid)],
      ['Revenue', formatKes(data.paid * 300)],
    ],
    styles: { fontSize: 9 },
    headStyles: { fillColor: [109, 155, 58] },
  })

  downloadPDF(doc, 'registration_fees.pdf')
}

// ─── Exports: Recent Transactions ───────────────────────────

export function exportTransactionsCSV(data: { member_name: string; package_name: string; amount: number; status: string; date: string }[]) {
  downloadCSV(
    'recent_transactions.csv',
    ['Member', 'Package', 'Amount (KSh)', 'Status', 'Date'],
    data.map(d => [
      d.member_name,
      d.package_name,
      d.amount,
      d.status,
      new Date(d.date).toLocaleDateString('en-KE'),
    ]),
  )
}

export async function exportTransactionsPDF(data: { member_name: string; package_name: string; amount: number; status: string; date: string }[]) {
  const { autoTable } = await loadPDFLib()
  const doc = await createPDF('Recent Transactions')

  autoTable(doc, {
    startY: 50,
    head: [['Member', 'Package', 'Amount (KSh)', 'Status', 'Date']],
    body: data.map(d => [
      d.member_name,
      d.package_name,
      formatKes(d.amount),
      d.status,
      new Date(d.date).toLocaleDateString('en-KE'),
    ]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [109, 155, 58] },
    columnStyles: {
      2: { halign: 'right' },
    },
  })

  downloadPDF(doc, 'recent_transactions.pdf')
}

// ─── Excel Helper (lazy-loaded) ─────────────────────────────

async function downloadExcel(filename: string, sheetName: string, headers: string[], rows: (string | number | null | undefined)[][], opts?: { filterSummary?: string }) {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()

  const wsData: (string | number | null | undefined)[][] = []
  if (opts?.filterSummary) {
    wsData.push([opts.filterSummary])
    wsData.push([`Generated: ${new Date().toLocaleString('en-KE')}`])
    wsData.push([])
  }
  wsData.push(headers)
  for (const row of rows) wsData.push(row)

  const ws = XLSX.utils.aoa_to_sheet(wsData)

  if (opts?.filterSummary) {
    ws['!cols'] = headers.map(() => ({ wch: 18 }))
  } else {
    ws['!cols'] = headers.map((h) => ({ wch: Math.max(h.length + 2, 14) }))
  }

  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  XLSX.writeFile(wb, filename)
}

// ─── Exports: Contribution Records (Admin page) ─────────────

export type ContributionRecord = {
  member_full_name: string
  member_phone: string
  period: string
  amount: number
  status: string
  package_name: string
  receipt_number: string
  created_at: string
  member_id: string
}

export function exportContributionRecordsCSV(records: ContributionRecord[]) {
  downloadCSV(
    `luma-welfare-contributions-${new Date().toISOString().slice(0, 10)}.csv`,
    ['Member Full Name', 'Phone Number', 'Period', 'Amount', 'Status', 'Package', 'Receipt / Reference', 'Created At', 'Member ID'],
    records.map(r => [
      r.member_full_name,
      r.member_phone,
      r.period,
      `KSh ${r.amount.toLocaleString('en-KE')}`,
      r.status,
      r.package_name,
      r.receipt_number,
      r.created_at ? new Date(r.created_at).toLocaleDateString('en-KE') : '—',
      r.member_id,
    ]),
  )
}

export async function exportContributionRecordsExcel(records: ContributionRecord[], filterSummary?: string) {
  const today = new Date().toISOString().slice(0, 10)
  await downloadExcel(
    `luma-welfare-contributions-${today}.xlsx`,
    'Contributions',
    ['Member Full Name', 'Phone Number', 'Period', 'Amount', 'Status', 'Package', 'Receipt / Reference', 'Created At', 'Member ID'],
    records.map(r => [
      r.member_full_name,
      r.member_phone,
      r.period,
      `KSh ${r.amount.toLocaleString('en-KE')}`,
      r.status,
      r.package_name,
      r.receipt_number,
      r.created_at ? new Date(r.created_at).toLocaleDateString('en-KE') : '—',
      r.member_id,
    ]),
    { filterSummary },
  )
}

export async function exportContributionRecordsPDF(records: ContributionRecord[], filterSummary?: string) {
  const { autoTable } = await loadPDFLib()
  const doc = await createPDF('Contribution Report')
  let startY = 50

  if (filterSummary) {
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(100)
    doc.text(filterSummary, 14, startY)
    startY += 6
  }

  doc.setFontSize(8)
  doc.setTextColor(130)
  doc.text(`Total: ${records.length} record${records.length !== 1 ? 's' : ''}`, 14, startY)
  startY += 6

  autoTable(doc, {
    startY,
    head: [['Member', 'Phone', 'Period', 'Amount', 'Status', 'Package', 'Reference', 'Date']],
    body: records.map(r => [
      r.member_full_name,
      r.member_phone,
      r.period,
      formatKes(r.amount),
      r.status,
      r.package_name,
      r.receipt_number,
      r.created_at ? new Date(r.created_at).toLocaleDateString('en-KE') : '—',
    ]),
    styles: { fontSize: 7 },
    headStyles: { fillColor: [109, 155, 58] },
    columnStyles: { 3: { halign: 'right' } },
    margin: { left: 14, right: 14 },
  })

  const today = new Date().toISOString().slice(0, 10)
  downloadPDF(doc, `luma-welfare-contributions-${today}.pdf`)
}

// ─── Exports: Subscription Records (Admin page) ─────────────

export type SubscriptionRecord = {
  member_full_name: string
  member_phone: string
  member_email: string
  package_name: string
  status: string
  started_at: string | null
  next_due_date: string | null
  created_at: string
  amount: number | null
}

export function exportSubscriptionsCSV(records: SubscriptionRecord[]) {
  downloadCSV(
    `luma-welfare-subscriptions-${new Date().toISOString().slice(0, 10)}.csv`,
    ['Member Full Name', 'Phone Number', 'Email', 'Package', 'Status', 'Start Date', 'Next Due', 'Amount', 'Created At'],
    records.map(r => [
      r.member_full_name,
      r.member_phone,
      r.member_email,
      r.package_name,
      r.status,
      r.started_at ? new Date(r.started_at).toLocaleDateString('en-KE') : '—',
      r.next_due_date ? new Date(r.next_due_date).toLocaleDateString('en-KE') : '—',
      r.amount != null ? `KSh ${r.amount.toLocaleString('en-KE')}` : '—',
      r.created_at ? new Date(r.created_at).toLocaleDateString('en-KE') : '—',
    ]),
  )
}

export async function exportSubscriptionsExcel(records: SubscriptionRecord[], filterSummary?: string) {
  const today = new Date().toISOString().slice(0, 10)
  await downloadExcel(
    `luma-welfare-subscriptions-${today}.xlsx`,
    'Subscriptions',
    ['Member Full Name', 'Phone Number', 'Email', 'Package', 'Status', 'Start Date', 'Next Due', 'Amount', 'Created At'],
    records.map(r => [
      r.member_full_name,
      r.member_phone,
      r.member_email,
      r.package_name,
      r.status,
      r.started_at ? new Date(r.started_at).toLocaleDateString('en-KE') : '—',
      r.next_due_date ? new Date(r.next_due_date).toLocaleDateString('en-KE') : '—',
      r.amount != null ? `KSh ${r.amount.toLocaleString('en-KE')}` : '—',
      r.created_at ? new Date(r.created_at).toLocaleDateString('en-KE') : '—',
    ]),
    { filterSummary },
  )
}

export async function exportSubscriptionsPDF(records: SubscriptionRecord[], filterSummary?: string) {
  const { autoTable } = await loadPDFLib()
  const doc = await createPDF('Subscription Report')
  let startY = 50

  if (filterSummary) {
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(100)
    doc.text(filterSummary, 14, startY)
    startY += 6
  }

  doc.setFontSize(8)
  doc.setTextColor(130)
  doc.text(`Total: ${records.length} subscription${records.length !== 1 ? 's' : ''}`, 14, startY)
  startY += 6

  autoTable(doc, {
    startY,
    head: [['Member', 'Phone', 'Package', 'Status', 'Started', 'Next Due', 'Amount']],
    body: records.map(r => [
      r.member_full_name,
      r.member_phone,
      r.package_name,
      r.status,
      r.started_at ? new Date(r.started_at).toLocaleDateString('en-KE') : '—',
      r.next_due_date ? new Date(r.next_due_date).toLocaleDateString('en-KE') : '—',
      r.amount != null ? formatKes(r.amount) : '—',
    ]),
    styles: { fontSize: 7 },
    headStyles: { fillColor: [109, 155, 58] },
    columnStyles: { 6: { halign: 'right' } },
    margin: { left: 14, right: 14 },
  })

  const today = new Date().toISOString().slice(0, 10)
  downloadPDF(doc, `luma-welfare-subscriptions-${today}.pdf`)
}
