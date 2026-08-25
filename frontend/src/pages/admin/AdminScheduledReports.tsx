import { useEffect, useState, useCallback } from 'react'
import { useHead } from '../../lib/seo'
import { api, ApiError } from '../../lib/api'
import { supabase } from '../../lib/supabase'

type Schedule = {
  id: string; name: string; report_type: string; filters: Record<string, string>
  frequency: string; recipients: string[]; enabled: boolean
  last_generated_at: string | null; next_run_at: string | null; created_at: string
}

type HistoryRecord = {
  id: string; schedule_id: string | null; schedule_name: string; report_type: string
  filename: string; record_count: number; status: string; error_message: string | null
  generated_at: string
}

type HistoryResponse = {
  history: HistoryRecord[]; total: number; page: number; per_page: number; total_pages: number
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
  { value: 'daily', label: 'Daily' }, { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' }, { value: 'quarterly', label: 'Quarterly' },
]

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

  // Create form
  const [formName, setFormName] = useState('')
  const [formType, setFormType] = useState('contributions')
  const [formFrequency, setFormFrequency] = useState('monthly')
  const [formRecipients, setFormRecipients] = useState('')
  const [formStatus, setFormStatus] = useState('')
  const [formDateFrom, setFormDateFrom] = useState('')
  const [formDateTo, setFormDateTo] = useState('')

  // History state
  const [history, setHistory] = useState<HistoryRecord[]>([])
  const [historyTotal, setHistoryTotal] = useState(0)
  const [historyPage, setHistoryPage] = useState(1)
  const [historyPages, setHistoryPages] = useState(1)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historySearch, setHistorySearch] = useState('')
  const [historyType, setHistoryType] = useState('')
  const [historyStatus, setHistoryStatus] = useState('')
  const [historyDateFrom, setHistoryDateFrom] = useState('')
  const [historyDateTo, setHistoryDateTo] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkDownloading, setBulkDownloading] = useState(false)
  const [showCleanup, setShowCleanup] = useState(false)

  const load = useCallback(async () => {
    try {
      const d = await api<{ schedules: Schedule[] }>('/admin/scheduled-reports', { auth: true })
      setSchedules(d.schedules ?? [])
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load schedules')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const loadHistory = useCallback(async (page = 1) => {
    setHistoryLoading(true)
    try {
      const params = new URLSearchParams({ action: 'history', page: String(page), per_page: '20' })
      if (historySearch) params.set('search', historySearch)
      if (historyType) params.set('type', historyType)
      if (historyStatus) params.set('status', historyStatus)
      if (historyDateFrom) params.set('date_from', historyDateFrom)
      if (historyDateTo) params.set('date_to', historyDateTo)
      const d = await api<HistoryResponse>(`/admin/scheduled-reports?${params}`, { auth: true })
      setHistory(d.history ?? [])
      setHistoryTotal(d.total)
      setHistoryPage(d.page)
      setHistoryPages(d.total_pages)
      setSelectedIds(new Set())
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load history')
    } finally { setHistoryLoading(false) }
  }, [historySearch, historyType, historyStatus, historyDateFrom, historyDateTo])

  useEffect(() => { if (activeTab === 'history') loadHistory(1) }, [activeTab, loadHistory])

  async function createSchedule() {
    if (!formName.trim()) return
    setError('')
    try {
      const filters: Record<string, string> = {}
      if (formStatus) filters.status = formStatus
      if (formDateFrom) filters.dateFrom = formDateFrom
      if (formDateTo) filters.dateTo = formDateTo
      const recipients = formRecipients.split(',').map(r => r.trim()).filter(Boolean)
      await api('/admin/scheduled-reports', { method: 'POST', auth: true, body: { name: formName.trim(), report_type: formType, frequency: formFrequency, filters, recipients } })
      setNotice('Schedule created.')
      setShowCreate(false); setFormName(''); setFormRecipients(''); setFormStatus(''); setFormDateFrom(''); setFormDateTo('')
      await load()
    } catch (e) { setError(e instanceof ApiError ? e.message : 'Failed to create schedule') }
  }

  async function toggleEnabled(id: string, current: boolean) {
    try { await api(`/admin/scheduled-reports?id=${id}`, { method: 'PATCH', auth: true, body: { enabled: !current } }); await load() }
    catch (e) { setError(e instanceof ApiError ? e.message : 'Failed to update') }
  }

  async function deleteSchedule(id: string, name: string) {
    if (!confirm(`Delete scheduled report "${name}"?`)) return
    try { await api(`/admin/scheduled-reports?id=${id}`, { method: 'DELETE', auth: true }); setNotice(`Deleted "${name}".`); await load() }
    catch (e) { setError(e instanceof ApiError ? e.message : 'Failed to delete') }
  }

  async function generateNow(id: string) {
    setGenerating(id); setError('')
    try {
      const result = await api<{ message: string; filename: string; records: number; signed_url: string | null }>(`/admin/scheduled-reports?id=${id}&action=generate`, { method: 'POST', auth: true })
      setNotice(`Generated: ${result.filename} (${result.records} records)`)
      if (result.signed_url) { window.open(result.signed_url, '_blank') }
      await load()
    } catch (e) { setError(e instanceof ApiError ? e.message : 'Failed to generate') }
    finally { setGenerating(null) }
  }

  async function downloadFile(filename: string) {
    try {
      const { data: blob, error } = await supabase.storage.from('report-files').download(filename)
      if (!error && blob) {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
        URL.revokeObjectURL(url)
      }
    } catch {}
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next })
  }

  function toggleSelectAll() {
    if (selectedIds.size === history.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(history.map(h => h.id)))
  }

  async function bulkDownload() {
    if (selectedIds.size === 0) return
    setBulkDownloading(true); setError('')
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
      const response = await fetch(`${supabaseUrl}/functions/v1/admin-scheduled-reports?action=bulk-download`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token ?? ''}`,
        },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      })
      if (!response.ok) throw new Error('Download failed')
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = `luma-reports-${new Date().toISOString().split('T')[0]}.zip`; a.click()
      URL.revokeObjectURL(url)
      setNotice(`Downloaded ${selectedIds.size} report(s) as ZIP`)
      setSelectedIds(new Set())
    } catch (e) { setError(e instanceof Error ? e.message : 'Bulk download failed') }
    finally { setBulkDownloading(false) }
  }

  async function cleanupSelected() {
    if (selectedIds.size === 0) return
    try {
      await api('/admin/scheduled-reports?action=cleanup', { method: 'POST', auth: true, body: { ids: Array.from(selectedIds) } })
      setNotice(`Deleted ${selectedIds.size} report(s)`)
      setSelectedIds(new Set()); setShowCleanup(false)
      await loadHistory(historyPage)
    } catch (e) { setError(e instanceof ApiError ? e.message : 'Failed to cleanup') }
  }

  return (
    <div className="py-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Scheduled Reports</h1>
          <p className="mt-1 text-sm text-gray-500">Automate recurring report generation and delivery.</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="inline-flex items-center gap-2 rounded-xl bg-luma-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-luma-800 transition-colors">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
          New Schedule
        </button>
      </div>

      {error && <div className="mt-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}
      {notice && <div className="mt-4 rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">{notice}</div>}

      {/* Tabs */}
      <div className="mt-6 flex gap-1 rounded-lg border border-gray-200 bg-white p-1 w-fit">
        <button onClick={() => setActiveTab('schedules')} className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${activeTab === 'schedules' ? 'bg-luma-100 text-luma-700' : 'text-gray-500 hover:bg-gray-50'}`}>Schedules</button>
        <button onClick={() => setActiveTab('history')} className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${activeTab === 'history' ? 'bg-luma-100 text-luma-700' : 'text-gray-500 hover:bg-gray-50'}`}>
          History {historyTotal > 0 && <span className="ml-1.5 rounded-full bg-gray-100 px-1.5 py-0.5 text-xs">{historyTotal}</span>}
        </button>
      </div>

      {/* Schedules Tab */}
      {activeTab === 'schedules' && (
        <div className="mt-6 space-y-4">
          {loading ? <div className="py-12 text-center text-gray-500">Loading…</div>
            : schedules.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-300 bg-white py-16 text-center">
                <p className="mt-3 text-sm text-gray-500">No scheduled reports yet.</p>
                <button onClick={() => setShowCreate(true)} className="mt-3 text-sm font-medium text-luma-700 hover:text-luma-800">Create your first schedule →</button>
              </div>
            ) : schedules.map((s) => (
              <div key={s.id} className="rounded-2xl border border-gray-200 bg-white p-5 transition-all hover:shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-gray-900 truncate">{s.name}</h3>
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${frequencyColor(s.frequency)}`}>{s.frequency}</span>
                      {!s.enabled && <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-500">Disabled</span>}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-gray-500">
                      <span>{reportTypes.find(r => r.value === s.report_type)?.label ?? s.report_type}</span>
                      {s.last_generated_at && <span>Last: {new Date(s.last_generated_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>}
                      {s.next_run_at && s.enabled && <span>Next: {new Date(s.next_run_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>}
                      {s.recipients.length > 0 && <span>{s.recipients.length} recipient{s.recipients.length !== 1 ? 's' : ''}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => generateNow(s.id)} disabled={generating === s.id} className="inline-flex items-center gap-1.5 rounded-lg bg-luma-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-luma-800 disabled:opacity-50 transition-colors">
                      {generating === s.id ? <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg> : '⚡'} Generate
                    </button>
                    <button onClick={() => toggleEnabled(s.id, s.enabled)} className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${s.enabled ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>{s.enabled ? 'Enabled' : 'Disabled'}</button>
                    <button onClick={() => deleteSchedule(s.id, s.name)} className="rounded-lg px-2 py-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors" title="Delete">🗑</button>
                  </div>
                </div>
              </div>
            ))}
        </div>
      )}

      {/* History Tab */}
      {activeTab === 'history' && (
        <div className="mt-6">
          {/* Search & Filters */}
          <div className="rounded-2xl border border-gray-200 bg-white p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                <input value={historySearch} onChange={e => setHistorySearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && loadHistory(1)} placeholder="Search report name or filename..." className="w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 py-2 text-sm outline-none focus:border-luma-500" />
              </div>
              <select value={historyType} onChange={e => { setHistoryType(e.target.value); setHistoryPage(1) }} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-luma-500">
                <option value="">All Types</option>
                {reportTypes.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
              <select value={historyStatus} onChange={e => { setHistoryStatus(e.target.value); setHistoryPage(1) }} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-luma-500">
                <option value="">All Status</option>
                <option value="success">Success</option>
                <option value="error">Error</option>
              </select>
              <input type="date" value={historyDateFrom} onChange={e => { setHistoryDateFrom(e.target.value); setHistoryPage(1) }} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-luma-500" />
              <input type="date" value={historyDateTo} onChange={e => { setHistoryDateTo(e.target.value); setHistoryPage(1) }} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-luma-500" />
              <button onClick={() => loadHistory(1)} className="rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 transition-colors">Search</button>
            </div>

            {/* Bulk Actions */}
            {selectedIds.size > 0 && (
              <div className="mt-3 flex items-center gap-3 rounded-lg bg-luma-50 px-4 py-2">
                <span className="text-sm font-medium text-luma-700">{selectedIds.size} selected</span>
                <button onClick={bulkDownload} disabled={bulkDownloading} className="inline-flex items-center gap-1 rounded-md bg-luma-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-luma-800 disabled:opacity-50 transition-colors">
                  {bulkDownloading ? 'Downloading…' : '📦 Download ZIP'}
                </button>
                <button onClick={() => setShowCleanup(true)} className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors">🗑 Delete</button>
                <button onClick={() => setSelectedIds(new Set())} className="text-xs text-gray-500 hover:text-gray-700">Clear</button>
              </div>
            )}
          </div>

          {/* History Table */}
          <div className="mt-4 overflow-hidden rounded-2xl border border-gray-200 bg-white">
            {historyLoading ? <div className="py-12 text-center text-gray-500">Loading…</div>
              : history.length === 0 ? (
                <div className="py-16 text-center">
                  <p className="text-sm text-gray-500">No report history found.</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="px-4 py-3"><input type="checkbox" checked={selectedIds.size === history.length && history.length > 0} onChange={toggleSelectAll} className="rounded border-gray-300" /></th>
                      <th className="px-4 py-3">Report</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Records</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Generated</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {history.map(h => (
                      <tr key={h.id} className={`hover:bg-gray-50 transition-colors ${selectedIds.has(h.id) ? 'bg-luma-50' : ''}`}>
                        <td className="px-4 py-3"><input type="checkbox" checked={selectedIds.has(h.id)} onChange={() => toggleSelect(h.id)} className="rounded border-gray-300" /></td>
                        <td className="px-4 py-3 font-medium text-gray-900">{h.schedule_name}</td>
                        <td className="px-4 py-3"><span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">{h.report_type}</span></td>
                        <td className="px-4 py-3 text-gray-600">{h.record_count.toLocaleString()}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${h.status === 'success' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{h.status}</span>
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{new Date(h.generated_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                        <td className="px-4 py-3 text-right">
                          <button onClick={() => downloadFile(h.filename)} className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors">📥 Excel</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

            {/* Pagination */}
            {historyPages > 1 && (
              <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3">
                <span className="text-xs text-gray-500">Page {historyPage} of {historyPages} ({historyTotal} total)</span>
                <div className="flex gap-1">
                  <button onClick={() => loadHistory(historyPage - 1)} disabled={historyPage <= 1} className="rounded-md px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-40 transition-colors">← Prev</button>
                  <button onClick={() => loadHistory(historyPage + 1)} disabled={historyPage >= historyPages} className="rounded-md px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-40 transition-colors">Next →</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Cleanup Confirmation Modal */}
      {showCleanup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
            <div className="px-6 py-5">
              <h3 className="text-lg font-bold text-gray-900">Delete Reports</h3>
              <p className="mt-2 text-sm text-gray-600">This will permanently delete {selectedIds.size} report file(s) and their history records. This cannot be undone.</p>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-6 py-4">
              <button onClick={() => setShowCleanup(false)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">Cancel</button>
              <button onClick={cleanupSelected} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 transition-colors">Delete {selectedIds.size} Report(s)</button>
            </div>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
            <div className="px-6 py-5">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-gray-900">New Scheduled Report</h3>
                <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-600">✕</button>
              </div>
              <div className="mt-5 space-y-4">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Report Name</label><input value={formName} onChange={e => setFormName(e.target.value)} placeholder="e.g. Monthly Contributions Report" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-luma-500" /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">Report Type</label><select value={formType} onChange={e => setFormType(e.target.value)} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-luma-500">{reportTypes.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}</select></div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">Frequency</label><select value={formFrequency} onChange={e => setFormFrequency(e.target.value)} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-luma-500">{frequencies.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}</select></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">Status Filter</label><select value={formStatus} onChange={e => setFormStatus(e.target.value)} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-luma-500"><option value="">All Statuses</option><option value="Pending">Pending</option><option value="Verified">Verified</option><option value="Failed">Failed</option><option value="active">Active</option><option value="cancelled">Cancelled</option></select></div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">Recipients</label><input value={formRecipients} onChange={e => setFormRecipients(e.target.value)} placeholder="email1@example.com, email2@example.com" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-luma-500" /></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">Date From</label><input type="date" value={formDateFrom} onChange={e => setFormDateFrom(e.target.value)} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-luma-500" /></div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">Date To</label><input type="date" value={formDateTo} onChange={e => setFormDateTo(e.target.value)} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-luma-500" /></div>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-6 py-4">
              <button onClick={() => setShowCreate(false)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">Cancel</button>
              <button onClick={createSchedule} disabled={!formName.trim()} className="rounded-lg bg-luma-700 px-4 py-2 text-sm font-semibold text-white hover:bg-luma-800 disabled:opacity-50 transition-colors">Create Schedule</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
