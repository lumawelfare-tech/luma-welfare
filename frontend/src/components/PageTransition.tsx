import { type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useLocation } from 'react-router-dom'
import { lumaPage } from '../lib/lumaMotion'

type PageTransitionProps = {
  children: ReactNode
}

/**
 * Short fade + slight rise between public routes.
 * Uses Luma Motion System page tokens. Instant when prefers-reduced-motion.
 */
export function PageTransition({ children }: PageTransitionProps) {
  const location = useLocation()
  const reduceMotion = useReducedMotion()

  if (reduceMotion) {
    return <>{children}</>
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        initial={lumaPage.initial}
        animate={lumaPage.animate}
        exit={lumaPage.exit}
        transition={lumaPage.transition(false)}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}
