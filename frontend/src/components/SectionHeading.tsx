import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

type SectionHeadingProps = {
  eyebrow?: string
  title: string
  description?: ReactNode
  action?: { label: string; to: string }
  align?: 'left' | 'center'
}

/** Public marketing section title — one purpose per section. */
export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
  align = 'left',
}: SectionHeadingProps) {
  const centered = align === 'center'
  return (
    <div className={`mb-10 ${centered ? 'text-center' : 'flex items-end justify-between gap-4'}`}>
      <div className={centered ? 'mx-auto max-w-2xl' : undefined}>
        {eyebrow && (
          <span className="text-sm font-semibold uppercase tracking-wider text-luma-700">{eyebrow}</span>
        )}
        <h2 className="mt-2 text-3xl font-bold text-gray-900 sm:text-4xl">{title}</h2>
        <div className={`mt-3 h-1 w-12 rounded-full bg-luma-500 ${centered ? 'mx-auto' : ''}`} />
        {description && (
          <p className="mt-4 text-gray-600">{description}</p>
        )}
      </div>
      {action && !centered && (
        <Link
          to={action.to}
          className="hidden rounded-lg border border-luma-200/80 bg-white/50 px-5 py-2.5 text-sm font-semibold text-luma-800 transition-colors hover:bg-white/80 sm:block"
        >
          {action.label}
        </Link>
      )}
    </div>
  )
}
