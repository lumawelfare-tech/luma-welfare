import { type ReactNode } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { lumaHover, lumaPress, lumaReveal } from '../lib/lumaMotion'

type MotionSectionProps = {
  children: ReactNode
  className?: string
  /** Delay before animation starts (seconds) */
  delay?: number
  as?: 'section' | 'div'
}

/**
 * Fade + slide-up when scrolled into view.
 * Uses Luma Motion System reveal tokens. Honours prefers-reduced-motion.
 */
export function MotionSection({
  children,
  className = '',
  delay = 0,
  as = 'section',
}: MotionSectionProps) {
  const reduceMotion = useReducedMotion()
  const Component = as === 'div' ? motion.div : motion.section

  if (reduceMotion) {
    const Tag = as
    return <Tag className={className}>{children}</Tag>
  }

  return (
    <Component
      className={className}
      initial={lumaReveal.initial}
      whileInView={lumaReveal.whileInView}
      viewport={lumaReveal.viewport}
      transition={lumaReveal.transition(false, delay)}
    >
      {children}
    </Component>
  )
}

type MotionCardProps = {
  children: ReactNode
  className?: string
  /** Enable hover lift (desktop) */
  hover?: boolean
  onClick?: () => void
}

export function MotionCard({ children, className = '', hover = true, onClick }: MotionCardProps) {
  const reduceMotion = useReducedMotion()
  const enable = hover && !reduceMotion

  return (
    <motion.div
      className={className}
      onClick={onClick}
      whileHover={enable ? lumaHover.lift(false) : undefined}
      whileTap={enable ? lumaPress.soft(false) : undefined}
    >
      {children}
    </motion.div>
  )
}
