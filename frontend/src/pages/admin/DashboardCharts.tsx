import { memo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area,
} from 'recharts'
import type { DashboardData } from './Dashboard.types'

function formatKes(amount: number) {
  return 'KSh ' + amount.toLocaleString()
}

const PIE_COLORS = ['#6D9B3A', '#2563EB', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#EC4899', '#14B8A6']

const ClaimsPieChart = memo(function ClaimsPieChart({ data }: { data: Record<string, number> }) {
  const entries = Object.entries(data).filter(([, v]) => v > 0)
  if (entries.length === 0) return <div className="flex h-full items-center justify-center text-sm text-gray-400">No claims data</div>
  const chartData = entries.map(([name, value]) => ({ name, value }))
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie data={chartData} cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={3} dataKey="value" isAnimationActive={false} label={({ name, percent }: { name?: string; percent?: number }) => `${name ?? ''} ${((percent ?? 0) * 100).toFixed(0)}%`} labelLine={false}>
          {chartData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
        </Pie>
        <Tooltip formatter={(val) => [val, 'Claims']} />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  )
})

const FUNNEL_COLORS = ['#2563EB', '#3B82F6', '#6D9B3A', '#8BC34A', '#F59E0B', '#10B981']

const MembershipFunnel = memo(function MembershipFunnel({ data }: { data: DashboardData['membership_funnel'] }) {
  if (!data || data.length === 0) return <div className="flex h-full items-center justify-center text-sm text-gray-400">No funnel data</div>
  const maxCount = Math.max(...data.map(d => d.count))
  return (
    <div className="space-y-2">
      {data.map((stage, i) => {
        const widthPct = maxCount > 0 ? (stage.count / maxCount) * 100 : 0
        const dropoff = i > 0 ? data[i - 1].count - stage.count : 0
        const dropoffPct = i > 0 && data[i - 1].count > 0 ? Math.round((dropoff / data[i - 1].count) * 100) : 0
        return (
          <div key={stage.stage} className="group">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-gray-700">{stage.stage}</span>
              <div className="flex items-center gap-2">
                <span className="font-bold text-gray-900">{stage.count.toLocaleString()}</span>
                <span className="text-gray-400">{stage.pct_of_total}%</span>
                {i > 0 && dropoff > 0 && (
                  <span className="text-red-500 font-medium">-{dropoffPct}%</span>
                )}
              </div>
            </div>
            <div className="mt-1 h-6 overflow-hidden rounded-lg bg-gray-100">
              <div
                className="h-full rounded-lg transition-all duration-500 flex items-center pl-2"
                style={{ width: `${Math.max(widthPct, 2)}%`, backgroundColor: FUNNEL_COLORS[i % FUNNEL_COLORS.length] }}
              >
                {widthPct > 20 && (
                  <span className="text-[10px] font-bold text-white">{stage.pct_of_total}%</span>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
})

const ContribChart = memo(function ContribChart({ data, onMonthClick }: { data: DashboardData['monthly_contributions']; onMonthClick: (month: string) => void }) {
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
        <Area type="monotone" dataKey="verified" stroke="#6D9B3A" fill="url(#verifiedGrad)" name="Verified" isAnimationActive={false} />
        <Area type="monotone" dataKey="pending" stroke="#F59E0B" fill="url(#pendingGrad)" name="Pending" isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  )
})

const PackageBarChart = memo(function PackageBarChart({ data }: { data: DashboardData['package_breakdown'] }) {
  if (data.length === 0) return <div className="flex h-full items-center justify-center text-sm text-gray-400">No subscription data</div>
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11 }} stroke="#9CA3AF" />
        <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11 }} stroke="#9CA3AF" />
        <Tooltip />
        <Bar dataKey="count" fill="#6D9B3A" radius={[0, 6, 6, 0]} name="Active Subs" isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  )
})

export { ClaimsPieChart, MembershipFunnel, ContribChart, PackageBarChart }
