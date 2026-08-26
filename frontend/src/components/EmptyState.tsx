type EmptyStateProps = {
  title?: string
  message: string
  icon?: string
  action?: { label: string; onClick: () => void }
}

export function EmptyState({ title, message, icon, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      {icon && (
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
          <svg className="h-8 w-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
          </svg>
        </div>
      )}
      {title && <h3 className="mt-4 text-base font-semibold text-gray-900">{title}</h3>}
      <p className="mt-2 max-w-sm text-sm text-gray-500">{message}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="mt-4 rounded-lg bg-luma-700 px-4 py-2 text-sm font-semibold text-white hover:bg-luma-800 transition-colors"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
