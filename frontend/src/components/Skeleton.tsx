export function SkeletonRow({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-gray-200 ${className}`} />
}

export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-3 p-4">
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
    <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonRow key={i} className={i === 0 ? 'h-5 w-2/3' : 'h-4 w-full'} />
      ))}
    </div>
  )
}

export function SkeletonStat() {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 space-y-2">
      <SkeletonRow className="h-8 w-16" />
      <SkeletonRow className="h-3 w-24" />
    </div>
  )
}
