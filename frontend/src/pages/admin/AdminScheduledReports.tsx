import { useEffect, useState, useCallback } from 'react'
import { useHead } from '../../lib/seo'
import { api, ApiError } from '../../lib/api'
import { supabase } from '../../lib/supabase'

type Schedule = {
  id: string
  name: string
  report_type: string
  filters: Record<string, string>
  frequency: string
  recipients: string[]
  enabled: boolean
  last_generated_at: string | null
  next_run_at: string | null
  created_at: string
}

const reportTypes = [
  { value: 'contributions', label: 'Contributions' },
  { value: 'subscriptions', label: 'Subscriptions' },
  { value: 'claims', label: 'Claims' },
  { value: 'registration-fees', label: 'Registration Fees' },
  { value: 'members', label: 'Members' },
  { value: 'financial', label: 'Financial Summary' },
]

const frequencies = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
]

function timeAgo(date: string | null): string {
  if (!date) return 'Never'
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
  if (seconds < 60) return 'Just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function frequencyColor(f: string) {
  switch (f) {
    case 'daily': return 'bg-blue-100 text-blue-700'
    case 'weekly': return 'bg-emerald-100 text-emerald-700'
    case 'monthly': return 'bg-purple-100 text-purple-700'
    case 'quarterly': return 'bg-amber-100 text-amber-700'
    default: return 'bg-gray-100 text-gray-600'
  }
}

export function AdminScheduledReports() {
  useHead('Scheduled Reports', undefined, { noindex: true })

  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [generating, setGenerating] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'schedules' | 'history'>('schedules')
  const [history, setHistory] = useState<{ id: string; schedule_name: string; report_type: string; filename: string; record_count: number; status: string; error_message: string | null; generated_at: string }[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  // Create form state
  const [formName, setFormName] = useState('')
  const [formType, setFormType] = useState('contributions')
  const [formFrequency, setFormFrequency] = useState('monthly')
  const [formRecipients, setFormRecipients] = useState('')
  const [formStatus, setFormStatus] = useState('')
  const [formDateFrom, setFormDateFrom] = useState('')
  const [formDateTo, setFormDateTo] = useState('')

  const load = useCallback(async () => {
    try {
      const d = await api<{ schedules: Schedule[] }>('/admin/scheduled-reports', { auth: true })
      setSchedules(d.schedules ?? [])
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load schedules')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true)
    try {
      const d = await api<{ history: typeof history }>('/admin/scheduled-reports?action=history', { auth: true })
      setHistory(d.history ?? [])
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load history')
    } finally {
      setHistoryLoading(false)
    }
  }, [])

  useEffect(() => {
    if (activeTab === 'history') loadHistory()
  }, [activeTab, loadHistory])

  async function createSchedule() {
    if (!formName.trim()) return
    setError('')
    try {
      const filters: Record<string, string> = {}
      if (formStatus) filters.status = formStatus
      if (formDateFrom) filters.dateFrom = formDateFrom
      if (formDateTo) filters.dateTo = formDateTo

      const recipients = formRecipients.split(',').map(r => r.trim()).filter(Boolean)

      await api('/admin/scheduled-reports', {
        method: 'POST',
        auth: true,
        body: {
          name: formName.trim(),
          report_type: formType,
          frequency: formFrequency,
          filters,
          recipients,
        },
      })
      setNotice('Schedule created.')
      setShowCreate(false)
      setFormName('')
      setFormRecipients('')
      setFormStatus('')
      setFormDateFrom('')
      setFormDateTo('')
      await load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to create schedule')
    }
  }

  async function toggleEnabled(id: string, current: boolean) {
    try {
      await api(`/admin/scheduled-reports?id=${id}`, {
        method: 'PATCH',
        auth: true,
        body: { enabled: !current },
      })
      await load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to update')
    }
  }

  async function deleteSchedule(id: string, name: string) {
    if (!confirm(`Delete scheduled report "${name}"?`)) return
    try {
      await api(`/admin/scheduled-reports?id=${id}`, { method: 'DELETE', auth: true })
      setNotice(`Deleted "${name}".`)
      await load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to delete')
    }
  }

  async function generateNow(id: string) {
    setGenerating(id)
    setError('')
    try {
      const result = await api<{ message: string; filename: string; records: number; storage_path: string }>(
        `/admin/scheduled-reports?id=${id}&action=generate`,
        { method: 'POST', auth: true },
      )
      setNotice(`Generated: ${result.filename} (${result.records} records)`)

      // Trigger download via Supabase Storage
      const { data: blob, error: dlErr } = await supabase.storage
        .from('report-files')
        .download(`${result.storage_path}`)
      if (!dlErr && blob) {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url; a.download = result.filename; a.click()
        URL.revokeObjectURL(url)
      }

      await load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to generate report')
    } finally {
      setGenerating(null)
    }
  }

  return (
    <div className="py-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Scheduled Reports</h1>
          <p className="mt-1 text-sm text-gray-500">Automate recurring report generation and delivery.</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-luma-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-luma-800 transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
          New Schedule
        </button>
      </div>

      {error && <div className="mt-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}
      {notice && <div className="mt-4 rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">{notice}</div>}

      {/* Tabs */}
      <div className="mt-6 flex gap-1 rounded-lg border border-gray-200 bg-white p-1 w-fit">
        <button
          onClick={() => setActiveTab('schedules')}
          className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'schedules' ? 'bg-luma-100 text-luma-700' : 'text-gray-500 hover:bg-gray-50'
          }`}
        >
          Schedules
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'history' ? 'bg-luma-100 text-luma-700' : 'text-gray-500 hover:bg-gray-50'
          }`}
        >
          History {history.length > 0 && <span className="ml-1.5 rounded-full bg-gray-100 px-1.5 py-0.5 text-xs">{history.length}</span>}
        </button>
      </div>

      {/* Schedules Tab */}
      {activeTab === 'schedules' && (
      <div className="mt-6 space-y-4">
        {loading ? (
          <div className="py-12 text-center text-gray-500">Loading…</div>
        ) : schedules.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-white py-16 text-center">
            <svg className="mx-auto h-10 w-10 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
            </svg>
            <p className="mt-3 text-sm text-gray-500">No scheduled reports yet.</p>
            <button onClick={() => setShowCreate(true)} className="mt-3 text-sm font-medium text-luma-700 hover:text-luma-800">Create your first schedule →</button>
          </div>
        ) : (
          schedules.map((s) => (
            <div key={s.id} className="rounded-2xl border border-gray-200 bg-white p-5 transition-all hover:shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-gray-900 truncate">{s.name}</h3>
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${frequencyColor(s.frequency)}`}>
                      {s.frequency}
                    </span>
                    {!s.enabled && (
                      <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-500">Disabled</span>
                    )}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-gray-500">
                    <span className="inline-flex items-center gap-1">
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
                      {reportTypes.find(r => r.value === s.report_type)?.label ?? s.report_type}
                    </span>
                    {s.last_generated_at && (
                      <span>Last: {timeAgo(s.last_generated_at)}</span>
                    )}
                    {s.next_run_at && s.enabled && (
                      <span>Next: {new Date(s.next_run_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                    )}
                    {s.recipients.length > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg>
                        {s.recipients.length} recipient{s.recipients.length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  {Object.keys(s.filters).length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {Object.entries(s.filters).map(([k, v]) => (
                        <span key={k} className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                          {k}: {v}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => generateNow(s.id)}
                    disabled={generating === s.id}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-luma-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-luma-800 disabled:opacity-50 transition-colors"
                  >
                    {generating === s.id ? (
                      <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                    ) : (
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
                    )}
                    Generate
                  </button>
                  <button
                    onClick={() => toggleEnabled(s.id, s.enabled)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                      s.enabled
                        ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                  >
                    {s.enabled ? 'Enabled' : 'Disabled'}
                  </button>
                  <button
                    onClick={() => deleteSchedule(s.id, s.name)}
                    className="rounded-lg px-2 py-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                    title="Delete"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
      )}

      {/* History Tab */}
      {activeTab === 'history' && (
      <div className="mt-6">
        {historyLoading ? (
          <div className="py-12 text-center text-gray-500">Loading history…</div>
        ) : history.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-white py-16 text-center">
            <svg className="mx-auto h-10 w-10 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="mt-3 text-sm text-gray-500">No report history yet.</p>
            <p className="mt-1 text-xs text-gray-400">Generate a report from a schedule to see it here.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-5 py-3">Report</th>
                  <th className="px-5 py-3">Type</th>
                  <th className="px-5 py-3">Records</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Generated</th>
                  <th className="px-5 py-3 text-right">File</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {history.map((h) => (
                  <tr key={h.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3 font-medium text-gray-900">{h.schedule_name}</td>
                    <td className="px-5 py-3">
                      <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                        {h.report_type}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-600">{h.record_count.toLocaleString()}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                        h.status === 'success' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {h.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-500 text-xs">
                      {new Date(h.generated_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={async () => {
                          try {
                            const { data: blob, error } = await supabase.storage
                              .from('report-files')
                              .download(h.filename)
                            if (!error && blob) {
                              const url = URL.createObjectURL(blob)
                              const a = document.createElement('a')
                              a.href = url; a.download = h.filename; a.click()
                              URL.revokeObjectURL(url)
                            }
                          } catch {}
                        }}
                        className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
                        CSV
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
            <div className="px-6 py-5">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-gray-900">New Scheduled Report</h3>
                <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-600">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>

              <div className="mt-5 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Report Name</label>
                  <input
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="e.g. Monthly Contributions Report"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-luma-500 focus:ring-1 focus:ring-luma-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Report Type</label>
                    <select value={formType} onChange={(e) => setFormType(e.target.value)} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-luma-500">
                      {reportTypes.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Frequency</label>
                    <select value={formFrequency} onChange={(e) => setFormFrequency(e.target.value)} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-luma-500">
                      {frequencies.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Status Filter</label>
                    <select value={formStatus} onChange={(e) => setFormStatus(e.target.value)} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-luma-500">
                      <option value="">All Statuses</option>
                      <option value="Pending">Pending</option>
                      <option value="Verified">Verified</option>
                      <option value="Failed">Failed</option>
                      <option value="active">Active</option>
                      <option value="cancelled">Cancelled</option>
                      <option value="Approved">Approved</option>
                      <option value="Rejected">Rejected</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Recipients</label>
                    <input
                      value={formRecipients}
                      onChange={(e) => setFormRecipients(e.target.value)}
                      placeholder="email1@example.com, email2@example.com"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-luma-500 focus:ring-1 focus:ring-luma-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Date From</label>
                    <input type="date" value={formDateFrom} onChange={(e) => setFormDateFrom(e.target.value)} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-luma-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Date To</label>
                    <input type="date" value={formDateTo} onChange={(e) => setFormDateTo(e.target.value)} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-luma-500" />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-6 py-4">
              <button onClick={() => setShowCreate(false)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button
                onClick={createSchedule}
                disabled={!formName.trim()}
                className="rounded-lg bg-luma-700 px-4 py-2 text-sm font-semibold text-white hover:bg-luma-800 disabled:opacity-50 transition-colors"
              >
                Create Schedule
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
