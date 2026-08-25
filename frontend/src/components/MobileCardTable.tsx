import { type ReactNode } from 'react'

type Column<T> = {
  key: string
  header: string
  render: (row: T) => ReactNode
  mobileLabel?: string
  hideOnMobile?: boolean
}

type MobileCardTableProps<T> = {
  data: T[]
  columns: Column<T>[]
  keyFn: (row: T) => string
  emptyMessage?: string
  onRowClick?: (row: T) => void
}

/**
 * A table that shows as a standard table on desktop and as cards on mobile.
 * Desktop: full table with all columns
 * Mobile: card layout with key info visible, hidden columns in a compact row
 */
export function MobileCardTable<T>({ data, columns, keyFn, emptyMessage = 'No data found.', onRowClick }: MobileCardTableProps<T>) {
  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
        <p className="text-sm text-gray-500">{emptyMessage}</p>
      </div>
    )
  }

  const visibleColumns = columns.filter(c => !c.hideOnMobile)
  const hiddenColumns = columns.filter(c => c.hideOnMobile)

  return (
    <>
      {/* Desktop table — hidden on mobile */}
      <div className="hidden md:block overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              {columns.map(col => (
                <th key={col.key} className="px-4 py-3">{col.header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr
                key={keyFn(row)}
                className={`border-b border-gray-100 last:border-0 transition-colors ${onRowClick ? 'cursor-pointer hover:bg-gray-50' : ''}`}
                onClick={() => onRowClick?.(row)}
              >
                {columns.map(col => (
                  <td key={col.key} className="px-4 py-3">{col.render(row)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards — hidden on desktop */}
      <div className="md:hidden space-y-3">
        {data.map((row) => (
          <div
            key={keyFn(row)}
            className={`rounded-xl border border-gray-200 bg-white p-4 transition-all ${onRowClick ? 'cursor-pointer hover:shadow-md active:bg-gray-50' : ''}`}
            onClick={() => onRowClick?.(row)}
          >
            {/* Primary row: first visible column */}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-gray-900 truncate">
                  {visibleColumns[0]?.render(row)}
                </div>
                {visibleColumns.slice(1).map(col => (
                  <div key={col.key} className="mt-1 flex items-center gap-2 text-xs text-gray-500">
                    {col.mobileLabel && <span className="text-gray-400">{col.mobileLabel}:</span>}
                    {col.render(row)}
                  </div>
                ))}
              </div>
              {/* Hidden columns as compact info */}
              {hiddenColumns.length > 0 && (
                <div className="flex flex-col items-end gap-1 text-xs text-gray-500">
                  {hiddenColumns.map(col => (
                    <div key={col.key}>{col.render(row)}</div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
