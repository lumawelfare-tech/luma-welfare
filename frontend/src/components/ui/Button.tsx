import {
  type ButtonHTMLAttributes,
  type ReactNode,
  forwardRef,
} from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

export type ButtonClassNameOptions = {
  variant?: ButtonVariant
  size?: ButtonSize
  block?: boolean
  className?: string
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  ButtonClassNameOptions & {
    /** Shows busy state; keep children as the loading text when set */
    loading?: boolean
    children: ReactNode
  }

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'luma-btn-primary',
  secondary: 'luma-btn-secondary',
  ghost: 'luma-btn-ghost',
  danger: 'luma-btn-danger',
}

const SIZE: Record<ButtonSize, string> = {
  sm: 'luma-btn-sm',
  md: 'luma-btn-md',
  lg: 'luma-btn-lg',
}

/** Class string for Links / anchors that should match Button visuals. */
export function buttonClassName({
  variant = 'primary',
  size = 'md',
  block = false,
  className = '',
}: ButtonClassNameOptions = {}): string {
  return [
    'luma-btn',
    VARIANT[variant],
    SIZE[size],
    block ? 'luma-btn-block' : '',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-luma-600 focus-visible:ring-offset-2',
    className,
  ]
    .filter(Boolean)
    .join(' ')
}

/**
 * Shared Luma button — wraps existing `.luma-btn*` CSS (same look as HomeHero CTA).
 * Prefer this over ad-hoc `bg-luma-700` class strings.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    block = false,
    loading = false,
    disabled,
    className = '',
    children,
    type = 'button',
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClassName({ variant, size, block, className })}
      {...rest}
    >
      {children}
    </button>
  )
})
