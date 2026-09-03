import { useEffect, useState } from 'react'
import { api, ApiError } from '../../lib/api'

type FamilyMember = { id: string; full_name: string; relationship: string; id_number: string | null; tier: 'nuclear' | 'extended' }

export function Family() {
  const [members, setMembers] = useState<FamilyMember[]>([])
  const [form, setForm] = useState({ full_name: '', relationship: 'spouse', tier: 'nuclear', id_number: '' })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)

  async function load() {
    try {
      const d = await api<{ family_members: FamilyMember[] }>('/member/family', { auth: true })
      setMembers(d.family_members ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load family members.')
    } finally {
      setLoading(false)
    }
  }

  // eslint-disable-next-line oxc/react/set-state-in-effect — loading initialized true; setLoading(false) in finally after await
  useEffect(() => { load() }, [])

  async function add(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await api('/member/family', { method: 'POST', auth: true, body: form })
      setForm({ full_name: '', relationship: 'spouse', tier: 'nuclear', id_number: '' })
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add the family member.')
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string) {
    await api(`/member/family/${id}`, { method: 'DELETE', auth: true })
    await load()
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Family Members</h1>
        <p className="mt-1 text-sm text-gray-500">Registered dependents covered by the Welfare Package.</p>
      </div>

      {error && <div className="mt-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Add form */}
        <form onSubmit={add} className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-gray-900">Add Family Member</h2>
          <div className="mt-4 space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Full name</label>
              <input required value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-luma-500 focus:bg-white" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Relationship</label>
              <select value={form.relationship} onChange={(e) => setForm((f) => ({ ...f, relationship: e.target.value }))} className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-luma-500">
                <option value="spouse">Spouse</option>
                <option value="child">Child</option>
                <option value="parent">Parent</option>
                <option value="sibling">Sibling</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Cover tier</label>
              <select value={form.tier} onChange={(e) => setForm((f) => ({ ...f, tier: e.target.value as 'nuclear' | 'extended' }))} className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-luma-500">
                <option value="nuclear">Nuclear family</option>
                <option value="extended">Extended family</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">ID number (optional)</label>
              <input value={form.id_number} onChange={(e) => setForm((f) => ({ ...f, id_number: e.target.value }))} className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-luma-500 focus:bg-white" />
            </div>
            <button disabled={busy} className="w-full rounded-lg bg-luma-700 py-2.5 text-sm font-semibold text-white hover:bg-luma-800 disabled:opacity-60 transition-all">
              {busy ? 'Adding…' : 'Add Member'}
            </button>
          </div>
        </form>

        {/* Family list */}
        <div className="lg:col-span-2">
          {loading && (
            <div className="space-y-3">
              {[1, 2].map((i) => <div key={i} className="h-16 rounded-lg bg-gray-100 animate-pulse" />)}
            </div>
          )}

          {!loading && members.length === 0 && (
            <div className="rounded-xl border border-gray-200 bg-white p-10 text-center">
              <p className="text-sm text-gray-500">No family members registered yet.</p>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            {members.map((m) => (
              <div key={m.id} className="flex items-start justify-between rounded-xl border border-gray-200 bg-white p-4 hover:shadow-sm transition-all">
                <div>
                  <div className="font-medium text-gray-900">{m.full_name}</div>
                  <div className="mt-1 text-xs text-gray-500">
                    {m.relationship} · {m.tier === 'nuclear' ? 'Nuclear' : 'Extended'} family
                    {m.id_number ? ` · ID ${m.id_number}` : ''}
                  </div>
                </div>
                <button onClick={() => remove(m.id)} className="text-xs font-medium text-red-600 hover:text-red-700 hover:underline">
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
