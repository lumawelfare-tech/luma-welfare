import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

type Crumb = { label: string; to?: string }

type PageHeaderProps = {
  eyebrow?: string
  title: string
  description?: ReactNode
  actions?: ReactNode
  breadcrumbs?: Crumb[]
}

/** Consistent portal/page header for member + admin surfaces. */
export function PageHeader({ eyebrow, title, description, actions, breadcrumbs }: PageHeaderProps) {
  return (
    <header className="mb-6 sm:mb-8">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="mb-3">
          <ol className="flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
            {breadcrumbs.map((c, i) => (
              <li key={`${c.label}-${i}`} className="flex items-center gap-1.5">
                {i > 0 && <span aria-hidden="true">/</span>}
                {c.to ? (
                  <Link to={c.to} className="hover:text-luma-700">
                    {c.label}
                  </Link>
                ) : (
                  <span className="font-medium text-gray-700">{c.label}</span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          {eyebrow && (
            <p className="text-xs font-semibold uppercase tracking-wider text-luma-700">{eyebrow}</p>
          )}
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">{title}</h1>
          {description && (
            <div className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-600">{description}</div>
          )}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </header>
  )
}
