import { type ReactNode } from 'react'
import { motion, useReducedMotion } from 'framer-motion'

type MotionSectionProps = {
  children: ReactNode
  className?: string
  /** Delay before animation starts (seconds) */
  delay?: number
  as?: 'section' | 'div'
}

/** Reveal duration aligned with --luma-motion-reveal (450ms). */
const REVEAL_DURATION = 0.45
const REVEAL_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]
/** Card hover aligned with --luma-motion-micro (~200ms). */
const CARD_HOVER_DURATION = 0.2

/**
 * Fade + slide-up when scrolled into view. Honours prefers-reduced-motion.
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
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-48px 0px' }}
      transition={{ duration: REVEAL_DURATION, ease: REVEAL_EASE, delay }}
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

  return (
    <motion.div
      className={className}
      onClick={onClick}
      whileHover={
        reduceMotion || !hover
          ? undefined
          : { y: -4, transition: { duration: CARD_HOVER_DURATION } }
      }
      whileTap={reduceMotion || !hover ? undefined : { scale: 0.985 }}
    >
      {children}
    </motion.div>
  )
}
