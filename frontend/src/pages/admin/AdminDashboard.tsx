import { useEffect, useState, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api'
import { supabase } from '../../lib/supabase'
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
  drill_month: string | null
  drill_transactions: { id: string; amount: number; status: string; period: string; date: string; member_name: string; member_phone: string; package_name: string }[]
  recent_reports: { id: string; schedule_name: string; report_type: string; filename: string; record_count: number; status: string; generated_at: string }[]
  scheduled_report_stats: { total: number; enabled: number }
  report_analytics: {
    total_reports: number; successful: number; failed: number; success_rate: number
    avg_records: number; total_records: number
    by_type: { type: string; total: number; success: number; error: number; records: number }[]
    by_month: { month: string; label: string; total: number; success: number; error: number; records: number }[]
    by_schedule: { name: string; total: number; success: number; error: number; lastRun: string }[]
  }
}

type DatePreset = '3m' | '6m' | '12m' | 'ytd' | 'all' | 'custom'

const REFRESH_INTERVAL = 30_000 // 30 seconds

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

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 10) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ago`
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

const PIE_COLORS = ['#6D9B3A', '#2563EB', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#EC4899', '#14B8A6']

function ContribChart({ data, onMonthClick }: { data: DashboardData['monthly_contributions']; onMonthClick: (month: string) => void }) {
  if (data.length === 0) return <div className="flex h-full items-center justify-center text-sm text-gray-400">No contribution data</div>
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }} onClick={(e: Record<string, unknown>) => {
        const payload = e?.activePayload as { payload: { month: string } }[] | undefined
        if (payload?.[0]?.payload?.month) {
          onMonthClick(payload[0].payload.month)
        }
      }} style={{ cursor: 'pointer' }}>
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
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())
  const [refreshing, setRefreshing] = useState(false)
  const [isLive, setIsLive] = useState(true)
  const [flash, setFlash] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const mountedRef = useRef(true)
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null)
  const [drillLoading, setDrillLoading] = useState(false)

  // Date range filter state
  const [datePreset, setDatePreset] = useState<DatePreset>('12m')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  const getDateRange = useCallback((): { from: string; to: string } => {
    const now = new Date()
    const to = now.toISOString().split('T')[0]
    let from: string
    switch (datePreset) {
      case '3m': {
        const d = new Date(); d.setMonth(d.getMonth() - 3); from = d.toISOString().split('T')[0]; break
      }
      case '6m': {
        const d = new Date(); d.setMonth(d.getMonth() - 6); from = d.toISOString().split('T')[0]; break
      }
      case '12m': {
        const d = new Date(); d.setMonth(d.getMonth() - 12); from = d.toISOString().split('T')[0]; break
      }
      case 'ytd': {
        from = `${now.getFullYear()}-01-01`; break
      }
      case 'all': {
        from = '2024-01-01'; break
      }
      case 'custom': {
        from = customFrom || to
        break
      }
    }
    return { from, to: customTo || to }
  }, [datePreset, customFrom, customTo])

  const fetchData = useCallback(async (silent = false) => {
    if (!mountedRef.current) return
    if (silent) setRefreshing(true)
    try {
      const range = getDateRange()
      const qs = `?date_from=${range.from}&date_to=${range.to}`
      const d = await api<DashboardData>(`/admin/dashboard${qs}`, { auth: true })
      if (!mountedRef.current) return
      setData(d)
      setError(null)
      setLastRefresh(new Date())
      // Flash the live indicator on update
      if (silent) {
        setFlash(true)
        setTimeout(() => setFlash(false), 1000)
      }
    } catch (e) {
      if (!mountedRef.current) return
      setError(e instanceof Error ? e.message : 'Could not load dashboard.')
    } finally {
      if (mountedRef.current) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [getDateRange])

  // Initial load + refetch on date range change
  useEffect(() => {
    mountedRef.current = true
    fetchData()
    return () => { mountedRef.current = false }
  }, [fetchData])

  // Refetch when date range changes
  useEffect(() => {
    fetchData(true)
  }, [datePreset, customFrom, customTo])

  // Month drill-down handler
  const handleMonthClick = useCallback(async (month: string) => {
    // Toggle off if clicking same month
    if (selectedMonth === month) {
      setSelectedMonth(null)
      return
    }
    setSelectedMonth(month)
    setDrillLoading(true)
    try {
      const range = getDateRange()
      const d = await api<DashboardData>(`/admin/dashboard?date_from=${range.from}&date_to=${range.to}&month=${month}`, { auth: true })
      if (mountedRef.current) {
        setData(d)
      }
    } catch (e) {
      console.error('Drill-down failed:', e)
    } finally {
      if (mountedRef.current) setDrillLoading(false)
    }
  }, [selectedMonth, getDateRange])

  // Auto-refresh polling
  useEffect(() => {
    if (!isLive) {
      if (intervalRef.current) clearInterval(intervalRef.current)
      return
    }

    intervalRef.current = setInterval(() => {
      if (document.hidden) return // Skip if tab is hidden
      fetchData(true)
    }, REFRESH_INTERVAL)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [isLive, fetchData])

  // Resume polling when tab becomes visible again
  useEffect(() => {
    function onVisibilityChange() {
      if (!document.hidden && isLive) {
        fetchData(true)
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [isLive, fetchData])

  // Supabase Realtime subscriptions for instant updates
  useEffect(() => {
    if (!isLive) return

    const channel = supabase
      .channel('admin-dashboard-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contributions' }, () => fetchData(true))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'subscriptions' }, () => fetchData(true))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'claims' }, () => fetchData(true))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'members' }, () => fetchData(true))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'registration_fees' }, () => fetchData(true))
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [isLive, fetchData])

  if (error && !data) {
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
          {/* Live indicator */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsLive(!isLive)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${
                isLive
                  ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
              title={isLive ? 'Click to pause auto-refresh' : 'Click to resume auto-refresh'}
            >
              <span className={`h-2 w-2 rounded-full ${isLive ? (flash ? 'bg-emerald-500 animate-ping' : 'bg-emerald-500') : 'bg-gray-400'}`} />
              {isLive ? 'Live' : 'Paused'}
            </button>
            <span className="text-xs text-gray-400" title={lastRefresh.toLocaleString()}>
              {timeAgo(lastRefresh)}
            </span>
          </div>

          {/* Manual refresh */}
          <button
            onClick={() => fetchData(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
            title="Refresh now"
          >
            <svg className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
            </svg>
            Refresh
          </button>

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

      {/* Global Date Range Filter */}
      <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-gray-200 bg-white px-5 py-3">
        <span className="text-sm font-medium text-gray-700">Date Range:</span>
        <div className="flex gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1">
          {([
            { value: '3m' as DatePreset, label: '3M' },
            { value: '6m' as DatePreset, label: '6M' },
            { value: '12m' as DatePreset, label: '12M' },
            { value: 'ytd' as DatePreset, label: 'YTD' },
            { value: 'all' as DatePreset, label: 'All' },
            { value: 'custom' as DatePreset, label: 'Custom' },
          ]).map((p) => (
            <button
              key={p.value}
              onClick={() => setDatePreset(p.value)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                datePreset === p.value ? 'bg-luma-600 text-white shadow-sm' : 'text-gray-500 hover:bg-white hover:text-gray-700'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {datePreset === 'custom' && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs text-gray-700 outline-none focus:border-luma-500"
            />
            <span className="text-xs text-gray-400">to</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs text-gray-700 outline-none focus:border-luma-500"
            />
          </div>
        )}
        <span className="ml-auto text-xs text-gray-400">
          Applied to contributions, claims, and transactions
        </span>
      </div>

      {/* Charts Row 1 */}
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Monthly Contributions Chart */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-gray-900">Monthly Contributions</h2>
              <p className="mt-1 text-xs text-gray-500">Verified vs pending contributions</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-lg font-bold text-luma-700">{formatKes(totalContributions)}</div>
                <div className="text-xs text-gray-500">Total ({data.monthly_contributions.length} months)</div>
              </div>
              <ExportButtons onCSV={() => exportContributionsCSV(data.monthly_contributions)} onPDF={() => exportContributionsPDF(data.monthly_contributions)} />
            </div>
          </div>
          <div className="mt-4 h-64">
            <ContribChart data={data.monthly_contributions} onMonthClick={handleMonthClick} />
          </div>
          <p className="mt-2 text-center text-xs text-gray-400">Click a month to view individual transactions</p>

          {/* Drill-down panel */}
          {selectedMonth && (
            <div className="mt-4 rounded-xl border border-luma-200 bg-luma-50/50">
              <div className="flex items-center justify-between border-b border-luma-100 px-5 py-3">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-gray-900">
                    Transactions — {new Date(selectedMonth + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                  </h3>
                  {!drillLoading && (
                    <span className="rounded-full bg-luma-100 px-2 py-0.5 text-xs font-semibold text-luma-700">
                      {data.drill_transactions.length}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setSelectedMonth(null)}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-gray-500 hover:bg-white hover:text-gray-700 transition-colors"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  Close
                </button>
              </div>

              {drillLoading ? (
                <div className="flex items-center justify-center gap-2 py-8">
                  <svg className="h-4 w-4 animate-spin text-luma-600" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                  <span className="text-sm text-gray-500">Loading transactions…</span>
                </div>
              ) : data.drill_transactions.length === 0 ? (
                <div className="py-8 text-center text-sm text-gray-400">No transactions for this month.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs uppercase tracking-wide text-gray-500">
                      <tr className="border-b border-luma-100">
                        <th className="px-5 py-2.5 font-medium">Member</th>
                        <th className="px-5 py-2.5 font-medium">Package</th>
                        <th className="px-5 py-2.5 font-medium">Period</th>
                        <th className="px-5 py-2.5 font-medium">Amount</th>
                        <th className="px-5 py-2.5 font-medium">Status</th>
                        <th className="px-5 py-2.5 font-medium">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-luma-100/50">
                      {data.drill_transactions.map((t) => (
                        <tr key={t.id} className="hover:bg-white/60 transition-colors">
                          <td className="px-5 py-2.5">
                            <div className="font-medium text-gray-900">{t.member_name}</div>
                            {t.member_phone && <div className="text-xs text-gray-400">{t.member_phone}</div>}
                          </td>
                          <td className="px-5 py-2.5 text-gray-600">{t.package_name}</td>
                          <td className="px-5 py-2.5 text-gray-500 text-xs">{t.period ?? '—'}</td>
                          <td className="px-5 py-2.5 font-semibold text-gray-900">{formatKes(t.amount)}</td>
                          <td className="px-5 py-2.5">
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${statusColor(t.status)}`}>{t.status}</span>
                          </td>
                          <td className="px-5 py-2.5 text-gray-500 text-xs">
                            {new Date(t.date).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Claims Status Pie */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-gray-900">Claims by Status</h2>
              <p className="mt-1 text-xs text-gray-500">Claims within selected date range</p>
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
            <p className="mt-1 text-xs text-gray-500">Latest 10 contributions within date range</p>
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

      {/* Report Generation Analytics */}
      {data.report_analytics && data.report_analytics.total_reports > 0 && (
        <div className="mt-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900">Report Generation Analytics</h2>
            <Link to="/admin/scheduled-reports" className="text-sm font-medium text-luma-700 hover:text-luma-800">Manage Schedules →</Link>
          </div>

          {/* Analytics KPIs */}
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-2xl border border-gray-100 bg-white p-5">
              <div className="text-2xl font-extrabold text-gray-900">{data.report_analytics.total_reports}</div>
              <div className="mt-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Total Reports</div>
            </div>
            <div className="rounded-2xl border border-gray-100 bg-emerald-50 p-5">
              <div className="text-2xl font-extrabold text-emerald-700">{data.report_analytics.success_rate}%</div>
              <div className="mt-1 text-xs font-semibold uppercase tracking-wide text-emerald-600">Success Rate</div>
              <div className="mt-0.5 text-[10px] text-emerald-500">{data.report_analytics.successful} succeeded</div>
            </div>
            <div className="rounded-2xl border border-gray-100 bg-blue-50 p-5">
              <div className="text-2xl font-extrabold text-blue-700">{data.report_analytics.total_records.toLocaleString()}</div>
              <div className="mt-1 text-xs font-semibold uppercase tracking-wide text-blue-600">Total Records</div>
              <div className="mt-0.5 text-[10px] text-blue-500">avg {data.report_analytics.avg_records}/report</div>
            </div>
            <div className="rounded-2xl border border-gray-100 bg-red-50 p-5">
              <div className="text-2xl font-extrabold text-red-700">{data.report_analytics.failed}</div>
              <div className="mt-1 text-xs font-semibold uppercase tracking-wide text-red-600">Failed</div>
            </div>
          </div>

          {/* Charts Row */}
          <div className="mt-4 grid gap-6 lg:grid-cols-2">
            {/* Report Generation Trend */}
            <div className="rounded-2xl border border-gray-200 bg-white p-6">
              <h3 className="text-sm font-bold text-gray-900">Generation Trend</h3>
              <p className="mt-0.5 text-xs text-gray-500">Reports generated per month</p>
              <div className="mt-4 h-48">
                {data.report_analytics.by_month.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.report_analytics.by_month} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="#9CA3AF" />
                      <YAxis tick={{ fontSize: 10 }} stroke="#9CA3AF" />
                      <Tooltip />
                      <Bar dataKey="success" stackId="a" fill="#6D9B3A" name="Success" radius={[0, 0, 0, 0]} />
                      <Bar dataKey="error" stackId="a" fill="#EF4444" name="Failed" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-gray-400">No data</div>
                )}
              </div>
            </div>

            {/* Reports by Type */}
            <div className="rounded-2xl border border-gray-200 bg-white p-6">
              <h3 className="text-sm font-bold text-gray-900">Reports by Type</h3>
              <p className="mt-0.5 text-xs text-gray-500">Generation count per report type</p>
              <div className="mt-4 space-y-2.5">
                {data.report_analytics.by_type.map((t) => {
                  const pct = data.report_analytics.total_reports > 0 ? (t.total / data.report_analytics.total_reports) * 100 : 0
                  return (
                    <div key={t.type}>
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-gray-700 capitalize">{t.type.replace(/-/g, ' ')}</span>
                        <span className="text-gray-500">{t.total} reports · {t.records.toLocaleString()} records</span>
                      </div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-100">
                        <div className="h-full rounded-full bg-luma-500 transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })}
                {data.report_analytics.by_type.length === 0 && (
                  <div className="py-4 text-center text-sm text-gray-400">No report data</div>
                )}
              </div>
            </div>
          </div>

          {/* Schedule Performance */}
          <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-6">
            <h3 className="text-sm font-bold text-gray-900">Schedule Performance</h3>
            <p className="mt-0.5 text-xs text-gray-500">Success rate per scheduled report</p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="pb-2 pr-4 font-medium">Schedule</th>
                    <th className="pb-2 pr-4 font-medium">Generated</th>
                    <th className="pb-2 pr-4 font-medium">Success</th>
                    <th className="pb-2 pr-4 font-medium">Failed</th>
                    <th className="pb-2 pr-4 font-medium">Rate</th>
                    <th className="pb-2 font-medium">Last Run</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.report_analytics.by_schedule.map((s) => {
                    const rate = s.total > 0 ? Math.round((s.success / s.total) * 100) : 0
                    return (
                      <tr key={s.name} className="hover:bg-gray-50 transition-colors">
                        <td className="py-2.5 pr-4 font-medium text-gray-900">{s.name}</td>
                        <td className="py-2.5 pr-4 text-gray-600">{s.total}</td>
                        <td className="py-2.5 pr-4 text-emerald-600 font-medium">{s.success}</td>
                        <td className="py-2.5 pr-4">
                          {s.error > 0 ? <span className="text-red-600 font-medium">{s.error}</span> : <span className="text-gray-400">0</span>}
                        </td>
                        <td className="py-2.5 pr-4">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-gray-100">
                              <div className={`h-full rounded-full ${rate >= 90 ? 'bg-emerald-500' : rate >= 70 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${rate}%` }} />
                            </div>
                            <span className="text-xs text-gray-500">{rate}%</span>
                          </div>
                        </td>
                        <td className="py-2.5 text-xs text-gray-400">{timeAgo(new Date(s.lastRun))}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Recent Reports Widget */}
      {data.recent_reports && data.recent_reports.length > 0 && (
        <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-gray-900">Recent Reports</h2>
              <p className="mt-1 text-xs text-gray-500">{data.scheduled_report_stats?.enabled ?? 0} active schedules</p>
            </div>
            <Link to="/admin/scheduled-reports" className="text-sm font-medium text-luma-700 hover:text-luma-800">View All →</Link>
          </div>
          <div className="mt-4 space-y-2">
            {data.recent_reports.map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-lg border border-gray-100 px-4 py-3 hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-luma-50 text-sm">📊</div>
                  <div>
                    <div className="text-sm font-medium text-gray-900">{r.schedule_name}</div>
                    <div className="text-xs text-gray-500">{r.record_count.toLocaleString()} records · {r.filename.split('.').pop()?.toUpperCase()}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${r.status === 'success' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{r.status}</span>
                  <span className="text-xs text-gray-400">{timeAgo(new Date(r.generated_at))}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
