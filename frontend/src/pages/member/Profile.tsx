import { useEffect, useState } from 'react'
import { api, ApiError } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'

export function Profile() {
  const { member } = useAuth()
  const [form, setForm] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (member) {
      setForm({
        fullName: member.full_name ?? '',
        idNumber: (member.id_number as string) ?? '',
        altPhone: (member.alt_phone as string) ?? '',
        county: (member.county as string) ?? '',
        location: (member.location as string) ?? '',
        occupation: (member.occupation as string) ?? '',
      })
    }
  }, [member])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaved(false)
    setSaving(true)
    try {
      await api('/member/profile', {
        method: 'PATCH',
        auth: true,
        body: form,
      })
      setSaved(true)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save your profile.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="container-luma py-10">
      <h1 className="text-2xl font-bold text-luma-900">Your profile</h1>
      <p className="mt-1 text-sm text-stone-600">
        Keep this up to date so the office can reach you.
      </p>

      <form onSubmit={submit} className="mt-6 max-w-2xl rounded-2xl border border-stone-200 bg-white p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-stone-700">Full name</label>
            <input value={form.fullName ?? ''} onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))} className="w-full rounded-md border border-stone-300 px-3 py-2 outline-none focus:border-luma-500" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-stone-700">ID number</label>
            <input value={form.idNumber ?? ''} onChange={(e) => setForm((f) => ({ ...f, idNumber: e.target.value }))} className="w-full rounded-md border border-stone-300 px-3 py-2 outline-none focus:border-luma-500" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-stone-700">Alt phone</label>
            <input value={form.altPhone ?? ''} onChange={(e) => setForm((f) => ({ ...f, altPhone: e.target.value }))} className="w-full rounded-md border border-stone-300 px-3 py-2 outline-none focus:border-luma-500" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-stone-700">Occupation</label>
            <input value={form.occupation ?? ''} onChange={(e) => setForm((f) => ({ ...f, occupation: e.target.value }))} className="w-full rounded-md border border-stone-300 px-3 py-2 outline-none focus:border-luma-500" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-stone-700">County</label>
            <input value={form.county ?? ''} onChange={(e) => setForm((f) => ({ ...f, county: e.target.value }))} className="w-full rounded-md border border-stone-300 px-3 py-2 outline-none focus:border-luma-500" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-stone-700">Location</label>
            <input value={form.location ?? ''} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} className="w-full rounded-md border border-stone-300 px-3 py-2 outline-none focus:border-luma-500" />
          </div>
        </div>

        {member && (
          <div className="mt-4 rounded-lg bg-stone-50 px-4 py-3 text-sm text-stone-600">
            <div>Email: <span className="font-medium">{member.email}</span></div>
            <div>Phone: <span className="font-medium">{member.phone}</span></div>
            <div>Membership status: <span className="font-medium">{member.status}</span></div>
          </div>
        )}

        {error && <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {saved && <p className="mt-4 rounded-md bg-luma-50 px-3 py-2 text-sm text-luma-800">Profile saved.</p>}

        <button disabled={saving} className="mt-5 rounded-md bg-luma-600 px-4 py-2 text-sm font-semibold text-white hover:bg-luma-700 disabled:opacity-60">
          {saving ? 'Saving…' : 'Save profile'}
        </button>
      </form>
    </div>
  )
}