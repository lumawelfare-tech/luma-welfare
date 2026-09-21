import type { ActivityItem } from './ActivityTimeline.types'

export type { ActivityItem } from './ActivityTimeline.types'

function dayLabel(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  if (sameDay(d, today)) return 'Today'
  if (sameDay(d, yesterday)) return 'Yesterday'
  return d.toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-KE', { hour: 'numeric', minute: '2-digit' })
}

const DOT: Record<NonNullable<ActivityItem['tone']>, string> = {
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  error: 'bg-red-500',
  info: 'bg-luma-600',
  neutral: 'bg-gray-400',
}

type ActivityTimelineProps = {
  items: ActivityItem[]
  emptyMessage?: string
  className?: string
}

/**
 * Member-facing activity timeline. Feed only user-safe events (e.g. notifications),
 * never raw admin audit-log rows.
 */
export function ActivityTimeline({
  items,
  emptyMessage = 'No recent activity.',
  className = '',
}: ActivityTimelineProps) {
  if (items.length === 0) {
    return <p className={`text-sm text-gray-500 ${className}`}>{emptyMessage}</p>
  }

  const groups = new Map<string, ActivityItem[]>()
  for (const item of items) {
    const key = dayLabel(item.at)
    const list = groups.get(key) ?? []
    list.push(item)
    groups.set(key, list)
  }

  return (
    <div className={`space-y-6 ${className}`} role="list" aria-label="Activity">
      {[...groups.entries()].map(([day, dayItems]) => (
        <section key={day} aria-label={day}>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">{day}</h3>
          <ol className="mt-3 space-y-3">
            {dayItems.map((item) => {
              const tone = item.tone ?? 'neutral'
              return (
                <li key={item.id} className="flex gap-3" role="listitem">
                  <div className="flex flex-col items-center pt-1.5" aria-hidden="true">
                    <span className={`h-2.5 w-2.5 rounded-full ${DOT[tone]}`} />
                    <span className="mt-1 w-px flex-1 bg-gray-200" />
                  </div>
                  <div className="min-w-0 flex-1 pb-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-sm font-medium text-gray-900">{item.title}</p>
                      <time className="text-xs text-gray-400" dateTime={item.at}>
                        {timeLabel(item.at)}
                      </time>
                    </div>
                    {item.detail && <p className="mt-0.5 text-xs text-gray-500 line-clamp-2">{item.detail}</p>}
                  </div>
                </li>
              )
            })}
          </ol>
        </section>
      ))}
    </div>
  )
}

/** Helper for callers mapping notifications → timeline items. */
export function activityToneFromStatus(status: string): ActivityItem['tone'] {
  const s = status.toLowerCase()
  if (s.includes('fail') || s.includes('error') || s.includes('reject')) return 'error'
  if (s.includes('pending') || s.includes('queued') || s.includes('wait')) return 'warning'
  if (s.includes('sent') || s.includes('success') || s.includes('paid') || s.includes('approv')) return 'success'
  return 'info'
}
