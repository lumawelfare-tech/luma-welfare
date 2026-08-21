import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'

type DashboardData = {
  members: number
  pending_approvals: number
  subscriptions: number
  pending_contributions: number
  open_claims: number
  confirmed_stats: Record<string, unknown>
  open_questions: { id: string; topic: string; question: string; options: unknown; status: string }[]
}

export function AdminDashboard() {
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
        <p className="text-lg font-semibold text-red-700">No admin access</p>
        <p className="mt-2 text-sm text-stone-600">
          {error}. If you are an admin, make sure your account is in the admins table.
        </p>
      </div>
    )
  }

  if (loading || !data) {
    return <div className="container-luma py-16 text-center text-stone-500">Loading admin…</div>
  }

  const stats = [
    { label: 'Members', value: data.members },
    { label: 'Pending approvals', value: data.pending_approvals },
    { label: 'Subscriptions', value: data.subscriptions },
    { label: 'Pending contributions', value: data.pending_contributions },
    { label: 'Open claims', value: data.open_claims },
  ]

  return (
    <div className="container-luma py-10">
      <h1 className="text-2xl font-bold text-luma-900">Admin</h1>
      <p className="mt-1 text-sm text-stone-600">Signed in as {member?.full_name}. Figures are live from the database.</p>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-stone-200 bg-white p-4">
            <div className="text-2xl font-bold text-luma-700">{s.value}</div>
            <div className="mt-1 text-xs font-medium uppercase tracking-wide text-stone-500">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link to="/admin/members" className="rounded-md bg-luma-600 px-4 py-2 text-sm font-semibold text-white hover:bg-luma-700">Members</Link>
        <Link to="/admin/packages" className="rounded-md bg-luma-600 px-4 py-2 text-sm font-semibold text-white hover:bg-luma-700">Packages</Link>
        <Link to="/admin/contributions" className="rounded-md bg-luma-600 px-4 py-2 text-sm font-semibold text-white hover:bg-luma-700">Contributions</Link>
        <Link to="/admin/claims" className="rounded-md bg-luma-600 px-4 py-2 text-sm font-semibold text-white hover:bg-luma-700">Claims</Link>
      </div>

      <div className="mt-10">
        <h2 className="text-lg font-semibold text-luma-900">Open questions for Luma</h2>
        <p className="mt-1 text-sm text-stone-600">
          These come from Section 9 of the build spec — the printed materials disagree with each
          other, so nothing here is decided silently.
        </p>
        <div className="mt-4 space-y-3">
          {data.open_questions.map((q) => (
            <div key={q.id} className="rounded-xl border border-gold-400/60 bg-gold-400/10 p-5">
              <div className="text-xs font-semibold uppercase tracking-wide text-gold-600">{q.topic}</div>
              <p className="mt-1 text-sm leading-relaxed text-stone-800">{q.question}</p>
              {Array.isArray(q.options) && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {q.options.map((o) => (
                    <span key={String(o)} className="rounded bg-white/70 px-2 py-0.5 text-xs text-stone-600">{String(o)}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}