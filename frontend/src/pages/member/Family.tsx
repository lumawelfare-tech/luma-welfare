import { useEffect, useState } from 'react'
import { api, ApiError } from '../../lib/api'

type FamilyMember = {
  id: string
  full_name: string
  relationship: string
  id_number: string | null
  date_of_birth: string | null
  tier: 'nuclear' | 'extended'
}

export function Family() {
  const [members, setMembers] = useState<FamilyMember[]>([])
  const [form, setForm] = useState({ full_name: '', relationship: 'spouse', tier: 'nuclear', id_number: '' })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function load() {
    const d = await api<{ family_members: FamilyMember[] }>('/member/family', { auth: true })
    setMembers(d.family_members ?? [])
  }

  useEffect(() => {
    load().catch((e) => setError(e.message))
  }, [])

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
    <div className="container-luma py-10">
      <h1 className="text-2xl font-bold text-luma-900">Family members</h1>
      <p className="mt-1 max-w-2xl text-sm text-stone-600">
        Registered dependents are covered by the Welfare Package. The nuclear family is covered
        by the Nuclear Family tier; the Extended Family tier extends cover to extended family
        members registered here.
      </p>

      {error && <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <form onSubmit={add} className="rounded-2xl border border-stone-200 bg-white p-6">
          <h2 className="font-semibold text-luma-900">Add a family member</h2>
          <div className="mt-4 space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-stone-700">Full name</label>
              <input required value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} className="w-full rounded-md border border-stone-300 px-3 py-2 outline-none focus:border-luma-500" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-stone-700">Relationship</label>
              <select value={form.relationship} onChange={(e) => setForm((f) => ({ ...f, relationship: e.target.value }))} className="w-full rounded-md border border-stone-300 px-3 py-2 outline-none focus:border-luma-500">
                <option value="spouse">Spouse</option>
                <option value="child">Child</option>
                <option value="parent">Parent</option>
                <option value="sibling">Sibling</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-stone-700">Cover tier</label>
              <select value={form.tier} onChange={(e) => setForm((f) => ({ ...f, tier: e.target.value }))} className="w-full rounded-md border border-stone-300 px-3 py-2 outline-none focus:border-luma-500">
                <option value="nuclear">Nuclear family</option>
                <option value="extended">Extended family</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-stone-700">ID number (optional)</label>
              <input value={form.id_number} onChange={(e) => setForm((f) => ({ ...f, id_number: e.target.value }))} className="w-full rounded-md border border-stone-300 px-3 py-2 outline-none focus:border-luma-500" />
            </div>
            <button disabled={busy} className="w-full rounded-md bg-luma-600 py-2.5 text-sm font-semibold text-white hover:bg-luma-700 disabled:opacity-60">
              {busy ? 'Adding…' : 'Add member'}
            </button>
          </div>
        </form>

        <div className="lg:col-span-2">
          {members.length === 0 && (
            <div className="rounded-xl border border-stone-200 bg-white p-10 text-center text-stone-500">
              No family members registered yet.
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {members.map((m) => (
              <div key={m.id} className="flex items-start justify-between rounded-xl border border-stone-200 bg-white p-4">
                <div>
                  <div className="font-semibold text-luma-900">{m.full_name}</div>
                  <div className="mt-1 text-sm text-stone-500">
                    {m.relationship} · {m.tier === 'nuclear' ? 'Nuclear' : 'Extended'} family
                    {m.id_number ? ` · ID ${m.id_number}` : ''}
                  </div>
                </div>
                <button onClick={() => remove(m.id)} className="text-sm text-red-600 hover:underline">
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