import { useEffect, useRef, useState, useCallback } from 'react'
import { api } from '../lib/api'
import { useToast } from './Toast'

type ExportType = 'members' | 'subscriptions' | 'contributions' | 'claims' | 'registration_fees'

type ExportDialogProps = {
  open: boolean
  onClose: () => void
  exportType: ExportType
  filters?: Record<string, string | undefined>
  filterLabels?: Record<string, string>
}

type ExportJob = {
  id: string
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'expired'
  processed_rows?: number | null
  total_rows?: number | null
  file_name?: string | null
  row_count?: number | null
  error_message?: string | null
}

type FormatOption = {
  id: string
  label: string
  icon: string
  available: boolean
}

const EXPORT_TYPE_LABELS: Record<ExportType, string> = {
  members: 'Members',
  subscriptions: 'Subscriptions',
  contributions: 'Contributions',
  claims: 'Claims',
  registration_fees: 'Registration Fees',
}

const FORMAT_OPTIONS: FormatOption[] = [
  { id: 'csv', label: 'CSV', icon: 'M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z', available: true },
  { id: 'xlsx', label: 'Excel', icon: 'M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z', available: false },
  { id: 'pdf', label: 'PDF', icon: 'M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z', available: false },
]

type DialogPhase = 'initial' | 'submitted' | 'processing' | 'completed' | 'failed'

export function ExportDialog({
  open,
  onClose,
  exportType,
  filters = {},
  filterLabels = {},
}: ExportDialogProps) {
  const { addToast } = useToast()
  const [format, setFormat] = useState('csv')
  const [job, setJob] = useState<ExportJob | null>(null)
  const [loading, setLoading] = useState(false)
  const [phase, setPhase] = useState<DialogPhase>('initial')
  const cancelRef = useRef<HTMLButtonElement>(null)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const activeFilters = Object.entries(filters).filter(
    ([, v]) => v !== undefined && v !== '',
  )

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }
  }, [])

  const resetState = useCallback(() => {
    stopPolling()
    setJob(null)
    setLoading(false)
    setFormat('csv')
    setPhase('initial')
  }, [stopPolling])

  const pollJob = useCallback(
    (jobId: string) => {
      stopPolling()
      pollingRef.current = setInterval(async () => {
        try {
          const res = await api<ExportJob>(`/admin/exports?id=${jobId}`, { auth: true })
          setJob(res)

          if (res.status === 'completed') {
            stopPolling()
            setLoading(false)
            setPhase('completed')
            addToast('success', `Export complete — ${(res.row_count ?? res.processed_rows ?? 0).toLocaleString()} rows ready`)
          } else if (res.status === 'failed' || res.status === 'expired') {
            stopPolling()
            setLoading(false)
            setPhase('failed')
            addToast('error', res.error_message ?? 'Export failed')
          } else {
            setPhase('processing')
          }
        } catch {
          stopPolling()
          setLoading(false)
          setPhase('failed')
          addToast('error', 'Failed to check export status')
        }
      }, 3000)
    },
    [stopPolling, addToast],
  )

  useEffect(() => {
    return () => stopPolling()
  }, [stopPolling])

  useEffect(() => {
    if (!open) return
    setTimeout(() => cancelRef.current?.focus(), 50)
  }, [open])

  useEffect(() => {
    if (!open) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  // eslint-disable-next-line oxc/react/set-state-in-effect — stopPolling cleanup must run whenever dialog closes (backdrop/ESC/parent close)
  useEffect(() => {
    if (!open) {
      // eslint-disable-next-line oxc/react/set-state-in-effect — stopPolling cleanup must run when dialog closes
      resetState()
    }
  }, [open, resetState])

  if (!open) return null

  const handleSubmit = async () => {
    setLoading(true)
    setJob(null)

    const params = new URLSearchParams({ type: exportType, format })
    for (const [key, value] of activeFilters) {
      if (value) params.set(key, value)
    }

    try {
      const res = await api<ExportJob>(`/admin/exports?${params.toString()}`, {
        auth: true,
      })
      setJob(res)
      setPhase('submitted')
      setLoading(false)
      pollJob(res.id)
    } catch (err: unknown) {
      setLoading(false)
      setPhase('failed')
      const message = err instanceof Error ? err.message : 'Failed to start export'
      addToast('error', message)
    }
  }

  const handleRetry = () => {
    setPhase('initial')
    setJob(null)
  }

  const handleDownload = async () => {
    if (!job) return
    try {
      const res = await api<{ signed_url: string }>(`/admin/exports?action=download&id=${job.id}`, { auth: true })
      if (res.signed_url) window.open(res.signed_url, '_blank')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to get download link'
      addToast('error', message)
    }
  }

  const progressPercent =
    job?.total_rows && job.total_rows > 0 && job.processed_rows != null
      ? Math.round((job.processed_rows / job.total_rows) * 100)
      : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="export-title">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-luma-100">
              <svg className="h-5 w-5 text-luma-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 id="export-title" className="text-lg font-semibold text-gray-900">
                Export {EXPORT_TYPE_LABELS[exportType]}
              </h3>
              {phase === 'initial' && (
                <p className="mt-1 text-sm text-gray-500">Select a format and export your data</p>
              )}
              {phase === 'submitted' && (
                <p className="mt-1 text-sm text-gray-500">Your export has been queued</p>
              )}
              {(phase === 'processing' || phase === 'completed' || phase === 'failed') && job && (
                <p className="mt-1 text-sm text-gray-500">
                  {phase === 'processing' && 'Generating your export…'}
                  {phase === 'completed' && 'Export finished'}
                  {phase === 'failed' && 'Something went wrong'}
                </p>
              )}
            </div>
          </div>

          {/* Format Selection — only show in initial phase */}
          {phase === 'initial' && (
            <>
              <div className="mt-5">
                <label className="block text-sm font-medium text-gray-700 mb-2">Format</label>
                <div className="flex gap-3">
                  {FORMAT_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      disabled={!opt.available}
                      onClick={() => setFormat(opt.id)}
                      className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
                        format === opt.id
                          ? 'border-luma-500 bg-luma-50 text-luma-700 ring-1 ring-luma-500'
                          : opt.available
                          ? 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                          : 'border-gray-100 bg-gray-50 text-gray-400 cursor-not-allowed'
                      }`}
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d={opt.icon} />
                      </svg>
                      {opt.label}
                      {!opt.available && (
                        <span className="ml-1 rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">Soon</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {activeFilters.length > 0 && (
                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Active Filters</label>
                  <div className="flex flex-wrap gap-2">
                    {activeFilters.map(([key, value]) => (
                      <span
                        key={key}
                        className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600"
                      >
                        <span className="text-gray-500">{filterLabels[key] ?? key}:</span>
                        <span className="font-semibold">{value}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Submitted — export started message */}
          {phase === 'submitted' && (
            <div className="mt-5 rounded-lg border border-luma-200 bg-luma-50 px-4 py-3">
              <div className="flex items-start gap-3">
                <svg className="mt-0.5 h-5 w-5 flex-shrink-0 text-luma-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <p className="text-sm font-medium text-luma-800">
                    Export started. You can continue using Luma Welfare. The export will appear in Report History when ready.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Processing — spinner with progress */}
          {phase === 'processing' && (
            <div className="mt-5 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
              <div className="flex items-center gap-3">
                <svg className="h-5 w-5 animate-spin text-luma-600" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-700">
                    {job?.status === 'queued' ? 'Queued…' : 'Processing…'}
                  </p>
                  {progressPercent !== null && (
                    <div className="mt-2">
                      <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                        <span>{job?.processed_rows?.toLocaleString()} / {job?.total_rows?.toLocaleString()} rows</span>
                        <span>{progressPercent}%</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
                        <div
                          className="h-full rounded-full bg-luma-600 transition-all duration-300"
                          style={{ width: `${progressPercent}%` }}
                        />
                      </div>
                    </div>
                  )}
                  {!progressPercent && job?.processed_rows != null && (
                    <p className="mt-0.5 text-xs text-gray-500">
                      {job.processed_rows.toLocaleString()} rows processed
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Completed — download button */}
          {phase === 'completed' && job && (
            <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <svg className="h-4 w-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div>
                    <p className="text-sm font-medium text-emerald-700">Export ready</p>
                    {(job.row_count ?? job.processed_rows) != null && (
                      <p className="text-xs text-emerald-600">
                        {(job.row_count ?? job.processed_rows ?? 0).toLocaleString()} rows
                      </p>
                    )}
                  </div>
                </div>
                <button
                  onClick={handleDownload}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download
                </button>
              </div>
              <a
                href="/reports/history"
                onClick={onClose}
                className="mt-3 block text-center text-xs font-medium text-emerald-700 underline hover:text-emerald-900 transition-colors"
              >
                View in Report History
              </a>
            </div>
          )}

          {/* Failed — error with retry */}
          {phase === 'failed' && (
            <div className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
              <div className="flex items-center gap-2">
                <svg className="h-4 w-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
                <p className="text-sm font-medium text-red-700">
                  {job?.error_message ?? 'Export failed'}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-6 py-4">
          {phase === 'initial' && (
            <>
              <button
                ref={cancelRef}
                onClick={onClose}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="rounded-lg bg-luma-700 px-4 py-2 text-sm font-semibold text-white hover:bg-luma-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'Starting…' : 'Export'}
              </button>
            </>
          )}

          {phase === 'submitted' && (
            <button
              ref={cancelRef}
              onClick={onClose}
              className="rounded-lg bg-luma-700 px-4 py-2 text-sm font-semibold text-white hover:bg-luma-800 transition-colors"
            >
              Continue
            </button>
          )}

          {phase === 'processing' && (
            <button
              ref={cancelRef}
              onClick={onClose}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Close
            </button>
          )}

          {phase === 'completed' && (
            <button
              ref={cancelRef}
              onClick={onClose}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Close
            </button>
          )}

          {phase === 'failed' && (
            <>
              <button
                ref={cancelRef}
                onClick={onClose}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Close
              </button>
              <button
                onClick={handleRetry}
                className="rounded-lg bg-luma-700 px-4 py-2 text-sm font-semibold text-white hover:bg-luma-800 transition-colors"
              >
                Retry
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
