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
      await api('/member/profile', { method: 'PATCH', auth: true, body: form })
      setSaved(true)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save your profile.')
    } finally {
      setSaving(false)
    }
  }

  const memberName = member?.full_name ?? ''
  const initials = memberName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Profile</h1>
        <p className="mt-1 text-sm text-gray-500">Keep your information up to date.</p>
      </div>

      {/* Profile header */}
      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-luma-100 text-xl font-bold text-luma-700">
            {initials}
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{member?.full_name ?? 'Member'}</h2>
            <p className="text-sm text-gray-500">{member?.email ?? ''}</p>
            <div className="mt-1 flex items-center gap-2">
              <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                member?.status === 'active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-50 text-gray-600 border-gray-200'
              }`}>
                {member?.status ?? 'unknown'}
              </span>
              {member?.membership_number && (
                <span className="text-xs text-gray-400">#{member.membership_number}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Edit form */}
      <form onSubmit={submit} className="mt-6 rounded-xl border border-gray-200 bg-white p-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Personal Information</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Full name</label>
            <input value={form.fullName ?? ''} onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))} className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-luma-500 focus:bg-white" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">ID number</label>
            <input value={form.idNumber ?? ''} onChange={(e) => setForm((f) => ({ ...f, idNumber: e.target.value }))} className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-luma-500 focus:bg-white" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Alternate phone</label>
            <input value={form.altPhone ?? ''} onChange={(e) => setForm((f) => ({ ...f, altPhone: e.target.value }))} className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-luma-500 focus:bg-white" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Occupation</label>
            <input value={form.occupation ?? ''} onChange={(e) => setForm((f) => ({ ...f, occupation: e.target.value }))} className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-luma-500 focus:bg-white" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">County</label>
            <input value={form.county ?? ''} onChange={(e) => setForm((f) => ({ ...f, county: e.target.value }))} className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-luma-500 focus:bg-white" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Location</label>
            <input value={form.location ?? ''} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-luma-500 focus:bg-white" />
          </div>
        </div>

        {error && <div className="mt-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}
        {saved && <div className="mt-4 rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700">Profile saved successfully.</div>}

        <button disabled={saving} className="mt-5 rounded-lg bg-luma-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-luma-800 disabled:opacity-60 transition-all">
          {saving ? 'Saving…' : 'Save Profile'}
        </button>
      </form>
    </div>
  )
}
