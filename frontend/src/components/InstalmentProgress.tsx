import { progressPercent } from '../lib/instalments'

export function InstalmentProgress({
  required,
  paid,
  remaining,
}: {
  required: number
  paid: number
  remaining: number
}) {
  const pct = progressPercent(required, paid)
  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs text-gray-600">
        <span>Paid KSh {paid.toLocaleString('en-KE')} of {required.toLocaleString('en-KE')}</span>
        <span>Remaining KSh {remaining.toLocaleString('en-KE')}</span>
      </div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-gray-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-luma-600 transition-[width]" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
