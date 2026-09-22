import { type HTMLAttributes, type ReactNode } from 'react'

export type CardVariant = 'card' | 'panel' | 'interactive'

export type CardProps = HTMLAttributes<HTMLDivElement> & {
  variant?: CardVariant
  children: ReactNode
}

const VARIANT: Record<CardVariant, string> = {
  card: 'glass-card',
  panel: 'glass-panel',
  interactive: 'glass-card luma-card-interactive',
}

/**
 * Shared surface wrapper — maps to existing glass CSS (same visual identity).
 */
export function Card({ variant = 'card', className = '', children, ...rest }: CardProps) {
  return (
    <div className={[VARIANT[variant], className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </div>
  )
}
