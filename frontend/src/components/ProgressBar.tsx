type ProgressBarProps = {
  value: number
  max?: number
  label?: string
  /** Accessible name when label is visual-only elsewhere */
  'aria-label'?: string
  className?: string
}

/** Compact progress meter for contribution / waiting-period progress. */
export function ProgressBar({
  value,
  max = 100,
  label,
  'aria-label': ariaLabel,
  className = '',
}: ProgressBarProps) {
  const safeMax = max <= 0 ? 1 : max
  const pct = Math.max(0, Math.min(100, Math.round((value / safeMax) * 100)))

  return (
    <div className={className}>
      {(label || ariaLabel) && (
        <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
          {label ? <span className="font-medium text-gray-600">{label}</span> : <span />}
          <span className="tabular-nums text-gray-500">{pct}%</span>
        </div>
      )}
      <div
        className="h-2.5 w-full overflow-hidden rounded-full bg-luma-100"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={ariaLabel ?? label ?? 'Progress'}
      >
        <div
          className="h-full rounded-full bg-luma-600 transition-[width] duration-300 ease-out motion-reduce:transition-none"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
