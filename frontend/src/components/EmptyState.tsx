import { Button, Card } from './ui'

type EmptyStateProps = {
  title?: string
  message: string
  icon?: string
  action?: { label: string; onClick: () => void }
}

export function EmptyState({ title, message, icon, action }: EmptyStateProps) {
  return (
    <Card className="flex flex-col items-center justify-center px-4 py-12 text-center">
      {icon && (
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-luma-50/90 border border-white/60">
          <svg className="h-8 w-8 text-luma-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
          </svg>
        </div>
      )}
      {title && <h3 className="mt-4 text-base font-semibold text-gray-900">{title}</h3>}
      <p className="mt-2 max-w-sm text-sm text-gray-600">{message}</p>
      {action && (
        <Button type="button" variant="primary" size="sm" className="mt-4" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </Card>
  )
}
