import {
  type InputHTMLAttributes,
  type ReactNode,
  forwardRef,
  useId,
} from 'react'

/** Canonical glass field classes (auth + marketing forms). */
export const fieldClass =
  'glass-input w-full rounded-[var(--radius-control)] px-4 py-3 text-sm text-gray-800 placeholder:text-gray-500'

export const fieldAdminClass =
  'w-full rounded-[var(--radius-control)] border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-luma-500 focus:ring-2 focus:ring-luma-500/20'

export type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> & {
  label?: ReactNode
  error?: string
  hint?: string
  /** Use denser admin border style instead of glass */
  appearance?: 'glass' | 'admin'
}

/**
 * Shared text input with optional label, hint, and error (aria-describedby / aria-invalid).
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    label,
    error,
    hint,
    appearance = 'glass',
    className = '',
    id,
    disabled,
    ...rest
  },
  ref,
) {
  const autoId = useId()
  const inputId = id ?? autoId
  const hintId = hint ? `${inputId}-hint` : undefined
  const errorId = error ? `${inputId}-error` : undefined
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium text-gray-700">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={[
          appearance === 'glass' ? fieldClass : fieldAdminClass,
          error ? 'border-red-300 focus:border-red-500 focus:ring-red-500/20' : '',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        {...rest}
      />
      {hint && !error && (
        <p id={hintId} className="mt-1 text-xs text-gray-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="mt-1 text-xs font-medium text-red-700" role="alert">
          {error}
        </p>
      )}
    </div>
  )
})
