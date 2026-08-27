import { useEffect, useState, useCallback } from 'react'
import { useHead } from '../../lib/seo'
import { api, ApiError } from '../../lib/api'
import { supabase } from '../../lib/supabase'
import { ConfirmDialog } from '../../components/ConfirmDialog'

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

type RunEntry = { name: string; frequency: string; nextRun: Date | null }

function getRunMap(schedules: Schedule[], calMonth: number, calYear: number): Record<number, RunEntry[]> {
  const runMap: Record<number, RunEntry[]> = {}
  const endOfMonth = new Date(calYear, calMonth + 1, 0)
  for (const s of schedules) {
    if (!s.enabled || !s.next_run_at) continue
    const nr = new Date(s.next_run_at)
    if (nr.getMonth() === calMonth && nr.getFullYear() === calYear) {
      const day = nr.getDate()
      if (!runMap[day]) runMap[day] = []
      runMap[day].push({ name: s.name, frequency: s.frequency, nextRun: nr })
    }
    let projected = new Date(nr)
    for (let i = 0; i < 10; i++) {
      if (s.frequency === 'daily') projected.setDate(projected.getDate() + 1)
      else if (s.frequency === 'weekly') projected.setDate(projected.getDate() + 7)
      else if (s.frequency === 'monthly') projected.setMonth(projected.getMonth() + 1)
      else if (s.frequency === 'quarterly') projected.setMonth(projected.getMonth() + 3)
      if (projected.getMonth() === calMonth && projected.getFullYear() === calYear) {
        const day = projected.getDate()
        if (!runMap[day]) runMap[day] = []
        if (!runMap[day].find(r => r.name === s.name)) {
          runMap[day].push({ name: s.name, frequency: s.frequency, nextRun: projected })
        }
      }
      if (projected > endOfMonth) break
    }
  }
  return runMap
}

function getHistMap(liveHistory: { id: string; schedule_name: string; generated_at: string; status: string; record_count: number }[], schedules: Schedule[], calMonth: number, calYear: number): Record<number, { count: number; latest: string; status: string }[]> {
  const histMap: Record<number, { count: number; latest: string; status: string }[]> = {}
  for (const rec of liveHistory) {
    const d = new Date(rec.generated_at)
    if (d.getMonth() === calMonth && d.getFullYear() === calYear) {
      const day = d.getDate()
      if (!histMap[day]) histMap[day] = []
      histMap[day].push({ count: 1, latest: rec.schedule_name, status: rec.status })
    }
  }
  for (const s of schedules) {
    if (s.last_generated_at) {
      const lg = new Date(s.last_generated_at)
      if (lg.getMonth() === calMonth && lg.getFullYear() === calYear) {
        const day = lg.getDate()
        if (!histMap[day]) histMap[day] = []
        if (!histMap[day].find(h => h.latest === s.name)) {
          histMap[day].push({ count: 1, latest: s.name, status: 'success' })
        }
      }
    }
  }
  return histMap
}

function DayDetailPanel({ day, schedules, liveHistory, onClose }: {
  day: Date; schedules: Schedule[]
  liveHistory: { id: string; schedule_name: string; generated_at: string; status: string; record_count: number }[]
  onClose: () => void
}) {
  const dayStr = day.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
  const isToday = day.toDateString() === new Date().toDateString()

  // Find all scheduled runs that would fire on this day
  const scheduledRuns: { name: string; frequency: string; report_type: string; nextRun: Date | null; recipients: string[]; id: string; enabled: boolean }[] = []
  for (const s of schedules) {
    if (!s.enabled || !s.next_run_at) continue
    const nr = new Date(s.next_run_at)
    // Check if this schedule would run on this day
    const runDates = new Set<string>()
    runDates.add(nr.toDateString())
    // Project future runs
    let projected = new Date(nr)
    for (let i = 0; i < 365; i++) {
      if (s.frequency === 'daily') projected.setDate(projected.getDate() + 1)
      else if (s.frequency === 'weekly') projected.setDate(projected.getDate() + 7)
      else if (s.frequency === 'monthly') projected.setMonth(projected.getMonth() + 1)
      else if (s.frequency === 'quarterly') projected.setMonth(projected.getMonth() + 3)
      runDates.add(projected.toDateString())
      if (projected > day && i > 31) break
    }
    if (runDates.has(day.toDateString())) {
      scheduledRuns.push({ name: s.name, frequency: s.frequency, report_type: s.report_type, nextRun: nr, recipients: s.recipients, id: s.id, enabled: s.enabled })
    }
  }

  // Find generated reports for this day
  const generatedReports = liveHistory.filter(r => new Date(r.generated_at).toDateString() === day.toDateString())

  const totalEvents = scheduledRuns.length + generatedReports.length

  return (
    <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-6 animate-in slide-in-from-top-2 fade-in duration-200">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-luma-100 text-lg">📅</div>
          <div>
            <h3 className="text-base font-bold text-gray-900">{dayStr}</h3>
            <p className="text-xs text-gray-500">
              {isToday ? 'Today' : ''}
              {totalEvents > 0 ? ` · ${totalEvents} event${totalEvents !== 1 ? 's' : ''}` : ' · No events'}
            </p>
          </div>
        </div>
        <button onClick={onClose} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors" title="Close">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>

      {totalEvents === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-gray-200 bg-gray-50 py-10 text-center">
          <p className="text-sm text-gray-400">No scheduled runs or generated reports for this day.</p>
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          {/* Scheduled Runs */}
          {scheduledRuns.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="h-2.5 w-2.5 rounded-full bg-luma-500" />
                <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Scheduled Runs ({scheduledRuns.length})</h4>
              </div>
              <div className="space-y-2">
                {scheduledRuns.map((run, i) => {
                  // Check if it was actually generated
                  const wasGenerated = generatedReports.some(r => r.schedule_name === run.name)
                  const histRecord = generatedReports.find(r => r.schedule_name === run.name)
                  return (
                    <div key={i} className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${wasGenerated ? 'bg-emerald-100' : 'bg-luma-100'}`}>
                          {wasGenerated ? (
                            <svg className="h-4 w-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                          ) : (
                            <svg className="h-4 w-4 text-luma-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-gray-900">{run.name}</span>
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${frequencyColor(run.frequency)}`}>{run.frequency}</span>
                          </div>
                          <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-500">
                            <span>{reportTypes.find(r => r.value === run.report_type)?.label ?? run.report_type}</span>
                            {run.recipients.length > 0 && <span>· {run.recipients.length} recipient{run.recipients.length !== 1 ? 's' : ''}</span>}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        {wasGenerated && histRecord ? (
                          <div>
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${histRecord.status === 'success' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{histRecord.status}</span>
                            <p className="mt-0.5 text-[10px] text-gray-400">{histRecord.record_count.toLocaleString()} records</p>
                            <p className="text-[10px] text-gray-400">{new Date(histRecord.generated_at).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}</p>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">Pending</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Generated Reports (from other schedules not in scheduledRuns) */}
          {generatedReports.filter(r => !scheduledRuns.some(s => s.name === r.schedule_name)).length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Generated Reports</h4>
              </div>
              <div className="space-y-2">
                {generatedReports.filter(r => !scheduledRuns.some(s => s.name === r.schedule_name)).map((rec, i) => (
                  <div key={i} className="flex items-center justify-between rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100">
                        <svg className="h-4 w-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                      </div>
                      <div>
                        <span className="text-sm font-semibold text-gray-900">{rec.schedule_name}</span>
                        <div className="mt-0.5 text-xs text-gray-500">
                          {rec.record_count.toLocaleString()} records · {new Date(rec.generated_at).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${rec.status === 'success' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{rec.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function CalendarView({ schedules, calMonth, calYear, setCalMonth, setCalYear }: {
  schedules: Schedule[]; calMonth: number; calYear: number
  setCalMonth: (m: number) => void; setCalYear: (y: number) => void
}) {
  const today = new Date()
  const [calView, setCalView] = useState<'month' | 'week'>('month')
  const [selectedDay, setSelectedDay] = useState<Date | null>(null)
  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date(calYear, calMonth, today.getDate())
    d.setDate(d.getDate() - d.getDay())
    return d
  })

  // Sync weekStart when month/year changes
  useEffect(() => {
    if (calView === 'week') {
      const d = new Date(calYear, calMonth, 1)
      d.setDate(d.getDate() - d.getDay())
      setWeekStart(d)
    }
  }, [calMonth, calYear, calView])

  const firstDay = new Date(calYear, calMonth, 1).getDay()
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate()
  const monthName = new Date(calYear, calMonth).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  // Live history state
  const [liveHistory, setLiveHistory] = useState<{ id: string; schedule_name: string; generated_at: string; status: string; record_count: number }[]>([])
  const [generating, setGenerating] = useState<Set<string>>(new Set())

  // Fetch recent history for the visible range
  useEffect(() => {
    let from: string, to: string
    if (calView === 'month') {
      from = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-01`
      to = new Date(calYear, calMonth + 1, 0).toISOString().split('T')[0]
    } else {
      const ws = new Date(weekStart)
      const we = new Date(weekStart); we.setDate(we.getDate() + 6)
      from = ws.toISOString().split('T')[0]
      to = we.toISOString().split('T')[0]
    }
    api<{ history: typeof liveHistory }>(`/admin/scheduled-reports?action=history&date_from=${from}&date_to=${to}&per_page=100`, { auth: true })
      .then(d => setLiveHistory(d.history ?? []))
      .catch(() => {})
  }, [calMonth, calYear, calView, weekStart])

  // Supabase Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('report-history-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'report_history' }, (payload) => {
        const rec = payload.new as typeof liveHistory[0]
        setLiveHistory(prev => [rec, ...prev].slice(0, 100))
        setGenerating(prev => { const next = new Set(prev); next.delete(rec.schedule_name); return next })
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  function prevMonth() {
    if (calMonth === 0) { setCalMonth(11); setCalYear(calYear - 1) }
    else setCalMonth(calMonth - 1)
  }
  function nextMonth() {
    if (calMonth === 11) { setCalMonth(0); setCalYear(calYear + 1) }
    else setCalMonth(calMonth + 1)
  }
  function prevWeek() {
    const d = new Date(weekStart); d.setDate(d.getDate() - 7)
    setWeekStart(d)
    if (d.getMonth() !== calMonth || d.getFullYear() !== calYear) {
      setCalMonth(d.getMonth()); setCalYear(d.getFullYear())
    }
  }
  function nextWeek() {
    const d = new Date(weekStart); d.setDate(d.getDate() + 7)
    setWeekStart(d)
    if (d.getMonth() !== calMonth || d.getFullYear() !== calYear) {
      setCalMonth(d.getMonth()); setCalYear(d.getFullYear())
    }
  }
  function goToToday() {
    const now = new Date()
    setCalMonth(now.getMonth()); setCalYear(now.getFullYear())
    const d = new Date(now); d.setDate(d.getDate() - d.getDay())
    setWeekStart(d)
  }

  const weekDayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  // Month view data
  const runMap = getRunMap(schedules, calMonth, calYear)
  const histMap = getHistMap(liveHistory, schedules, calMonth, calYear)
  const monthDays = []
  for (let i = 0; i < firstDay; i++) monthDays.push(null)
  for (let d = 1; d <= daysInMonth; d++) monthDays.push(d)

  // Week view data
  const weekDays: Date[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart); d.setDate(d.getDate() + i)
    weekDays.push(d)
  }
  const weekRangeLabel = `${weekDays[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${weekDays[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`

  // Build week run map
  const weekRunMap: Record<number, RunEntry[]> = {}
  const weekHistMap: Record<number, { count: number; latest: string; status: string }[]> = {}
  for (const s of schedules) {
    if (!s.enabled || !s.next_run_at) continue
    const nr = new Date(s.next_run_at)
    for (let i = 0; i < 7; i++) {
      const wd = new Date(weekStart); wd.setDate(wd.getDate() + i)
      if (nr.toDateString() === wd.toDateString()) {
        const dayIdx = i
        if (!weekRunMap[dayIdx]) weekRunMap[dayIdx] = []
        weekRunMap[dayIdx].push({ name: s.name, frequency: s.frequency, nextRun: nr })
      }
    }
  }
  for (const rec of liveHistory) {
    const d = new Date(rec.generated_at)
    for (let i = 0; i < 7; i++) {
      const wd = new Date(weekStart); wd.setDate(wd.getDate() + i)
      if (d.toDateString() === wd.toDateString()) {
        if (!weekHistMap[i]) weekHistMap[i] = []
        weekHistMap[i].push({ count: 1, latest: rec.schedule_name, status: rec.status })
      }
    }
  }
  for (const s of schedules) {
    if (s.last_generated_at) {
      const lg = new Date(s.last_generated_at)
      for (let i = 0; i < 7; i++) {
        const wd = new Date(weekStart); wd.setDate(wd.getDate() + i)
        if (lg.toDateString() === wd.toDateString()) {
          if (!weekHistMap[i]) weekHistMap[i] = []
          if (!weekHistMap[i].find(h => h.latest === s.name)) {
            weekHistMap[i].push({ count: 1, latest: s.name, status: 'success' })
          }
        }
      }
    }
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6">
      {/* Header with toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={calView === 'month' ? prevMonth : prevWeek} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">← Prev</button>
          <button onClick={goToToday} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-luma-700 hover:bg-luma-50 transition-colors">Today</button>
        </div>
        <h2 className="text-lg font-bold text-gray-900">{calView === 'month' ? monthName : weekRangeLabel}</h2>
        <div className="flex items-center gap-2">
          <button onClick={calView === 'month' ? nextMonth : nextWeek} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">Next →</button>
        </div>
      </div>

      {/* View toggle */}
      <div className="mt-4 flex items-center justify-between">
        <div className="flex gap-1 rounded-lg border border-gray-200 bg-gray-50 p-0.5">
          <button onClick={() => setCalView('month')} className={`rounded-md px-4 py-1.5 text-xs font-medium transition-colors ${calView === 'month' ? 'bg-white text-luma-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>📅 Month</button>
          <button onClick={() => setCalView('week')} className={`rounded-md px-4 py-1.5 text-xs font-medium transition-colors ${calView === 'week' ? 'bg-white text-luma-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>📋 Week</button>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-luma-500" /> Scheduled</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Generated</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-blue-500" /> Today</span>
        </div>
      </div>

      {/* Month View */}
      {calView === 'month' && (
        <div className="mt-4 grid grid-cols-7 gap-px rounded-lg border border-gray-200 bg-gray-200">
          {weekDayNames.map(d => (
            <div key={d} className="bg-gray-50 px-2 py-2 text-center text-xs font-semibold text-gray-500 uppercase">{d}</div>
          ))}
          {monthDays.map((day, i) => {
            if (day === null) return <div key={`empty-${i}`} className="bg-white min-h-[80px]" />
            const isToday = day === today.getDate() && calMonth === today.getMonth() && calYear === today.getFullYear()
            const runs = runMap[day] ?? []
            const histEntries = histMap[day] ?? []
            const isGenerating = generating.size > 0 && isToday && day === today.getDate()
            return (
            <div key={day} onClick={() => setSelectedDay(new Date(calYear, calMonth, day))} className={`bg-white min-h-[80px] p-1.5 cursor-pointer transition-colors ${isToday ? 'ring-2 ring-inset ring-blue-400' : ''} hover:bg-gray-50`}>
              <div className="flex items-center justify-between">
                <div className={`text-xs font-medium ${isToday ? 'text-blue-600' : 'text-gray-700'}`}>{day}</div>
                {isGenerating && <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" title="Generating..." />}
              </div>
                <div className="mt-1 space-y-0.5">
                  {histEntries.slice(0, 2).map((h, j) => (
                    <div key={`h-${j}`} className="flex items-center gap-1">
                      <span className={`h-1.5 w-1.5 rounded-full ${h.status === 'success' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                      <span className={`text-[10px] truncate ${h.status === 'success' ? 'text-emerald-600' : 'text-red-500'}`} title={h.latest}>{h.latest}</span>
                    </div>
                  ))}
                  {runs.slice(0, 2).map((r, j) => (
                    <div key={`r-${j}`} className="flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-luma-500" />
                      <span className="text-[10px] text-gray-600 truncate" title={r.name}>{r.name}</span>
                    </div>
                  ))}
                  {(histEntries.length + runs.length) > 4 && <span className="text-[10px] text-gray-400">+{(histEntries.length + runs.length) - 4} more</span>}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Week View */}
      {calView === 'week' && (
        <div className="mt-4 rounded-lg border border-gray-200 overflow-hidden">
          {/* Week header */}
          <div className="grid grid-cols-[100px_repeat(7,1fr)] border-b border-gray-200">
            <div className="bg-gray-50 px-2 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Time</div>
            {weekDays.map((d, i) => {
              const isToday = d.toDateString() === today.toDateString()
              return (
                <div key={i} onClick={() => setSelectedDay(new Date(d))} className={`px-2 py-3 text-center cursor-pointer transition-colors ${isToday ? 'bg-blue-50' : 'bg-gray-50'} hover:bg-gray-100`}>
                  <div className="text-xs font-semibold text-gray-500 uppercase">{weekDayNames[d.getDay()]}</div>
                  <div className={`mt-0.5 text-lg font-bold ${isToday ? 'text-blue-600' : 'text-gray-900'}`}>{d.getDate()}</div>
                </div>
              )
            })}
          </div>

          {/* Week body: hourly slots from 6 AM to 8 PM */}
          {Array.from({ length: 15 }, (_, hourIdx) => {
            const hour = 6 + hourIdx
            const label = hour < 12 ? `${hour}:00 AM` : hour === 12 ? '12:00 PM' : `${hour - 12}:00 PM`
            return (
              <div key={hour} className="grid grid-cols-[100px_repeat(7,1fr)] border-b border-gray-100 last:border-b-0">
                <div className="bg-gray-50 px-2 py-4 text-right text-[11px] font-medium text-gray-400 border-r border-gray-200">
                  {label}
                </div>
                {weekDays.map((d, dayIdx) => {
                  const isToday = d.toDateString() === today.toDateString()
                  // Show scheduled runs in the 6 AM slot and generated reports in their respective hour
                  const isSixAM = hour === 6
                  const runs = isSixAM ? (weekRunMap[dayIdx] ?? []) : []
                  const histEntries = (weekHistMap[dayIdx] ?? []).filter(() => isSixAM)
                  const hasActivity = runs.length > 0 || histEntries.length > 0
                  return (
                    <div key={dayIdx} className={`relative px-1.5 py-2 min-h-[52px] ${isToday ? 'bg-blue-50/40' : ''} ${hasActivity ? '' : 'hover:bg-gray-50/50'} transition-colors`}>
                      {runs.map((r, j) => (
                        <div key={`r-${j}`} className="mb-1 flex items-center gap-1 rounded-md bg-luma-50 border border-luma-200 px-2 py-1">
                          <span className="h-1.5 w-1.5 rounded-full bg-luma-500 flex-shrink-0" />
                          <span className="text-[10px] font-medium text-luma-700 truncate" title={`${r.name} (${r.frequency})`}>{r.name}</span>
                          {r.nextRun && <span className="ml-auto text-[9px] text-luma-500 flex-shrink-0">{r.nextRun.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}</span>}
                        </div>
                      ))}
                      {histEntries.map((h, j) => (
                        <div key={`h-${j}`} className={`mb-1 flex items-center gap-1 rounded-md border px-2 py-1 ${h.status === 'success' ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                          <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${h.status === 'success' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                          <span className={`text-[10px] font-medium truncate ${h.status === 'success' ? 'text-emerald-700' : 'text-red-700'}`} title={h.latest}>{h.latest}</span>
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
            )
          })}

          {/* All-day / summary row at bottom */}
          <div className="grid grid-cols-[100px_repeat(7,1fr)] border-t-2 border-gray-200 bg-gray-50">
            <div className="px-2 py-3 text-right text-[11px] font-semibold text-gray-500 uppercase">Events</div>
            {weekDays.map((d, dayIdx) => {
              const totalRuns = (weekRunMap[dayIdx] ?? []).length
              const totalHist = (weekHistMap[dayIdx] ?? []).length
              const isToday = d.toDateString() === today.toDateString()
              return (
                <div key={dayIdx} className={`px-2 py-3 text-center ${isToday ? 'bg-blue-50' : ''}`}>
                  {(totalRuns + totalHist) === 0 ? (
                    <span className="text-[10px] text-gray-300">—</span>
                  ) : (
                    <div className="flex flex-col items-center gap-0.5">
                      {totalRuns > 0 && <span className="text-[10px] font-medium text-luma-600">{totalRuns} scheduled</span>}
                      {totalHist > 0 && <span className="text-[10px] font-medium text-emerald-600">{totalHist} generated</span>}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Day Detail Panel */}
      {selectedDay && (
        <DayDetailPanel day={selectedDay} schedules={schedules} liveHistory={liveHistory} onClose={() => setSelectedDay(null)} />
      )}

      {/* Upcoming runs list */}
      <div className="mt-6">
        <h3 className="text-sm font-bold text-gray-900">Upcoming Scheduled Runs</h3>
        <div className="mt-3 space-y-2">
          {schedules.filter(s => s.enabled && s.next_run_at).sort((a, b) => new Date(a.next_run_at!).getTime() - new Date(b.next_run_at!).getTime()).slice(0, 5).map(s => (
            <div key={s.id} className="flex items-center justify-between rounded-lg border border-gray-100 px-4 py-2.5">
              <div className="flex items-center gap-3">
                <div className={`rounded-full px-2 py-0.5 text-xs font-semibold ${frequencyColor(s.frequency)}`}>{s.frequency}</div>
                <span className="text-sm font-medium text-gray-900">{s.name}</span>
              </div>
              <span className="text-xs text-gray-500">
                {new Date(s.next_run_at!).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          ))}
          {schedules.filter(s => s.enabled && s.next_run_at).length === 0 && (
            <p className="text-sm text-gray-400">No upcoming scheduled runs.</p>
          )}
        </div>
      </div>
    </div>
  )
}

export function AdminScheduledReports() {
  useHead('Scheduled Reports', undefined, { noindex: true })

  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [generating, setGenerating] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'schedules' | 'history' | 'calendar'>('schedules')
  const [calMonth, setCalMonth] = useState(() => { const d = new Date(); return d.getMonth() })
  const [calYear, setCalYear] = useState(() => new Date().getFullYear())
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)

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
    setDeleteTarget({ id, name })
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    try { await api(`/admin/scheduled-reports?id=${deleteTarget.id}`, { method: 'DELETE', auth: true }); setNotice(`Deleted "${deleteTarget.name}".`); await load() }
    catch (e) { setError(e instanceof ApiError ? e.message : 'Failed to delete') }
    setDeleteTarget(null)
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
        <button onClick={() => setActiveTab('calendar')} className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${activeTab === 'calendar' ? 'bg-luma-100 text-luma-700' : 'text-gray-500 hover:bg-gray-50'}`}>📅 Calendar</button>
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

      {/* Calendar Tab */}
      {activeTab === 'calendar' && (
        <div className="mt-6">
          <CalendarView schedules={schedules} calMonth={calMonth} calYear={calYear} setCalMonth={setCalMonth} setCalYear={setCalYear} />
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

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete Scheduled Report"
        variant="danger"
        confirmLabel="Delete"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? This cannot be undone.`}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
