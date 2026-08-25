import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { useHead } from '../../lib/seo'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area,
} from 'recharts'
import {
  exportContributionsCSV, exportContributionsPDF,
  exportPackageBreakdownCSV, exportPackageBreakdownPDF,
  exportClaimsStatusCSV, exportClaimsStatusPDF,
  exportRegistrationFeesCSV, exportRegistrationFeesPDF,
  exportTransactionsCSV, exportTransactionsPDF,
} from '../../lib/exports'

type DashboardData = {
  members: number
  subscriptions: number
  pending_contributions: number
  pending_claims: number
  approved_claims: number
  paid_claims: number
  confirmed_stats: Record<string, unknown>
  monthly_contributions: { month: string; label: string; total: number; verified: number; pending: number }[]
  package_breakdown: { name: string; count: number }[]
  claims_by_status: Record<string, number>
  registration_fees: { total: number; paid: number; unpaid: number }
  recent_transactions: { id: string; amount: number; status: string; date: string; member_name: string; package_name: string }[]
}

const PIE_COLORS = ['#6D9B3A', '#2563EB', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#EC4899', '#14B8A6']

function ExportButtons({ onCSV, onPDF }: { onCSV: () => void; onPDF: () => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <button onClick={onCSV} className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors">
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
        CSV
      </button>
      <button onClick={onPDF} className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors">
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
        PDF
      </button>
    </div>
  )
}

function StatCard({ label, value, color, icon }: { label: string; value: number | string; color: string; icon: React.ReactNode }) {
  return (
    <div className={`rounded-2xl border border-gray-100 p-5 transition-all hover:shadow-md ${color}`}>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-3xl font-extrabold">{value}</div>
          <div className="mt-1 text-xs font-semibold uppercase tracking-wide opacity-75">{label}</div>
        </div>
        <div className="opacity-40">{icon}</div>
      </div>
    </div>
  )
}

function formatKes(amount: number) {
  return 'KSh ' + amount.toLocaleString()
}

function ClaimsPieChart({ data }: { data: Record<string, number> }) {
  const entries = Object.entries(data).filter(([, v]) => v > 0)
  if (entries.length === 0) return <div className="flex h-full items-center justify-center text-sm text-gray-400">No claims data</div>
  const chartData = entries.map(([name, value]) => ({ name, value }))
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie data={chartData} cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={3} dataKey="value" label={({ name, percent }: { name?: string; percent?: number }) => `${name ?? ''} ${((percent ?? 0) * 100).toFixed(0)}%`} labelLine={false}>
          {chartData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
        </Pie>
        <Tooltip formatter={(val) => [val, 'Claims']} />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  )
}

function ContribChart({ data }: { data: DashboardData['monthly_contributions'] }) {
  if (data.length === 0) return <div className="flex h-full items-center justify-center text-sm text-gray-400">No contribution data</div>
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
        <defs>
          <linearGradient id="verifiedGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#6D9B3A" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#6D9B3A" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="pendingGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#F59E0B" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#9CA3AF" />
        <YAxis tick={{ fontSize: 11 }} stroke="#9CA3AF" tickFormatter={(v) => Number(v) >= 1000 ? `${(Number(v) / 1000).toFixed(0)}k` : String(v)} />
        <Tooltip formatter={(val) => formatKes(Number(val))} labelStyle={{ fontWeight: 600 }} />
        <Legend />
        <Area type="monotone" dataKey="verified" stroke="#6D9B3A" fill="url(#verifiedGrad)" name="Verified" />
        <Area type="monotone" dataKey="pending" stroke="#F59E0B" fill="url(#pendingGrad)" name="Pending" />
      </AreaChart>
    </ResponsiveContainer>
  )
}

function PackageBarChart({ data }: { data: DashboardData['package_breakdown'] }) {
  if (data.length === 0) return <div className="flex h-full items-center justify-center text-sm text-gray-400">No subscription data</div>
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11 }} stroke="#9CA3AF" />
        <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11 }} stroke="#9CA3AF" />
        <Tooltip />
        <Bar dataKey="count" fill="#6D9B3A" radius={[0, 6, 6, 0]} name="Active Subs" />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function AdminDashboard() {
  useHead('Admin Dashboard', undefined, { noindex: true })
  const { member } = useAuth()
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api<DashboardData>('/admin/dashboard', { auth: true })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (error) {
    return (
      <div className="container-luma py-16 text-center">
        <div className="mx-auto max-w-md rounded-3xl border border-red-200 bg-red-50 p-8">
          <p className="text-lg font-bold text-red-700">No admin access</p>
          <p className="mt-2 text-sm text-gray-600">
            {error}. If you are an admin, make sure your account is in the admins table.
          </p>
        </div>
      </div>
    )
  }

  if (loading || !data) {
    return <div className="container-luma py-16 text-center text-gray-500">Loading admin…</div>
  }

  const totalContributions = data.monthly_contributions.reduce((s, m) => s + m.total, 0)
  const totalVerified = data.monthly_contributions.reduce((s, m) => s + m.verified, 0)

  const stats = [
    {
      label: 'Total Members',
      value: data.members,
      color: 'bg-luma-50 text-luma-700',
      icon: <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>,
    },
    {
      label: 'Active Subscriptions',
      value: data.subscriptions,
      color: 'bg-blue-50 text-blue-700',
      icon: <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" /></svg>,
    },
    {
      label: 'Total Contributions',
      value: formatKes(totalContributions),
      color: 'bg-emerald-50 text-emerald-700',
      icon: <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
    },
    {
      label: 'Pending Claims',
      value: data.pending_claims,
      color: 'bg-purple-50 text-purple-700',
      icon: <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>,
    },
    {
      label: 'Approved Claims',
      value: data.approved_claims,
      color: 'bg-green-50 text-green-700',
      icon: <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
    },
    {
      label: 'Paid Claims',
      value: data.paid_claims,
      color: 'bg-amber-50 text-amber-700',
      icon: <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" /></svg>,
    },
  ]

  const statusColor = (s: string) => {
    switch (s) {
      case 'Verified': return 'bg-emerald-100 text-emerald-700'
      case 'Pending': return 'bg-amber-100 text-amber-700'
      case 'Failed': return 'bg-red-100 text-red-700'
      default: return 'bg-gray-100 text-gray-600'
    }
  }

  return (
    <div className="container-luma py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500">Signed in as {member?.full_name}. Figures are live from the database.</p>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/admin/reports" className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">Reports</Link>
          <Link to="/admin/members" className="rounded-xl bg-luma-700 px-4 py-2 text-sm font-bold text-white hover:bg-luma-800 shadow-sm transition-all">Members</Link>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map((s) => (
          <StatCard key={s.label} label={s.label} value={s.value} color={s.color} icon={s.icon} />
        ))}
      </div>

      {/* Quick Links */}
      <div className="mt-6 flex flex-wrap gap-3">
        <Link to="/admin/packages" className="rounded-xl bg-luma-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-luma-800 shadow-sm transition-all">Packages</Link>
        <Link to="/admin/contributions" className="rounded-xl bg-luma-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-luma-800 shadow-sm transition-all">Contributions</Link>
        <Link to="/admin/claims" className="rounded-xl bg-luma-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-luma-800 shadow-sm transition-all">Claims</Link>
        <Link to="/admin/registration-fees" className="rounded-xl bg-luma-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-luma-800 shadow-sm transition-all">Registration Fees</Link>
        <Link to="/admin/subscriptions" className="rounded-xl bg-luma-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-luma-800 shadow-sm transition-all">Subscriptions</Link>
      </div>

      {/* Charts Row 1 */}
      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        {/* Monthly Contributions Chart */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-gray-900">Monthly Contributions</h2>
              <p className="mt-1 text-xs text-gray-500">Last 12 months — verified vs pending</p>
            </div>
            <ExportButtons onCSV={() => exportContributionsCSV(data.monthly_contributions)} onPDF={() => exportContributionsPDF(data.monthly_contributions)} />
            <div className="text-right">
              <div className="text-lg font-bold text-luma-700">{formatKes(totalContributions)}</div>
              <div className="text-xs text-gray-500">Total (12 months)</div>
            </div>
          </div>
          <div className="mt-4 h-64">
            <ContribChart data={data.monthly_contributions} />
          </div>
        </div>

        {/* Claims Status Pie */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-gray-900">Claims by Status</h2>
              <p className="mt-1 text-xs text-gray-500">All-time claims breakdown</p>
            </div>
            <ExportButtons onCSV={() => exportClaimsStatusCSV(data.claims_by_status)} onPDF={() => exportClaimsStatusPDF(data.claims_by_status)} />
          </div>
          <div className="mt-4 h-64">
            <ClaimsPieChart data={data.claims_by_status} />
          </div>
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Package Breakdown */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-gray-900">Active Subscriptions by Package</h2>
              <p className="mt-1 text-xs text-gray-500">Current active subscriber counts</p>
            </div>
            <ExportButtons onCSV={() => exportPackageBreakdownCSV(data.package_breakdown)} onPDF={() => exportPackageBreakdownPDF(data.package_breakdown)} />
          </div>
          <div className="mt-4 h-64">
            <PackageBarChart data={data.package_breakdown} />
          </div>
        </div>

        {/* Registration Fee Stats + Summary */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-gray-900">Registration Fees</h2>
              <p className="mt-1 text-xs text-gray-500">KSh 300 one-time activation fees</p>
            </div>
            <ExportButtons onCSV={() => exportRegistrationFeesCSV(data.registration_fees)} onPDF={() => exportRegistrationFeesPDF(data.registration_fees)} />
          </div>

          <div className="mt-5 grid grid-cols-3 gap-3">
            <div className="rounded-xl bg-gray-50 p-4 text-center">
              <div className="text-2xl font-extrabold text-gray-900">{data.registration_fees.total}</div>
              <div className="mt-1 text-xs font-medium text-gray-500">Total</div>
            </div>
            <div className="rounded-xl bg-emerald-50 p-4 text-center">
              <div className="text-2xl font-extrabold text-emerald-700">{data.registration_fees.paid}</div>
              <div className="mt-1 text-xs font-medium text-emerald-600">Paid</div>
            </div>
            <div className="rounded-xl bg-amber-50 p-4 text-center">
              <div className="text-2xl font-extrabold text-amber-700">{data.registration_fees.unpaid}</div>
              <div className="mt-1 text-xs font-medium text-amber-600">Unpaid</div>
            </div>
          </div>

          <div className="mt-5 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Verified Contributions (12mo)</span>
              <span className="font-semibold text-gray-900">{formatKes(totalVerified)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Pending Contributions (12mo)</span>
              <span className="font-semibold text-gray-900">{formatKes(totalContributions - totalVerified)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Registration Revenue</span>
              <span className="font-semibold text-gray-900">{formatKes(data.registration_fees.paid * 300)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Transactions Table */}
      <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-gray-900">Recent Transactions</h2>
            <p className="mt-1 text-xs text-gray-500">Latest 10 contribution records</p>
          </div>
          <div className="flex items-center gap-3">
            <ExportButtons onCSV={() => exportTransactionsCSV(data.recent_transactions)} onPDF={() => exportTransactionsPDF(data.recent_transactions)} />
            <Link to="/admin/contributions" className="text-sm font-medium text-luma-700 hover:text-luma-800">View All →</Link>
          </div>
        </div>
        <div className="mt-4 overflow-x-auto">
          {data.recent_transactions.length > 0 ? (
            <table className="w-full text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3">Member</th>
                  <th className="px-4 py-3">Package</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Date</th>
                </tr>
              </thead>
              <tbody>
                {data.recent_transactions.map((t) => (
                  <tr key={t.id} className="border-b border-gray-100 last:border-0">
                    <td className="px-4 py-3 font-medium text-gray-900">{t.member_name}</td>
                    <td className="px-4 py-3 text-gray-600">{t.package_name}</td>
                    <td className="px-4 py-3 font-semibold text-gray-900">{formatKes(t.amount)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusColor(t.status)}`}>
                        {t.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {new Date(t.date).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="py-8 text-center text-sm text-gray-400">No transactions yet.</div>
          )}
        </div>
      </div>
    </div>
  )
}
