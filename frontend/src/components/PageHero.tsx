import { type ReactNode } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { lumaDuration, lumaHero, lumaStagger, lumaTransition } from '../lib/lumaMotion'

type PageHeroProps = {
  eyebrow: string
  title: string
  description?: ReactNode
  meta?: ReactNode
}

/** Shared green page hero for public marketing/legal pages. */
export function PageHero({ eyebrow, title, description, meta }: PageHeroProps) {
  const reduceMotion = useReducedMotion()
  const t = (delay: number) =>
    lumaTransition(lumaDuration.hero, Boolean(reduceMotion), {
      delay: reduceMotion ? 0 : delay,
    })

  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-luma-800 to-luma-900 py-16 lg:py-20">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(255,255,255,0.08),_transparent_50%)]" />
      <div className="container-luma relative">
        <motion.span
          className="block text-sm font-semibold uppercase tracking-wider text-luma-200"
          initial={reduceMotion ? false : lumaHero.initial}
          animate={lumaHero.animate}
          transition={t(0)}
        >
          {eyebrow}
        </motion.span>
        <motion.h1
          className="mt-2 text-4xl font-bold text-white sm:text-5xl"
          initial={reduceMotion ? false : lumaHero.initial}
          animate={lumaHero.animate}
          transition={t(lumaStagger.step)}
        >
          {title}
        </motion.h1>
        {description && (
          <motion.p
            className="mt-4 max-w-2xl text-lg text-white/85"
            initial={reduceMotion ? false : lumaHero.initial}
            animate={lumaHero.animate}
            transition={t(lumaStagger.step * 2)}
          >
            {description}
          </motion.p>
        )}
        <motion.div
          className="mt-3 h-1 w-12 rounded-full bg-luma-400"
          initial={reduceMotion ? false : { opacity: 0, scaleX: 0.4 }}
          animate={{ opacity: 1, scaleX: 1 }}
          transition={t(lumaStagger.step * 3)}
          style={{ transformOrigin: 'left' }}
        />
        {meta && (
          <motion.div
            className="mt-4 text-sm text-white/80"
            initial={reduceMotion ? false : lumaHero.initial}
            animate={lumaHero.animate}
            transition={t(lumaStagger.step * 4)}
          >
            {meta}
          </motion.div>
        )}
      </div>
    </section>
  )
}

/** Glass panel wrapping auth forms (login / register / password). */
export function AuthCard({ children }: { children: ReactNode }) {
  const reduceMotion = useReducedMotion()

  return (
    <div className="flex min-h-[60vh] items-center justify-center py-16">
      <motion.div
        className="w-full max-w-md px-4"
        initial={reduceMotion ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={lumaTransition(lumaDuration.section, Boolean(reduceMotion))}
      >
        <div className="glass-modal p-8">{children}</div>
      </motion.div>
    </div>
  )
}

/** @deprecated Prefer `import { fieldClass } from './ui'` — kept for existing auth/forms. */
export { fieldClass } from './ui/Input'

export const alertErrorClass =
  'rounded-xl border border-red-200/80 bg-red-50/90 px-4 py-3 text-sm text-red-800'

export const alertSuccessClass =
  'rounded-xl border border-green-200/80 bg-green-50/90 px-4 py-3 text-sm text-green-800'

export const alertWarnClass =
  'rounded-xl border border-amber-200/80 bg-amber-50/90 px-4 py-3 text-sm text-amber-900'
