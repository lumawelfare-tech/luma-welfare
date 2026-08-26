import { useEffect, useState } from 'react'
import { api, ApiError } from '../../lib/api'
import { useToast } from '../../components/Toast'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { EmptyState } from '../../components/EmptyState'
import { SkeletonCard } from '../../components/Skeleton'

type RuleMap = Record<string, unknown>
type Tier = { id: string; name: string; amount: number }
type Pkg = {
  id: string
  code: string
  name: string
  description: string | null
  waiting_period_months: number | null
  is_active: boolean
  tiers: Tier[]
  rules: RuleMap
}

const knownRuleKeys = [
  'waiting_period_months',
  'min_contributions',
  'requires_current_contributions',
  'arrears_allowed_months',
  'max_arrears_months',
]

export function AdminPackages() {
  const { addToast } = useToast()
  const [packages, setPackages] = useState<Pkg[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<Record<string, string>>({})
  const [showForm, setShowForm] = useState(false)
  const [newPkg, setNewPkg] = useState({ code: '', name: '', waitingPeriodMonths: '', description: '' })
  const [confirmRetire, setConfirmRetire] = useState<Pkg | null>(null)
  const [retiring, setRetiring] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const d = await api<{ packages: Pkg[] }>('/admin/packages', { auth: true })
      setPackages(d.packages ?? [])
      const defaults: Record<string, string> = {}
      for (const p of d.packages ?? []) {
        defaults[p.id] = JSON.stringify(p.rules ?? {}, null, 2)
      }
      setEditing(defaults)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load packages.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function saveRules(id: string) {
    setError(null)
    try {
      const rules = JSON.parse(editing[id] ?? '{}')
      await api(`/admin/packages/${id}/rules`, { method: 'PUT', auth: true, body: rules })
      addToast('success', 'Rules saved. The qualification engine reads these on the next evaluation.')
      await load()
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Rules must be valid JSON.'
      addToast('error', msg)
      setError(msg)
    }
  }

  async function retire(id: string) {
    setRetiring(true)
    try {
      await api(`/admin/packages/${id}/retire`, { method: 'POST', auth: true })
      addToast('success', 'Package retired.')
      await load()
    } catch (e) {
      addToast('error', e instanceof ApiError ? e.message : 'Could not retire package.')
    } finally {
      setRetiring(false)
      setConfirmRetire(null)
    }
  }

  async function addPackage(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await api('/admin/packages', {
        method: 'POST',
        auth: true,
        body: {
          code: newPkg.code,
          name: newPkg.name,
          description: newPkg.description || undefined,
          waitingPeriodMonths: newPkg.waitingPeriodMonths === '' ? null : Number(newPkg.waitingPeriodMonths),
        },
      })
      addToast('success', 'Package created.')
      setNewPkg({ code: '', name: '', waitingPeriodMonths: '', description: '' })
      setShowForm(false)
      await load()
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Could not add the package.'
      addToast('error', msg)
      setError(msg)
    }
  }

  return (
    <div className="container-luma py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-luma-900">Packages</h1>
          <p className="mt-1 text-sm text-stone-600">{packages.length} package{packages.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="rounded-md bg-luma-600 px-4 py-2 text-sm font-semibold text-white hover:bg-luma-700">
          {showForm ? 'Cancel' : '+ New package'}
        </button>
      </div>
      <p className="mt-1 text-sm text-stone-600">
        Package data lives in the database, not code. Changes here apply without a redeploy.
      </p>

      {showForm && (
        <form onSubmit={addPackage} className="mt-6 max-w-lg rounded-2xl border border-stone-200 bg-white p-6">
          <h2 className="font-semibold text-luma-900">New package</h2>
          <div className="mt-4 space-y-3">
            <input value={newPkg.code} onChange={(e) => setNewPkg((p) => ({ ...p, code: e.target.value }))} placeholder="code (e.g. water_drilling)" required className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm outline-none focus:border-luma-500" />
            <input value={newPkg.name} onChange={(e) => setNewPkg((p) => ({ ...p, name: e.target.value }))} placeholder="Name" required className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm outline-none focus:border-luma-500" />
            <input value={newPkg.description} onChange={(e) => setNewPkg((p) => ({ ...p, description: e.target.value }))} placeholder="Description" className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm outline-none focus:border-luma-500" />
            <input value={newPkg.waitingPeriodMonths} onChange={(e) => setNewPkg((p) => ({ ...p, waitingPeriodMonths: e.target.value }))} placeholder="Waiting period (months), blank = none" className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm outline-none focus:border-luma-500" />
            <button className="rounded-md bg-luma-600 px-4 py-2 text-sm font-semibold text-white hover:bg-luma-700">Add package</button>
          </div>
        </form>
      )}

      {error && <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {loading ? (
        <div className="mt-6 space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonCard key={i} lines={3} />
          ))}
        </div>
      ) : packages.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"
            title="No packages yet"
            message="Create your first package to get started."
          />
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {packages.map((p) => (
            <div key={p.id} className={`rounded-2xl border bg-white p-5 ${p.is_active ? 'border-stone-200' : 'border-stone-300 opacity-70'}`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-luma-900">
                    {p.name} {!p.is_active && <span className="text-xs text-stone-500">(retired)</span>}
                  </h2>
                  <div className="text-xs text-stone-500">
                    {p.code} · waiting period: {p.waiting_period_months === null ? 'none (contributions current)' : `${p.waiting_period_months} months`}
                  </div>
                </div>
                {p.is_active && (
                  <button onClick={() => setConfirmRetire(p)} className="rounded-md border border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-100">
                    Retire
                  </button>
                )}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {p.tiers.map((t) => (
                  <span key={t.id} className="rounded-md bg-luma-50 px-2 py-1 text-xs font-medium text-luma-800">
                    {t.name}: KSh {t.amount}
                  </span>
                ))}
              </div>

              <div className="mt-4">
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone-500">
                  Qualification rules (JSON — the engine reads these)
                </div>
                <textarea
                  value={editing[p.id] ?? ''}
                  onChange={(e) => setEditing((ed) => ({ ...ed, [p.id]: e.target.value }))}
                  rows={6}
                  className="w-full rounded-md border border-stone-300 px-3 py-2 font-mono text-xs outline-none focus:border-luma-500"
                />
                <div className="mt-1 text-xs text-stone-500">
                  Known keys: {knownRuleKeys.join(', ')}. Values are numbers or booleans.
                </div>
                <button
                  onClick={() => saveRules(p.id)}
                  className="mt-2 rounded-md bg-luma-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-luma-700"
                >
                  Save rules
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!confirmRetire}
        title="Retire Package"
        message={`Retire "${confirmRetire?.name}"? Existing subscriptions will continue, but new signups will be blocked.`}
        confirmLabel="Retire"
        variant="warning"
        loading={retiring}
        onConfirm={() => confirmRetire && retire(confirmRetire.id)}
        onCancel={() => setConfirmRetire(null)}
      />
    </div>
  )
}
