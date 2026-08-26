type BulkAction = {
  label: string
  icon?: string
  variant?: 'primary' | 'danger' | 'warning'
  onClick: () => void
  loading?: boolean
}

type BulkActionBarProps = {
  selectedCount: number
  onClear: () => void
  actions: BulkAction[]
}

const variantClasses = {
  primary: 'bg-luma-700 text-white hover:bg-luma-800',
  danger: 'bg-red-600 text-white hover:bg-red-700',
  warning: 'bg-amber-600 text-white hover:bg-amber-700',
}

export function BulkActionBar({ selectedCount, onClear, actions }: BulkActionBarProps) {
  if (selectedCount === 0) return null

  return (
    <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 animate-in slide-in-from-bottom duration-200">
      <div className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white px-5 py-3 shadow-2xl">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-luma-100 text-xs font-bold text-luma-700">
            {selectedCount}
          </div>
          <span className="text-sm font-medium text-gray-700">selected</span>
        </div>

        <div className="h-6 w-px bg-gray-200" />

        <div className="flex items-center gap-2">
          {actions.map((action) => (
            <button
              key={action.label}
              onClick={action.onClick}
              disabled={action.loading}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
                variantClasses[action.variant ?? 'primary']
              }`}
            >
              {action.loading && (
                <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
              {action.label}
            </button>
          ))}
        </div>

        <div className="h-6 w-px bg-gray-200" />

        <button
          onClick={onClear}
          className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          aria-label="Clear selection"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  )
}
