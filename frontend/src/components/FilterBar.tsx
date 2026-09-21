import type { ReactNode } from 'react'

export type FilterOption = {
  value: string
  label: string
}

type FilterBarProps = {
  options: FilterOption[]
  value: string
  onChange: (value: string) => void
  /** Optional search control rendered after the chips */
  search?: ReactNode
  /** Optional extra controls (date range, package select, etc.) */
  extras?: ReactNode
  /** Opens FilterDrawer on small screens when provided */
  onOpenMobileFilters?: () => void
  mobileFilterLabel?: string
  className?: string
  'aria-label'?: string
}

/**
 * Desktop: inline chip toolbar + optional search/extras.
 * Mobile (when onOpenMobileFilters set): Filters button opens drawer; chips hidden.
 */
export function FilterBar({
  options,
  value,
  onChange,
  search,
  extras,
  onOpenMobileFilters,
  mobileFilterLabel = 'Filters',
  className = '',
  'aria-label': ariaLabel = 'Filters',
}: FilterBarProps) {
  const chips = (
    <div
      role="group"
      aria-label={ariaLabel}
      className={`max-w-full gap-1 overflow-x-auto rounded-lg border border-gray-200 bg-white p-1 ${
        onOpenMobileFilters ? 'hidden sm:flex' : 'flex'
      }`}
    >
      {options.map((opt) => {
        const active = value === opt.value
        return (
          <button
            key={opt.value || 'all'}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={active}
            className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-[var(--motion-fast)] min-h-[36px] ${
              active ? 'bg-luma-100 text-luma-800' : 'text-gray-500 hover:bg-gray-50'
            }`}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )

  return (
    <div className={`flex flex-wrap items-center gap-3 ${className}`}>
      {chips}

      {onOpenMobileFilters && (
        <button
          type="button"
          onClick={onOpenMobileFilters}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 min-h-[44px] sm:hidden"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" />
          </svg>
          {mobileFilterLabel}
          {value ? (
            <span className="rounded-full bg-luma-100 px-1.5 py-0.5 text-[10px] font-semibold text-luma-800">
              {options.find((o) => o.value === value)?.label ?? 'On'}
            </span>
          ) : null}
        </button>
      )}

      {extras && <div className="hidden sm:flex flex-wrap items-center gap-2">{extras}</div>}
      {search && <div className="relative min-w-[200px] flex-1">{search}</div>}
    </div>
  )
}
