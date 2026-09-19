import { type ReactNode } from 'react'
import { MotionSection } from './MotionSection'

type PageHeroProps = {
  eyebrow: string
  title: string
  description?: ReactNode
  meta?: ReactNode
}

/** Shared green page hero for public marketing/legal pages. */
export function PageHero({ eyebrow, title, description, meta }: PageHeroProps) {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-luma-800 to-luma-900 py-16 lg:py-20">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(255,255,255,0.08),_transparent_50%)]" />
      <div className="container-luma relative">
        <span className="text-sm font-semibold uppercase tracking-wider text-luma-200">{eyebrow}</span>
        <h1 className="mt-2 text-4xl font-bold text-white sm:text-5xl">{title}</h1>
        {description && (
          <p className="mt-4 max-w-2xl text-lg text-white/85">{description}</p>
        )}
        <div className="mt-3 h-1 w-12 rounded-full bg-luma-400" />
        {meta && <div className="mt-4 text-sm text-white/60">{meta}</div>}
      </div>
    </section>
  )
}

/** Glass panel wrapping auth forms (login / register / password). */
export function AuthCard({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center py-16">
      <MotionSection as="div" className="w-full max-w-md px-4">
        <div className="glass-modal p-8">{children}</div>
      </MotionSection>
    </div>
  )
}

export const fieldClass =
  'glass-input w-full rounded-xl px-4 py-3 text-sm text-gray-800 placeholder:text-gray-500'

export const alertErrorClass =
  'rounded-xl border border-red-200/80 bg-red-50/90 px-4 py-3 text-sm text-red-800'

export const alertSuccessClass =
  'rounded-xl border border-green-200/80 bg-green-50/90 px-4 py-3 text-sm text-green-800'

export const alertWarnClass =
  'rounded-xl border border-amber-200/80 bg-amber-50/90 px-4 py-3 text-sm text-amber-900'
