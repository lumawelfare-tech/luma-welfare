import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, ApiError } from '../../lib/api'
import { useHead } from '../../lib/seo'
import { EmptyState } from '../../components/EmptyState'
import { ErrorState } from '../../components/ErrorState'
import { reportLoadError } from '../../lib/userFacingError'

type FamilyMember = {
  id: string
  full_name: string
  relationship: string
  id_number_masked?: string | null
  date_of_birth?: string | null
  phone?: string | null
  tier: 'nuclear' | 'extended'
  beneficiary_status?: string
}

const emptyForm = {
  full_name: '',
  relationship: 'spouse',
  tier: 'nuclear' as 'nuclear' | 'extended',
  id_number: '',
  date_of_birth: '',
}

export function Family() {
  useHead('Family & beneficiaries', undefined, { noindex: true })
  const [members, setMembers] = useState<FamilyMember[]>([])
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [docBusy, setDocBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  async function load() {
    try {
      const d = await api<{ family_members: FamilyMember[] }>('/member/family', { auth: true })
      setMembers(d.family_members ?? [])
      setLoadError(null)
    } catch (e) {
      setLoadError(reportLoadError(e, { page: 'member-family' }, 'Could not load family members.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function add(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setMsg(null)
    setBusy(true)
    try {
      await api('/member/family', {
        method: 'POST',
        auth: true,
        body: {
          fullName: form.full_name,
          relationship: form.relationship,
          tier: form.tier,
          idNumber: form.id_number || null,
          dateOfBirth: form.date_of_birth || null,
        },
      })
      setForm(emptyForm)
      setMsg('Family member added.')
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

  async function uploadBeneficiaryDoc(familyMemberId: string, file: File) {
    setError(null)
    setMsg(null)
    if (file.size > 10 * 1024 * 1024) {
      setError('PDF must be 10MB or smaller.')
      return
    }
    setDocBusy(familyMemberId)
    try {
      const fileBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result ?? ''))
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      await api('/member/identity-docs', {
        method: 'POST',
        auth: true,
        body: { documentType: 'beneficiary_id', familyMemberId, fileBase64, fileName: file.name },
      })
      setError(null)
      setMsg('Beneficiary document uploaded. Status is pending verification.')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not upload the beneficiary document.')
    } finally {
      setDocBusy(null)
    }
  }

  const nuclear = members.filter((m) => m.tier === 'nuclear')
  const extended = members.filter((m) => m.tier === 'extended')

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Family &amp; beneficiaries</h1>
        <p className="mt-1 text-sm text-gray-500">
          Dependants covered by your welfare package (nuclear or extended). Contribution amounts come from your package, not this list.
        </p>
        <p className="mt-2 text-sm">
          <Link to="/contributions" className="font-medium text-luma-700 hover:underline">Record a package contribution</Link>
          {' '}that covers your family.
        </p>
      </div>

      {error && <div className="mt-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700" role="alert">{error}</div>}
      {msg && <div className="mt-4 rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700" role="status">{msg}</div>}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <form onSubmit={add} className="glass-panel p-5">
          <h2 className="text-sm font-semibold text-gray-900">Add family member</h2>
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
              <label className="mb-1 block text-xs font-medium text-gray-600">Cover category</label>
              <select value={form.tier} onChange={(e) => setForm((f) => ({ ...f, tier: e.target.value as 'nuclear' | 'extended' }))} className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-luma-500">
                <option value="nuclear">Nuclear family</option>
                <option value="extended">Extended family</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Date of birth</label>
              <input type="date" value={form.date_of_birth} onChange={(e) => setForm((f) => ({ ...f, date_of_birth: e.target.value }))} className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-luma-500 focus:bg-white" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">ID number (optional)</label>
              <input value={form.id_number} onChange={(e) => setForm((f) => ({ ...f, id_number: e.target.value }))} className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-luma-500 focus:bg-white" />
            </div>
            <button disabled={busy} className="w-full rounded-lg bg-luma-700 py-2.5 text-sm font-semibold text-white hover:bg-luma-800 disabled:opacity-60 transition-all">
              {busy ? 'Adding…' : 'Add family member'}
            </button>
          </div>
        </form>

        <div className="lg:col-span-2 space-y-6">
          {loading && (
            <div className="space-y-3">
              {[1, 2].map((i) => <div key={i} className="h-16 rounded-lg luma-skeleton" />)}
            </div>
          )}

          {loadError && !loading && (
            <ErrorState
              message={loadError}
              onRetry={() => { setLoadError(null); setLoading(true); load() }}
            />
          )}

          {!loading && !loadError && members.length === 0 && (
            <EmptyState
              title="You haven't added any family members yet."
              message="Add dependants or next-of-kin who should be covered under your programs."
            />
          )}

          {([
            ['Nuclear family', nuclear],
            ['Extended family', extended],
          ] as const).map(([title, list]) => (
            list.length === 0 ? null : (
              <div key={title}>
                <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {list.map((m) => (
                    <div key={m.id} className="glass-panel p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-medium text-gray-900">{m.full_name}</div>
                          <div className="mt-1 text-xs text-gray-500">
                            {m.relationship} · {m.beneficiary_status ?? 'active'}
                            {m.id_number_masked ? ` · ID ${m.id_number_masked}` : ''}
                            {m.date_of_birth ? ` · ${m.date_of_birth}` : ''}
                          </div>
                        </div>
                        <button onClick={() => remove(m.id)} className="text-xs font-medium text-red-600 hover:text-red-700 hover:underline">
                          Remove
                        </button>
                      </div>
                      <label className="mt-3 block text-[11px] text-gray-500">
                        National ID PDF
                        <input
                          type="file"
                          accept="application/pdf,.pdf"
                          disabled={docBusy === m.id}
                          className="mt-1 block w-full text-xs"
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            e.target.value = ''
                            if (file) void uploadBeneficiaryDoc(m.id, file)
                          }}
                        />
                        {docBusy === m.id ? ' Uploading…' : ''}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            )
          ))}
        </div>
      </div>
    </div>
  )
}
