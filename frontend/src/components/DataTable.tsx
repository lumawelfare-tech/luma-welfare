import { useState, useMemo } from 'react'

export type Column<T> = {
  key: string
  header: string
  className?: string
  render?: (row: T) => React.ReactNode
  mobileLabel?: string
  hideOnMobile?: boolean
  sortable?: boolean
}

type DataTableProps<T> = {
  data: T[]
  columns: Column<T>[]
  keyExtractor: (row: T) => string
  pageSize?: number
  emptyMessage?: string
  emptyIcon?: string
  selectable?: boolean
  selectedIds?: Set<string>
  onSelectionChange?: (ids: Set<string>) => void
  getId?: (row: T) => string
  renderMobileCard?: (row: T) => React.ReactNode
}

export function DataTable<T extends Record<string, unknown>>({
  data,
  columns,
  keyExtractor,
  pageSize = 25,
  emptyMessage = 'No records found.',
  selectable = false,
  selectedIds = new Set(),
  onSelectionChange,
  getId,
  renderMobileCard,
}: DataTableProps<T>) {
  const [page, setPage] = useState(0)
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const totalPages = Math.ceil(data.length / pageSize)

  const sorted = useMemo(() => {
    if (!sortKey) return data
    return [...data].sort((a, b) => {
      const aVal = a[sortKey]
      const bVal = b[sortKey]
      if (aVal == null && bVal == null) return 0
      if (aVal == null) return 1
      if (bVal == null) return -1
      const cmp = String(aVal).localeCompare(String(bVal), undefined, { numeric: true })
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [data, sortKey, sortDir])

  const paged = useMemo(() => {
    const start = page * pageSize
    return sorted.slice(start, start + pageSize)
  }, [sorted, page, pageSize])

  const visibleCols = columns.filter((c) => !c.hideOnMobile)

  function toggleSort(key: string) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  function toggleAll() {
    if (!onSelectionChange || !getId) return
    const allIds = paged.map(getId)
    const allSelected = allIds.every((id) => selectedIds.has(id))
    if (allSelected) {
      const next = new Set(selectedIds)
      allIds.forEach((id) => next.delete(id))
      onSelectionChange(next)
    } else {
      const next = new Set(selectedIds)
      allIds.forEach((id) => next.add(id))
      onSelectionChange(next)
    }
  }

  function toggleRow(id: string) {
    if (!onSelectionChange) return
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onSelectionChange(next)
  }

  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
        <svg className="mx-auto h-10 w-10 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m6 4.125l2.25 2.25m0 0l2.25 2.25M12 13.875l2.25-2.25M12 13.875l-2.25 2.25M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
        </svg>
        <p className="mt-3 text-sm text-gray-500">{emptyMessage}</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      {/* Desktop Table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              {selectable && (
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={paged.every((r) => getId && selectedIds.has(getId(r)))}
                    onChange={toggleAll}
                    className="h-4 w-4 rounded border-gray-300 text-luma-600 focus:ring-luma-500"
                    aria-label="Select all"
                  />
                </th>
              )}
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-4 py-3 ${col.className ?? ''} ${col.sortable ? 'cursor-pointer select-none hover:text-gray-700' : ''}`}
                  onClick={() => col.sortable && toggleSort(col.key)}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.header}
                    {col.sortable && sortKey === col.key && (
                      <svg className={`h-3 w-3 ${sortDir === 'desc' ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
                      </svg>
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.map((row) => (
              <tr key={keyExtractor(row)} className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
                {selectable && (
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={getId ? selectedIds.has(getId(row)) : false}
                      onChange={() => getId && toggleRow(getId(row))}
                      className="h-4 w-4 rounded border-gray-300 text-luma-600 focus:ring-luma-500"
                      aria-label="Select row"
                    />
                  </td>
                )}
                {columns.map((col) => (
                  <td key={col.key} className={`px-4 py-3 ${col.className ?? ''}`}>
                    {col.render ? col.render(row) : String(row[col.key] ?? '—')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden divide-y divide-gray-100">
        {paged.map((row) => (
          <div key={keyExtractor(row)} className="p-4">
            {renderMobileCard ? (
              renderMobileCard(row)
            ) : (
              <div className="space-y-2">
                {visibleCols.slice(0, 3).map((col) => (
                  <div key={col.key}>
                    <span className="text-xs font-medium text-gray-400">{col.mobileLabel ?? col.header}</span>
                    <div className="mt-0.5 text-sm text-gray-900">
                      {col.render ? col.render(row) : String(row[col.key] ?? '—')}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3">
          <span className="text-xs text-gray-500">
            {data.length.toLocaleString()} records · Page {page + 1} of {totalPages}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors"
            >
              Previous
            </button>
            {Array.from({ length: Math.min(totalPages, 5) }).map((_, i) => {
              let pageNum: number
              if (totalPages <= 5) {
                pageNum = i
              } else if (page < 3) {
                pageNum = i
              } else if (page > totalPages - 4) {
                pageNum = totalPages - 5 + i
              } else {
                pageNum = page - 2 + i
              }
              return (
                <button
                  key={pageNum}
                  onClick={() => setPage(pageNum)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    page === pageNum ? 'bg-luma-100 text-luma-700' : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {pageNum + 1}
                </button>
              )
            })}
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
