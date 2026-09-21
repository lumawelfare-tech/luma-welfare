import { motion, useReducedMotion } from 'framer-motion'
import { lumaDuration, lumaEase, lumaStagger } from '../lib/lumaMotion'

type AppBootLoaderProps = {
  /** Short contextual line under the wordmark */
  message?: string
}

/**
 * Full-screen branded loader for application bootstrap only
 * (auth/session hydration). Not for route-level Suspense.
 *
 * Continuous spinner/pulse is an intentional loading-state exception
 * to the “no looping motion” rule; durations still come from lumaMotion.
 */
export function AppBootLoader({
  message = 'Preparing your session…',
}: AppBootLoaderProps) {
  const reduceMotion = useReducedMotion()

  return (
    <div
      className="flex min-h-dvh w-full max-w-[100vw] flex-col items-center justify-center bg-[#F7F8F6] px-6"
      role="status"
      aria-busy="true"
      aria-live="polite"
      data-testid="app-boot-loader"
      data-reduced-motion={reduceMotion ? 'true' : 'false'}
    >
      <span className="sr-only">Loading Luma Welfare. {message}</span>

      <div className="relative flex h-28 w-28 items-center justify-center sm:h-32 sm:w-32">
        {reduceMotion ? (
          <div
            className="absolute inset-0 rounded-full border-[3px] border-luma-100 border-t-luma-600"
            aria-hidden="true"
          />
        ) : (
          <motion.div
            className="absolute inset-0 rounded-full border-[3px] border-luma-100 border-t-luma-600"
            animate={{ rotate: 360 }}
            transition={{ duration: lumaDuration.loader, ease: lumaEase.linear, repeat: Infinity }}
            aria-hidden="true"
          />
        )}

        <motion.div
          className="relative z-10 flex h-14 w-14 items-center justify-center rounded-2xl bg-luma-700 text-lg font-bold tracking-tight text-white shadow-sm shadow-luma-700/25 sm:h-16 sm:w-16 sm:text-xl"
          aria-hidden="true"
          animate={
            reduceMotion
              ? undefined
              : { scale: [1, 1.04, 1], opacity: [1, 0.92, 1] }
          }
          transition={
            reduceMotion
              ? undefined
              : { duration: lumaDuration.loaderPulse, ease: lumaEase.inOut, repeat: Infinity }
          }
        >
          LW
        </motion.div>
      </div>

      <p className="mt-8 text-center text-xl font-bold tracking-tight text-luma-900 sm:text-2xl">
        Luma Welfare
      </p>
      <p className="mt-1 text-center text-[10px] font-medium uppercase tracking-[0.18em] text-luma-600">
        Community Welfare
      </p>

      <div className="mt-6 flex items-center gap-1.5" aria-hidden="true">
        {reduceMotion ? (
          <div className="h-1.5 w-8 rounded-full bg-luma-300" />
        ) : (
          [0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="h-1.5 w-1.5 rounded-full bg-luma-600"
              animate={{ opacity: [0.25, 1, 0.25], y: [0, -2, 0] }}
              transition={{
                duration: lumaDuration.loaderDot,
                ease: lumaEase.inOut,
                repeat: Infinity,
                delay: i * lumaStagger.menu,
              }}
            />
          ))
        )}
      </div>

      <p className="mt-4 max-w-xs text-center text-sm text-gray-500">{message}</p>
    </div>
  )
}
