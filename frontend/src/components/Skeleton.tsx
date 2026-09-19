export function SkeletonRow({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-luma-100/80 ${className}`} />
}

export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="glass-card space-y-3 p-4">
      <div className="flex gap-4">
        {Array.from({ length: cols }).map((_, ci) => (
          <SkeletonRow key={ci} className="h-4 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, ri) => (
        <div key={ri} className="flex gap-4">
          {Array.from({ length: cols }).map((_, ci) => (
            <SkeletonRow key={ci} className="h-8 flex-1" />
          ))}
        </div>
      ))}
    </div>
  )
}

export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className="glass-card rounded-xl p-4 space-y-3">
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonRow key={i} className={i === 0 ? 'h-5 w-2/3' : 'h-4 w-full'} />
      ))}
    </div>
  )
}

export function SkeletonStat() {
  return (
    <div className="glass-card rounded-2xl p-5 space-y-2">
      <SkeletonRow className="h-8 w-16" />
      <SkeletonRow className="h-3 w-24" />
    </div>
  )
}

/** Package grid placeholder used while packages load */
export function SkeletonPackageGrid({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="glass-card p-6 space-y-4">
          <div className="flex justify-between gap-4">
            <SkeletonRow className="h-6 w-1/2" />
            <SkeletonRow className="h-6 w-24 rounded-full" />
          </div>
          <SkeletonRow className="h-4 w-full" />
          <SkeletonRow className="h-4 w-5/6" />
          <SkeletonRow className="h-8 w-1/3" />
          <div className="flex flex-wrap gap-2 pt-2">
            <SkeletonRow className="h-6 w-16 rounded-md" />
            <SkeletonRow className="h-6 w-20 rounded-md" />
            <SkeletonRow className="h-6 w-14 rounded-md" />
          </div>
        </div>
      ))}
    </div>
  )
}
