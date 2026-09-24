import { useCallback, useEffect, useState } from 'react'
import { api, ApiError } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { useHead } from '../../lib/seo'
import { useToast } from '../../components/Toast'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { ErrorState } from '../../components/ErrorState'
import { SkeletonTable } from '../../components/Skeleton'
import { reportLoadError } from '../../lib/userFacingError'

/** Must match server SUPERADMIN_GRANT_CONFIRM in shared/validate.ts */
const SUPERADMIN_GRANT_CONFIRM = 'GRANT SUPERADMIN'

type RoleOption = { id: string; name: string; description: string | null }

type StaffRow = {
  id: string
  display_name: string
  email: string | null
  role: string
  is_superadmin: boolean
  is_active: boolean
  granted_by: string | null
  granted_by_name: string | null
  granted_at: string | null
  is_self: boolean
}

type SearchHit = { id: string; full_name: string; email: string | null; phone: string | null }

type HistoryItem = {
  id: string
  actor_id: string | null
  actor_role: string | null
  action: string
  resource_id: string | null
  meta: Record<string, unknown> | null
  created_at: string
}

type Tab = 'staff' | 'history'

export function AdminStaffRoles() {
  useHead('Staff & Roles', undefined, { noindex: true })
  const { member } = useAuth()
  const { addToast } = useToast()

  const [tab, setTab] = useState<Tab>('staff')
  const [roles, setRoles] = useState<RoleOption[]>([])
  const [staff, setStaff] = useState<StaffRow[]>([])
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Grant form
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 300)
  const [hits, setHits] = useState<SearchHit[]>([])
  const [selected, setSelected] = useState<SearchHit | null>(null)
  const [roleName, setRoleName] = useState('admin')
  const [reason, setReason] = useState('')
  const [confirmSuper, setConfirmSuper] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [searching, setSearching] = useState(false)

  // Revoke dialog
  const [revokeTarget, setRevokeTarget] = useState<StaffRow | null>(null)
  const [revoking, setRevoking] = useState(false)

  const loadStaff = useCallback(async () => {
    const d = await api<{ staff: StaffRow[] }>('/admin/manage-user-role?action=list&include_inactive=true', {
      auth: true,
    })
    setStaff(d.staff ?? [])
  }, [])

  const loadRoles = useCallback(async () => {
    const d = await api<{ roles: RoleOption[] }>('/admin/manage-user-role?action=roles', { auth: true })
    setRoles(d.roles ?? [])
  }, [])

  const loadHistory = useCallback(async () => {
    const d = await api<{ items: HistoryItem[] }>('/admin/manage-user-role?action=history', { auth: true })
    setHistory(d.items ?? [])
  }, [])

  const refresh = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      await Promise.all([loadRoles(), loadStaff(), loadHistory()])
    } catch (e) {
      setError(reportLoadError(e, { page: 'admin-staff-roles' }, 'Could not load staff roles.'))
    } finally {
      setLoading(false)
    }
  }, [loadRoles, loadStaff, loadHistory])

  // eslint-disable-next-line oxc/react/set-state-in-effect
  useEffect(() => { refresh() }, [refresh])

  useEffect(() => {
    const q = debouncedSearch.trim()
    if (q.length < 2) {
      // eslint-disable-next-line oxc/react/set-state-in-effect -- clear hits when query too short
      setHits([])
      return
    }
    let cancelled = false
    setSearching(true)
    api<{ results: SearchHit[] }>(
      `/admin/manage-user-role?action=search&q=${encodeURIComponent(q)}`,
      { auth: true },
    )
      .then((d) => {
        if (!cancelled) setHits(d.results ?? [])
      })
      .catch(() => {
        if (!cancelled) setHits([])
      })
      .finally(() => {
        if (!cancelled) setSearching(false)
      })
    return () => { cancelled = true }
  }, [debouncedSearch])

  async function handleGrant(e: React.FormEvent) {
    e.preventDefault()
    if (!selected) {
      addToast('warning', 'Select a person to assign a role.')
      return
    }
    if (roleName === 'superadmin' && confirmSuper !== SUPERADMIN_GRANT_CONFIRM) {
      addToast('warning', `Type ${SUPERADMIN_GRANT_CONFIRM} to confirm.`)
      return
    }
    setSubmitting(true)
    try {
      const body: Record<string, unknown> = {
        action: 'grant',
        targetId: selected.id,
        roleName,
      }
      if (reason.trim()) body.reason = reason.trim()
      if (roleName === 'superadmin') body.confirmSuperadmin = confirmSuper

      const res = await api<{
        action?: string
        message?: string
        session_invalidated?: boolean
      }>('/admin/manage-user-role', {
        method: 'POST',
        auth: true,
        body,
      })
      if (res.action === 'noop') {
        addToast('info', res.message ?? 'Already assigned.')
      } else if (res.session_invalidated === false) {
        addToast(
          'warning',
          'Role updated, but their existing sessions could not be signed out. Ask them to sign in again.',
        )
      } else if (res.action === 'reactivate') {
        addToast('success', 'Staff reactivated with the selected role.')
      } else if (res.action === 'change_role') {
        addToast('success', 'Staff role updated.')
      } else {
        addToast('success', 'Staff role granted.')
      }
      setSelected(null)
      setSearch('')
      setHits([])
      setReason('')
      setConfirmSuper('')
      await refresh()
    } catch (err) {
      addToast('error', err instanceof ApiError ? err.message : 'Could not grant role.')
    } finally {
      setSubmitting(false)
    }
  }

  async function confirmRevoke() {
    if (!revokeTarget) return
    setRevoking(true)
    try {
      const res = await api<{ session_invalidated?: boolean }>('/admin/manage-user-role', {
        method: 'POST',
        auth: true,
        body: { action: 'revoke', targetId: revokeTarget.id },
      })
      if (res.session_invalidated === false) {
        addToast(
          'warning',
          `Removed admin access for ${revokeTarget.display_name}, but their existing sessions could not be signed out.`,
        )
      } else {
        addToast('success', `Removed admin access for ${revokeTarget.display_name}.`)
      }
      setRevokeTarget(null)
      await refresh()
    } catch (err) {
      addToast('error', err instanceof ApiError ? err.message : 'Could not revoke access.')
    } finally {
      setRevoking(false)
    }
  }

  const selfId = member?.id

  return (
    <div className="py-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Staff & Roles</h1>
        <p className="mt-1 text-sm text-gray-500">
          Assign a single admin role to an eligible member. Only superadmins can manage staff.
        </p>
      </div>

      {error && (
        <div className="mt-4">
          <ErrorState message={error} onRetry={refresh} />
        </div>
      )}

      <div className="mt-6 flex gap-2 border-b border-gray-200">
        <button
          type="button"
          onClick={() => setTab('staff')}
          className={`min-h-11 px-4 text-sm font-medium transition-colors ${
            tab === 'staff'
              ? 'border-b-2 border-luma-700 text-luma-800'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Staff
        </button>
        <button
          type="button"
          onClick={() => setTab('history')}
          className={`min-h-11 px-4 text-sm font-medium transition-colors ${
            tab === 'history'
              ? 'border-b-2 border-luma-700 text-luma-800'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          History
        </button>
      </div>

      {tab === 'staff' && (
        <div className="mt-6 space-y-8">
          <form
            onSubmit={handleGrant}
            className="space-y-4 rounded-xl border border-gray-200 bg-white p-4 sm:p-6"
            aria-label="Grant staff role"
          >
            <h2 className="text-base font-semibold text-gray-900">Assign role</h2>

            <div>
              <label htmlFor="staff-search" className="block text-sm font-medium text-gray-700">
                Person
              </label>
              <input
                id="staff-search"
                type="search"
                value={selected ? `${selected.full_name} (${selected.email ?? 'no email'})` : search}
                onChange={(e) => {
                  setSelected(null)
                  setSearch(e.target.value)
                }}
                placeholder="Search by name, email, or phone…"
                className="mt-1 block w-full min-h-11 rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-luma-500 focus:outline-none focus:ring-1 focus:ring-luma-500"
                autoComplete="off"
              />
              {searching && <p className="mt-1 text-xs text-gray-500">Searching…</p>}
              {!selected && hits.length > 0 && (
                <ul className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-sm" role="listbox">
                  {hits.map((h) => (
                    <li key={h.id}>
                      <button
                        type="button"
                        role="option"
                        className="flex min-h-11 w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-luma-50"
                        onClick={() => {
                          setSelected(h)
                          setSearch('')
                          setHits([])
                        }}
                      >
                        <span className="font-medium text-gray-900">{h.full_name}</span>
                        <span className="text-xs text-gray-500">{h.email ?? h.phone ?? h.id}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <label htmlFor="staff-role" className="block text-sm font-medium text-gray-700">
                Role
              </label>
              <select
                id="staff-role"
                value={roleName}
                onChange={(e) => {
                  setRoleName(e.target.value)
                  setConfirmSuper('')
                }}
                className="mt-1 block w-full min-h-11 rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-luma-500 focus:outline-none focus:ring-1 focus:ring-luma-500"
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.name}>
                    {r.name} — {r.description ?? ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="staff-reason" className="block text-sm font-medium text-gray-700">
                Reason <span className="font-normal text-gray-400">(optional)</span>
              </label>
              <textarea
                id="staff-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                maxLength={500}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-luma-500 focus:outline-none focus:ring-1 focus:ring-luma-500"
              />
            </div>

            {roleName === 'superadmin' && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="text-sm text-amber-900">
                  Superadmin has full platform access. Type <strong>{SUPERADMIN_GRANT_CONFIRM}</strong> to confirm.
                </p>
                <label htmlFor="staff-confirm-super" className="mt-2 block text-sm font-medium text-amber-900">
                  Confirmation
                </label>
                <input
                  id="staff-confirm-super"
                  type="text"
                  value={confirmSuper}
                  onChange={(e) => setConfirmSuper(e.target.value)}
                  className="mt-1 block w-full min-h-11 rounded-lg border border-amber-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  autoComplete="off"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || !selected}
              className="min-h-11 w-full rounded-lg bg-luma-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-luma-800 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              {submitting ? 'Assigning…' : 'Assign role'}
            </button>
          </form>

          <div>
            <h2 className="text-base font-semibold text-gray-900">Current staff</h2>
            {loading ? (
              <div className="mt-3">
                <SkeletonTable rows={5} />
              </div>
            ) : staff.length === 0 ? (
              <p className="mt-3 text-sm text-gray-500">No staff assignments.</p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead>
                    <tr className="text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                      <th className="px-3 py-2">Name</th>
                      <th className="px-3 py-2">Email</th>
                      <th className="px-3 py-2">Role</th>
                      <th className="px-3 py-2">Granted</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {staff.map((row) => {
                      const isSelf = row.is_self || row.id === selfId
                      return (
                        <tr key={row.id} className={!row.is_active ? 'opacity-60' : undefined}>
                          <td className="px-3 py-3 font-medium text-gray-900">
                            {row.display_name}
                            {isSelf && <span className="ml-1 text-xs text-gray-500">(you)</span>}
                          </td>
                          <td className="px-3 py-3 text-gray-600">{row.email ?? '—'}</td>
                          <td className="px-3 py-3">
                            <span className="inline-flex items-center rounded-md bg-luma-50 px-2 py-0.5 text-xs font-medium text-luma-800">
                              {row.role}
                            </span>
                            {row.is_superadmin && (
                              <span className="ml-1 inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                                superadmin
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-3 text-gray-600">
                            <div>{row.granted_by_name ?? '—'}</div>
                            <div className="text-xs text-gray-400">
                              {row.granted_at ? new Date(row.granted_at).toLocaleString() : '—'}
                            </div>
                          </td>
                          <td className="px-3 py-3 capitalize text-gray-600">
                            {row.is_active ? 'active' : 'inactive'}
                          </td>
                          <td className="px-3 py-3 text-right">
                            <button
                              type="button"
                              disabled={!row.is_active || isSelf}
                              title={isSelf ? 'You cannot revoke your own access' : 'Revoke admin access'}
                              onClick={() => setRevokeTarget(row)}
                              className="min-h-11 rounded-lg px-3 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'history' && (
        <div className="mt-6">
          {history.length === 0 ? (
            <p className="text-sm text-gray-500">No staff role changes recorded yet.</p>
          ) : (
            <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
              {history.map((item) => (
                <li key={item.id} className="px-4 py-3 text-sm">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium text-gray-900">{item.action}</span>
                    <time className="text-xs text-gray-500" dateTime={item.created_at}>
                      {new Date(item.created_at).toLocaleString()}
                    </time>
                  </div>
                  <div className="mt-1 text-xs text-gray-600">
                    target {String(item.meta?.target_id ?? item.resource_id ?? '—')}
                    {item.meta?.previous_role != null && (
                      <> · {String(item.meta.previous_role)} → {String(item.meta.new_role ?? '—')}</>
                    )}
                    {item.meta?.new_role != null && item.meta?.previous_role == null && (
                      <> · role {String(item.meta.new_role)}</>
                    )}
                    {item.actor_role && <> · by {item.actor_role}</>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <ConfirmDialog
        open={!!revokeTarget}
        title="Remove staff access?"
        message={
          revokeTarget
            ? `Revoke admin access for ${revokeTarget.display_name} (${revokeTarget.role})? Their sessions will be signed out.`
            : ''
        }
        confirmLabel="Remove access"
        variant="danger"
        loading={revoking}
        onConfirm={confirmRevoke}
        onCancel={() => setRevokeTarget(null)}
      />
    </div>
  )
}
