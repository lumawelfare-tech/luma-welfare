import { type ReactNode } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import {
  lumaFade,
  lumaHover,
  lumaImage,
  lumaListItemVariants,
  lumaPage,
  lumaPress,
  lumaReveal,
} from '../lib/lumaMotion'

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

/** Alias — scroll reveal for non-section blocks. */
export function MotionReveal(props: Omit<MotionSectionProps, 'as'> & { as?: 'section' | 'div' }) {
  return <MotionSection {...props} as={props.as ?? 'div'} />
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

/** Route / portal page entrance (fade + slight rise). */
export function MotionPage({ children, className = '' }: { children: ReactNode; className?: string }) {
  const reduceMotion = useReducedMotion()

  if (reduceMotion) {
    return <div className={className}>{children}</div>
  }

  return (
    <motion.div
      className={className}
      initial={lumaPage.initial}
      animate={lumaPage.animate}
      exit={lumaPage.exit}
      transition={lumaPage.transition(false)}
    >
      {children}
    </motion.div>
  )
}

/** Opacity-only fade (tooltips, soft panels). */
export function MotionFade({ children, className = '' }: { children: ReactNode; className?: string }) {
  const reduceMotion = useReducedMotion()

  if (reduceMotion) {
    return <div className={className}>{children}</div>
  }

  return (
    <motion.div
      className={className}
      initial={lumaFade.initial}
      animate={lumaFade.animate}
      exit={lumaFade.exit}
      transition={lumaFade.transition(false)}
    >
      {children}
    </motion.div>
  )
}

type MotionListProps = {
  children: ReactNode
  className?: string
}

/** Stagger container — children should be MotionItem. */
export function MotionList({ children, className = '' }: MotionListProps) {
  return <div className={className}>{children}</div>
}

type MotionItemProps = {
  children: ReactNode
  className?: string
  index?: number
}

/** Staggered list item (pairs with MotionList / grid maps). */
export function MotionItem({ children, className = '', index = 0 }: MotionItemProps) {
  const reduceMotion = useReducedMotion()
  const variants = lumaListItemVariants(Boolean(reduceMotion))

  if (reduceMotion) {
    return <div className={className}>{children}</div>
  }

  return (
    <motion.div
      className={className}
      custom={index}
      variants={variants}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: '-40px 0px' }}
    >
      {children}
    </motion.div>
  )
}

type MotionImageProps = {
  children: ReactNode
  className?: string
}

/** Subtle image zoom-out reveal — wrap media in overflow-hidden. */
export function MotionImage({ children, className = '' }: MotionImageProps) {
  const reduceMotion = useReducedMotion()

  if (reduceMotion) {
    return <div className={className}>{children}</div>
  }

  return (
    <motion.div
      className={className}
      initial={lumaImage.initial}
      whileInView={lumaImage.whileInView}
      viewport={lumaImage.viewport}
      transition={lumaImage.transition(false)}
    >
      {children}
    </motion.div>
  )
}
