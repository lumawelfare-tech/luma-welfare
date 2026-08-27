import { useEffect, useState, useCallback } from 'react'
import { api, ApiError } from '../lib/api'

type Webhook = {
  id: string
  name: string
  url: string
  type: 'slack' | 'discord' | 'custom'
  events: string[]
  enabled: boolean
  last_sent: string | null
  last_status: number | null
  created_at: string
}

const EVENT_OPTIONS = [
  { value: 'health.unhealthy', label: 'Unhealthy' },
  { value: 'health.degraded', label: 'Degraded' },
  { value: 'health.healthy', label: 'Healthy (recovery)' },
]

const TYPE_INFO: Record<string, { label: string; color: string; placeholder: string }> = {
  slack: { label: 'Slack', color: 'bg-purple-100 text-purple-700', placeholder: 'https://hooks.slack.com/services/...' },
  discord: { label: 'Discord', color: 'bg-indigo-100 text-indigo-700', placeholder: 'https://discord.com/api/webhooks/...' },
  custom: { label: 'Custom', color: 'bg-gray-100 text-gray-700', placeholder: 'https://your-api.com/webhook' },
}

export function WebhookSettings() {
  const [webhooks, setWebhooks] = useState<Webhook[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', url: '', type: 'slack' as string, events: ['health.unhealthy', 'health.degraded'] })
  const [saving, setSaving] = useState(false)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<{ id: string; ok: boolean; message: string } | null>(null)

  const load = useCallback(async () => {
    try {
      const d = await api<{ webhooks: Webhook[] }>('/admin/settings?resource=webhooks', { auth: true })
      setWebhooks(d.webhooks ?? [])
      setError(null)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load webhooks.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function handleSave() {
    if (!form.name || !form.url) return
    setSaving(true)
    try {
      if (editingId) {
        await api(`/admin/settings?action=update-webhook&id=${editingId}`, {
          method: 'PATCH', auth: true, body: form,
        })
      } else {
        await api('/admin/settings?action=create-webhook', {
          method: 'POST', auth: true, body: form,
        })
      }
      setShowForm(false)
      setEditingId(null)
      setForm({ name: '', url: '', type: 'slack', events: ['health.unhealthy', 'health.degraded'] })
      await load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save webhook.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this webhook?')) return
    try {
      await api(`/admin/settings?action=delete-webhook&id=${id}`, { method: 'DELETE', auth: true })
      await load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not delete webhook.')
    }
  }

  async function handleTest(id: string) {
    setTestingId(id)
    setTestResult(null)
    try {
      const d = await api<{ message: string; status: number }>(`/admin/settings?action=test-webhook&id=${id}`, { method: 'POST', auth: true })
      setTestResult({ id, ok: true, message: d.message })
      await load() // Refresh to show updated last_sent
    } catch (e) {
      setTestResult({ id, ok: false, message: e instanceof Error ? e.message : 'Test failed' })
    } finally {
      setTestingId(null)
    }
  }

  async function handleToggle(id: string, enabled: boolean) {
    try {
      await api(`/admin/settings?action=update-webhook&id=${id}`, {
        method: 'PATCH', auth: true, body: { enabled },
      })
      await load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not update webhook.')
    }
  }

  function startEdit(wh: Webhook) {
    setForm({ name: wh.name, url: wh.url, type: wh.type, events: wh.events })
    setEditingId(wh.id)
    setShowForm(true)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Alert Webhooks</h3>
          <p className="mt-1 text-xs text-gray-500">Send health check alerts to Slack, Discord, or custom endpoints.</p>
        </div>
        <button
          onClick={() => { setShowForm(!showForm); setEditingId(null); setForm({ name: '', url: '', type: 'slack', events: ['health.unhealthy', 'health.degraded'] }) }}
          className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          {showForm ? 'Cancel' : '+ Add Webhook'}
        </button>
      </div>

      {error && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{error}</div>}

      {/* Add/Edit Form */}
      {showForm && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Name</label>
              <input
                value={form.name}
                onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Ops Slack Channel"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-luma-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Type</label>
              <select
                value={form.type}
                onChange={(e) => setForm(f => ({ ...f, type: e.target.value }))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-luma-500"
              >
                <option value="slack">Slack</option>
                <option value="discord">Discord</option>
                <option value="custom">Custom</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Webhook URL</label>
              <input
                value={form.url}
                onChange={(e) => setForm(f => ({ ...f, url: e.target.value }))}
                placeholder={TYPE_INFO[form.type]?.placeholder ?? 'https://...'}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono outline-none focus:border-luma-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Alert Events</label>
            <div className="flex flex-wrap gap-2">
              {EVENT_OPTIONS.map(opt => (
                <label key={opt.value} className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.events.includes(opt.value)}
                    onChange={(e) => {
                      setForm(f => ({
                        ...f,
                        events: e.target.checked
                          ? [...f.events, opt.value]
                          : f.events.filter(ev => ev !== opt.value),
                      }))
                    }}
                    className="rounded border-gray-300 text-luma-600 focus:ring-luma-500"
                  />
                  <span className="text-xs text-gray-600">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => { setShowForm(false); setEditingId(null) }}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !form.name || !form.url}
              className="rounded-lg bg-luma-700 px-4 py-1.5 text-xs font-semibold text-white hover:bg-luma-800 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving…' : editingId ? 'Update' : 'Create'}
            </button>
          </div>
        </div>
      )}

      {/* Webhook List */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-gray-100" />
          ))}
        </div>
      ) : webhooks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center">
          <svg className="mx-auto h-8 w-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
          </svg>
          <p className="mt-2 text-sm font-medium text-gray-500">No webhooks configured</p>
          <p className="mt-1 text-xs text-gray-400">Add a Slack, Discord, or custom webhook to receive health alerts.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {webhooks.map(wh => {
            const typeInfo = TYPE_INFO[wh.type] ?? TYPE_INFO.custom
            return (
              <div key={wh.id} className={`flex items-center gap-4 rounded-xl border bg-white px-4 py-3 transition-colors ${wh.enabled ? 'border-gray-200' : 'border-gray-100 opacity-60'}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900">{wh.name}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${typeInfo.color}`}>
                      {typeInfo.label}
                    </span>
                    {!wh.enabled && <span className="text-[10px] font-medium text-gray-400">DISABLED</span>}
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
                    <span className="font-mono truncate max-w-[300px]">{wh.url}</span>
                    <span>•</span>
                    <span>{wh.events.length} event{wh.events.length !== 1 ? 's' : ''}</span>
                    {wh.last_sent && (
                      <>
                        <span>•</span>
                        <span className={wh.last_status && wh.last_status >= 200 && wh.last_status < 300 ? 'text-emerald-600' : 'text-red-600'}>
                          Last: {wh.last_status} ({new Date(wh.last_sent).toLocaleDateString()})
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {/* Toggle */}
                  <button
                    onClick={() => handleToggle(wh.id, !wh.enabled)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${wh.enabled ? 'bg-luma-600' : 'bg-gray-300'}`}
                    aria-label={wh.enabled ? 'Disable webhook' : 'Enable webhook'}
                  >
                    <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${wh.enabled ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
                  </button>
                  {/* Test */}
                  <button
                    onClick={() => handleTest(wh.id)}
                    disabled={testingId === wh.id}
                    className="rounded-lg border border-gray-200 px-2 py-1 text-[10px] font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                  >
                    {testingId === wh.id ? '…' : 'Test'}
                  </button>
                  {/* Edit */}
                  <button onClick={() => startEdit(wh)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors" aria-label="Edit">
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                    </svg>
                  </button>
                  {/* Delete */}
                  <button onClick={() => handleDelete(wh.id)} className="rounded-lg p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors" aria-label="Delete">
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Test Result Toast */}
      {testResult && (
        <div className={`rounded-lg border px-3 py-2 text-xs ${testResult.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
          {testResult.ok ? '✅' : '❌'} {testResult.message}
          <button onClick={() => setTestResult(null)} className="ml-2 font-medium opacity-60 hover:opacity-100">✕</button>
        </div>
      )}
    </div>
  )
}
