// ─── CSV Helpers ────────────────────────────────────────────
// PDF imports are lazy-loaded to reduce initial bundle size

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
