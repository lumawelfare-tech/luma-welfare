import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { useHead } from '../../lib/seo'

type DashboardData = {
  members: number
  subscriptions: number
  pending_contributions: number
  pending_claims: number
  approved_claims: number
  confirmed_stats: Record<string, unknown>
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

  const stats = [
    { label: 'Total Members', value: data.members, color: 'bg-luma-50 text-luma-700' },
    { label: 'Active Subscriptions', value: data.subscriptions, color: 'bg-blue-50 text-blue-700' },
    { label: 'Pending Contributions', value: data.pending_contributions, color: 'bg-orange-50 text-orange-700' },
    { label: 'Pending Claims', value: data.pending_claims, color: 'bg-purple-50 text-purple-700' },
    { label: 'Approved Claims', value: data.approved_claims, color: 'bg-emerald-50 text-emerald-700' },
  ]

  return (
    <div className="container-luma py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500">Signed in as {member?.full_name}. Figures are live from the database.</p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((s) => (
          <div key={s.label} className={`rounded-2xl border border-gray-100 p-5 transition-all hover:shadow-md ${s.color}`}>
            <div className="text-3xl font-extrabold">{s.value}</div>
            <div className="mt-1 text-xs font-semibold uppercase tracking-wide opacity-75">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link to="/admin/members" className="rounded-xl bg-luma-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-luma-800 shadow-sm transition-all">Members</Link>
        <Link to="/admin/packages" className="rounded-xl bg-luma-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-luma-800 shadow-sm transition-all">Packages</Link>
        <Link to="/admin/contributions" className="rounded-xl bg-luma-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-luma-800 shadow-sm transition-all">Contributions</Link>
        <Link to="/admin/claims" className="rounded-xl bg-luma-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-luma-800 shadow-sm transition-all">Claims</Link>
      </div>


    </div>
  )
}
