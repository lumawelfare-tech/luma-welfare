import { useEffect, useState } from 'react'
import { api, ApiError } from '../../lib/api'

type Member = {
  id: string
  membership_number: string | null
  full_name: string
  phone: string
  email: string | null
  status: string
  joined_at: string | null
}

export function AdminMembers() {
  const [members, setMembers] = useState<Member[]>([])
  const [filter, setFilter] = useState('pending_approval')
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function load() {
    setError(null)
    try {
      const qs = new URLSearchParams()
      if (filter) qs.set('status', filter)
      if (query.trim()) qs.set('q', query.trim())
      const d = await api<{ members: Member[] }>(`/admin/members?${qs}`, { auth: true })
      setMembers(d.members ?? [])
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load members.')
    }
  }

  useEffect(() => {
    load()
  }, [filter])

  async function setStatus(id: string, status: 'active' | 'suspended' | 'closed') {
    setBusyId(id)
    try {
      await api(`/admin/members/${id}/status`, { method: 'PATCH', auth: true, body: { status } })
      await load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not update the member.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="container-luma py-10">
      <h1 className="text-2xl font-bold text-luma-900">Members</h1>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <select value={filter} onChange={(e) => setFilter(e.target.value)} className="rounded-md border border-stone-300 px-3 py-2 text-sm outline-none focus:border-luma-500">
          <option value="pending_approval">Pending approval</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="closed">Closed</option>
          <option value="">All</option>
        </select>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && load()}
          placeholder="Search name, phone…"
          className="rounded-md border border-stone-300 px-3 py-2 text-sm outline-none focus:border-luma-500"
        />
        <button onClick={load} className="rounded-md bg-stone-200 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-300">
          Search
        </button>
      </div>

      {error && <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="mt-6 overflow-x-auto rounded-2xl border border-stone-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-stone-200 bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Joined</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id} className="border-b border-stone-100 last:border-0">
                <td className="px-4 py-3">
                  <div className="font-medium text-luma-900">{m.full_name}</div>
                  <div className="text-xs text-stone-500">{m.email ?? ''}</div>
                </td>
                <td className="px-4 py-3 text-stone-600">{m.phone}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                    m.status === 'active' ? 'bg-luma-100 text-luma-800' :
                    m.status === 'pending_approval' ? 'bg-gold-400/20 text-gold-600' :
                    'bg-stone-200 text-stone-600'
                  }`}>
                    {m.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-stone-600">{m.joined_at ? new Date(m.joined_at).toDateString() : '—'}</td>
                <td className="px-4 py-3">
                  {m.status === 'pending_approval' && (
                    <button
                      disabled={busyId === m.id}
                      onClick={() => setStatus(m.id, 'active')}
                      className="rounded-md bg-luma-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-luma-700 disabled:opacity-50"
                    >
                      Approve
                    </button>
                  )}
                  {m.status === 'active' && (
                    <button
                      disabled={busyId === m.id}
                      onClick={() => setStatus(m.id, 'suspended')}
                      className="rounded-md border border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-100 disabled:opacity-50"
                    >
                      Suspend
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {members.length === 0 && <div className="p-10 text-center text-stone-500">No members in this view.</div>}
      </div>
    </div>
  )
}