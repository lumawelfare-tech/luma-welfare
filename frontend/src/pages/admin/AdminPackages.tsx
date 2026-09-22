import { useEffect, useMemo, useState } from 'react'
import { api, ApiError } from '../../lib/api'
import { useHead } from '../../lib/seo'
import { useToast } from '../../components/Toast'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { EmptyState } from '../../components/EmptyState'
import { ErrorState } from '../../components/ErrorState'
import { SkeletonCard } from '../../components/Skeleton'
import { reportLoadError } from '../../lib/userFacingError'
import { formatPackageTiersSummary, validateTierAgeOverlaps } from '../../lib/packageTiers'

type RuleMap = Record<string, unknown>
type Tier = {
  id: string
  name: string
  amount: number
  min_age?: number | null
  max_age?: number | null
}
type Pkg = {
  id: string
  code: string
  name: string
  description: string | null
  waiting_period_months: number | null
  is_active: boolean
  parent_package_id?: string | null
  tiers: Tier[]
  rules: RuleMap
}

type TierDraft = { name: string; amount: string; minAge: string; maxAge: string }

export function AdminPackages() {
  useHead('Packages', undefined, { noindex: true })
  const { addToast } = useToast()
  const [packages, setPackages] = useState<Pkg[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<Record<string, string>>({})
  const [showForm, setShowForm] = useState(false)
  const [newPkg, setNewPkg] = useState({
    code: '',
    name: '',
    waitingPeriodMonths: '',
    description: '',
    parentPackageId: '',
  })
  const [confirmRetire, setConfirmRetire] = useState<Pkg | null>(null)
  const [retiring, setRetiring] = useState(false)
  const [tierDrafts, setTierDrafts] = useState<Record<string, TierDraft[]>>({})
  const [savingTiers, setSavingTiers] = useState<string | null>(null)

  async function load() {
    try {
      const d = await api<{ packages: Pkg[] }>('/admin/packages', { auth: true })
      setPackages(d.packages ?? [])
      const defaults: Record<string, string> = {}
      const drafts: Record<string, TierDraft[]> = {}
      for (const p of d.packages ?? []) {
        defaults[p.id] = JSON.stringify(p.rules ?? {}, null, 2)
        drafts[p.id] = (p.tiers ?? []).map((t) => ({
          name: t.name,
          amount: String(t.amount),
          minAge: t.min_age != null ? String(t.min_age) : '',
          maxAge: t.max_age != null ? String(t.max_age) : '',
        }))
      }
      setEditing(defaults)
      setTierDrafts(drafts)
    } catch (e) {
      setError(reportLoadError(e, { page: 'admin-packages' }, 'Could not load packages.'))
    } finally {
      setLoading(false)
    }
  }

  // eslint-disable-next-line oxc/react/set-state-in-effect — loading initialized true; setLoading(false) in finally after await
  useEffect(() => { load() }, [])

  const topLevelParents = useMemo(
    () => packages.filter((p) => !p.parent_package_id && p.is_active),
    [packages],
  )

  const orderedPackages = useMemo(() => {
    const parents = packages.filter((p) => !p.parent_package_id)
    const out: Pkg[] = []
    for (const parent of parents) {
      out.push(parent)
      out.push(...packages.filter((c) => c.parent_package_id === parent.id))
    }
    // Orphans with missing parent
    for (const p of packages) {
      if (p.parent_package_id && !packages.some((x) => x.id === p.parent_package_id)) out.push(p)
    }
    return out
  }, [packages])

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

  async function saveTiers(id: string) {
    setError(null)
    setSavingTiers(id)
    try {
      const drafts = tierDrafts[id] ?? []
      const overlap = validateTierAgeOverlaps(
        drafts.map((d) => ({
          name: d.name,
          min_age: d.minAge === '' ? null : Number(d.minAge),
          max_age: d.maxAge === '' ? null : Number(d.maxAge),
        })),
      )
      if (overlap) {
        addToast('error', overlap)
        setError(overlap)
        return
      }
      await api(`/admin/packages/${id}/tiers`, {
        method: 'PUT',
        auth: true,
        body: {
          tiers: drafts.map((d, i) => ({
            name: d.name,
            amount: Number(d.amount),
            minAge: d.minAge === '' ? null : Number(d.minAge),
            maxAge: d.maxAge === '' ? null : Number(d.maxAge),
            sortOrder: i + 1,
          })),
        },
      })
      addToast('success', 'Contribution tiers saved.')
      await load()
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Could not save tiers.'
      addToast('error', msg)
      setError(msg)
    } finally {
      setSavingTiers(null)
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
          parentPackageId: newPkg.parentPackageId || undefined,
        },
      })
      addToast('success', 'Package created.')
      setNewPkg({ code: '', name: '', waitingPeriodMonths: '', description: '', parentPackageId: '' })
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
        Package data lives in the database, not code. Nest sub-categories under a parent. Age bounds on tiers drive Welfare pricing (0–79 vs 80+).
      </p>

      {showForm && (
        <form onSubmit={addPackage} className="mt-6 max-w-lg glass-panel p-6">
          <h2 className="font-semibold text-luma-900">New package</h2>
          <div className="mt-4 space-y-3">
            <input aria-label="Package code" value={newPkg.code} onChange={(e) => setNewPkg((p) => ({ ...p, code: e.target.value }))} placeholder="code (e.g. water_drilling)" required className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm outline-none focus:border-luma-500" />
            <input aria-label="Package name" value={newPkg.name} onChange={(e) => setNewPkg((p) => ({ ...p, name: e.target.value }))} placeholder="Name" required className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm outline-none focus:border-luma-500" />
            <input aria-label="Package description" value={newPkg.description} onChange={(e) => setNewPkg((p) => ({ ...p, description: e.target.value }))} placeholder="Description" className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm outline-none focus:border-luma-500" />
            <input aria-label="Waiting period in months" value={newPkg.waitingPeriodMonths} onChange={(e) => setNewPkg((p) => ({ ...p, waitingPeriodMonths: e.target.value }))} placeholder="Waiting period (months), blank = none" className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm outline-none focus:border-luma-500" />
            <label className="block text-xs font-medium text-stone-600">
              Parent package (optional — for sub-categories)
              <select
                aria-label="Parent package"
                value={newPkg.parentPackageId}
                onChange={(e) => setNewPkg((p) => ({ ...p, parentPackageId: e.target.value }))}
                className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm outline-none focus:border-luma-500"
              >
                <option value="">None (top-level)</option>
                {topLevelParents.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </label>
            <button className="rounded-md bg-luma-600 px-4 py-2 text-sm font-semibold text-white hover:bg-luma-700">Add package</button>
          </div>
        </form>
      )}

      {error && !loading && (
        <div className="mt-4">
          <ErrorState
            message={error}
            onRetry={() => { setError(null); setLoading(true); load() }}
          />
        </div>
      )}

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
          {orderedPackages.map((p) => {
            const isChild = Boolean(p.parent_package_id)
            const childCount = packages.filter((c) => c.parent_package_id === p.id).length
            return (
              <div
                key={p.id}
                className={`glass-panel p-5 ${p.is_active ? '' : 'opacity-70'} ${isChild ? 'ml-6 border-l-2 border-luma-200' : ''}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold text-luma-900">
                        {p.name} {!p.is_active && <span className="text-xs text-stone-500">(retired)</span>}
                      </h2>
                      {isChild ? (
                        <span className="rounded bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">Sub-category</span>
                      ) : childCount > 0 ? (
                        <span className="rounded bg-luma-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-luma-800">Parent</span>
                      ) : null}
                    </div>
                    <div className="text-xs text-stone-500">
                      {p.code} · waiting period:{' '}
                      {p.waiting_period_months == null
                        ? 'none (contributions current)'
                        : `${p.waiting_period_months} months`}
                    </div>
                    <div className="mt-1 text-xs font-medium text-luma-800">
                      {formatPackageTiersSummary(p.tiers)}
                    </div>
                  </div>
                  {p.is_active && (
                    <button onClick={() => setConfirmRetire(p)} className="rounded-md border border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-100">
                      Retire
                    </button>
                  )}
                </div>

                <div className="mt-4">
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone-500">
                    Contribution tiers (name, amount, optional age min/max)
                  </div>
                  <div className="space-y-2">
                    {(tierDrafts[p.id] ?? []).map((row, idx) => (
                      <div key={idx} className="grid gap-2 sm:grid-cols-5">
                        <input
                          aria-label={`Tier ${idx + 1} name`}
                          value={row.name}
                          onChange={(e) => {
                            const next = [...(tierDrafts[p.id] ?? [])]
                            next[idx] = { ...next[idx], name: e.target.value }
                            setTierDrafts((d) => ({ ...d, [p.id]: next }))
                          }}
                          placeholder="Name"
                          className="rounded-md border border-stone-300 px-2 py-1.5 text-sm sm:col-span-2"
                        />
                        <input
                          aria-label={`Tier ${idx + 1} amount`}
                          value={row.amount}
                          onChange={(e) => {
                            const next = [...(tierDrafts[p.id] ?? [])]
                            next[idx] = { ...next[idx], amount: e.target.value }
                            setTierDrafts((d) => ({ ...d, [p.id]: next }))
                          }}
                          placeholder="Amount"
                          className="rounded-md border border-stone-300 px-2 py-1.5 text-sm"
                        />
                        <input
                          aria-label={`Tier ${idx + 1} min age`}
                          value={row.minAge}
                          onChange={(e) => {
                            const next = [...(tierDrafts[p.id] ?? [])]
                            next[idx] = { ...next[idx], minAge: e.target.value }
                            setTierDrafts((d) => ({ ...d, [p.id]: next }))
                          }}
                          placeholder="Min age"
                          className="rounded-md border border-stone-300 px-2 py-1.5 text-sm"
                        />
                        <input
                          aria-label={`Tier ${idx + 1} max age`}
                          value={row.maxAge}
                          onChange={(e) => {
                            const next = [...(tierDrafts[p.id] ?? [])]
                            next[idx] = { ...next[idx], maxAge: e.target.value }
                            setTierDrafts((d) => ({ ...d, [p.id]: next }))
                          }}
                          placeholder="Max age"
                          className="rounded-md border border-stone-300 px-2 py-1.5 text-sm"
                        />
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="rounded-md border border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-100"
                      onClick={() =>
                        setTierDrafts((d) => ({
                          ...d,
                          [p.id]: [...(d[p.id] ?? []), { name: '', amount: '', minAge: '', maxAge: '' }],
                        }))
                      }
                    >
                      + Tier
                    </button>
                    <button
                      type="button"
                      disabled={savingTiers === p.id}
                      onClick={() => saveTiers(p.id)}
                      className="rounded-md bg-luma-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-luma-700 disabled:opacity-50"
                    >
                      {savingTiers === p.id ? 'Saving…' : 'Save tiers'}
                    </button>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone-500">
                    Qualification rules (JSON — the engine reads these)
                  </div>
                  <textarea
                    value={editing[p.id] ?? ''}
                    onChange={(e) => setEditing((ed) => ({ ...ed, [p.id]: e.target.value }))}
                    rows={4}
                    className="w-full rounded-md border border-stone-300 px-3 py-2 font-mono text-xs outline-none focus:border-luma-500"
                  />
                  <button
                    type="button"
                    onClick={() => saveRules(p.id)}
                    className="mt-2 rounded-md bg-luma-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-luma-700"
                  >
                    Save rules
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirmRetire)}
        title="Retire package?"
        message={confirmRetire ? `Retire “${confirmRetire.name}”? Members keep existing subscriptions; new joins stop.` : ''}
        confirmLabel="Retire"
        loading={retiring}
        onConfirm={() => confirmRetire && retire(confirmRetire.id)}
        onCancel={() => setConfirmRetire(null)}
      />
    </div>
  )
}
