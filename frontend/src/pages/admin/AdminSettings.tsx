import { useEffect, useState } from 'react'
import { api, ApiError } from '../../lib/api'
import { useHead } from '../../lib/seo'

type Setting = { key: string; value: unknown; description: string | null }

export function AdminSettings() {
  useHead('Settings', undefined, { noindex: true })
  const [settings, setSettings] = useState<Setting[]>([])
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [editing, setEditing] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState('general')

  async function load() {
    try {
      const d = await api<Record<string, unknown>>('/settings?resource=settings', { auth: true })
      const rows: Setting[] = []
      for (const [key, value] of Object.entries(d)) {
        if (key === 'error') continue
        rows.push({ key, value: typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value ?? ''), description: null })
      }
      setSettings(rows)
      const edits: Record<string, string> = {}
      for (const r of rows) edits[r.key] = r.value as string
      setEditing(edits)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load settings.')
    }
  }

  useEffect(() => { load() }, [])

  async function save() {
    setSaving(true)
    setError(null)
    try {
      for (const s of settings) {
        if (editing[s.key] !== (s.value as string)) {
          await api(`/admin/settings`, { method: 'PATCH', auth: true, body: { key: s.key, value: editing[s.key] } })
        }
      }
      setNotice('Settings saved.')
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save settings.')
    } finally {
      setSaving(false)
    }
  }

  const tabs = ['general', 'contact', 'membership', 'payments', 'system']
  const filtered = settings.filter(s => {
    if (tab === 'general') return ['org_contact', 'stats', 'mpesa'].includes(s.key)
    if (tab === 'contact') return s.key === 'org_contact'
    if (tab === 'membership') return s.key === 'stats'
    if (tab === 'payments') return s.key === 'mpesa'
    return true
  })

  return (
    <div className="py-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          <p className="mt-1 text-sm text-gray-500">Manage platform configuration.</p>
        </div>
        <button onClick={save} disabled={saving} className="rounded-lg bg-luma-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-luma-800 disabled:opacity-60 transition-colors">
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>

      {error && <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {notice && <div className="mt-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">{notice}</div>}

      <div className="mt-6 flex gap-1 rounded-lg border border-gray-200 bg-white p-1">
        {tabs.map(t => (
          <button key={t} onClick={() => setTab(t)} className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${tab === t ? 'bg-luma-50 text-luma-700' : 'text-gray-500 hover:bg-gray-50'}`}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      <div className="mt-6 space-y-4">
        {filtered.map(s => (
          <div key={s.key} className="rounded-xl border border-gray-200 bg-white p-4">
            <label className="text-sm font-medium text-gray-700">{s.key}</label>
            <textarea
              value={editing[s.key] ?? ''}
              onChange={(e) => setEditing(ed => ({ ...ed, [s.key]: e.target.value }))}
              rows={4}
              className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-xs outline-none focus:border-luma-500"
            />
          </div>
        ))}
        {filtered.length === 0 && <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-gray-500">No settings in this section.</div>}
      </div>
    </div>
  )
}
