import type { ReactNode } from 'react'

export type StatusTone = 'success' | 'warning' | 'error' | 'info' | 'neutral'

const TONE_CLASS: Record<StatusTone, string> = {
  success: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  warning: 'bg-amber-50 text-amber-800 border-amber-200',
  error: 'bg-red-50 text-red-800 border-red-200',
  info: 'bg-luma-50 text-luma-800 border-luma-200',
  neutral: 'bg-gray-50 text-gray-700 border-gray-200',
}

/** Map common domain statuses → semantic tone (display only; server remains source of truth). */
export function toneFromStatus(status: string): StatusTone {
  const s = status.toLowerCase()
  if (
    s.includes('eligible') ||
    s.includes('qualified') ||
    s.includes('approv') ||
    s.includes('paid') ||
    s.includes('success') ||
    s.includes('active') ||
    s.includes('received')
  ) {
    return 'success'
  }
  if (
    s.includes('pending') ||
    s.includes('review') ||
    s.includes('due') ||
    s.includes('at_risk') ||
    s.includes('at risk') ||
    s.includes('await')
  ) {
    return 'warning'
  }
  if (
    s.includes('reject') ||
    s.includes('fail') ||
    s.includes('overdue') ||
    s.includes('revok') ||
    s.includes('laps') ||
    s.includes('denied')
  ) {
    return 'error'
  }
  if (s.includes('draft') || s.includes('info') || s.includes('submitted')) {
    return 'info'
  }
  return 'neutral'
}

type StatusBadgeProps = {
  children: ReactNode
  tone?: StatusTone
  /** When set, tone is derived via toneFromStatus unless tone is also provided. */
  status?: string
  className?: string
}

/** Semantic status pill — never rely on color alone; always include text children. */
export function StatusBadge({ children, tone, status, className = '' }: StatusBadgeProps) {
  const resolved = tone ?? (status ? toneFromStatus(status) : 'neutral')
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${TONE_CLASS[resolved]} ${className}`}
    >
      {children}
    </span>
  )
}
