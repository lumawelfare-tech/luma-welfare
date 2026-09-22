import { type ReactNode } from 'react'
import { Button } from './ui'
import type { PaymentFlowStep } from '../lib/paymentsUi'

type PaymentStatusPanelProps = {
  step: Exclude<PaymentFlowStep, 'phone'>
  title?: string
  message?: string
  receipt?: string | null
  primaryLabel?: string
  onPrimary?: () => void
  secondaryLabel?: string
  onSecondary?: () => void
  children?: ReactNode
}

const DEFAULTS: Record<Exclude<PaymentFlowStep, 'phone'>, { title: string; message: string }> = {
  waiting: {
    title: 'Waiting for M-Pesa',
    message: 'Enter your M-Pesa PIN on your phone. This screen updates when payment is confirmed.',
  },
  success: {
    title: 'Payment confirmed',
    message: 'Your payment was successful.',
  },
  failed: {
    title: 'Payment failed',
    message: 'The payment was not completed. You can try again.',
  },
  expired: {
    title: 'Timed out',
    message: 'Payment timed out. Please try again.',
  },
  disabled: {
    title: 'Payments unavailable',
    message: 'M-Pesa is not enabled right now. An administrator can verify a manual payment.',
  },
}

/**
 * Shared visual states for registration-fee and contribution pay modals.
 * Does not call payment APIs.
 */
export function PaymentStatusPanel({
  step,
  title,
  message,
  receipt,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
  children,
}: PaymentStatusPanelProps) {
  const defaults = DEFAULTS[step]
  const heading = title ?? defaults.title
  const body = message ?? defaults.message

  const iconWrap =
    step === 'success'
      ? 'bg-emerald-100 text-emerald-600'
      : step === 'failed' || step === 'disabled'
        ? 'bg-red-100 text-red-600'
        : step === 'expired'
          ? 'bg-amber-100 text-amber-700'
          : 'bg-amber-100 text-amber-600'

  return (
    <div className="px-6 py-10 text-center" role="status" aria-live="polite">
      <div className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full ${iconWrap}`}>
        {step === 'waiting' && (
          <svg className="h-6 w-6 animate-pulse motion-reduce:animate-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )}
        {step === 'success' && (
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        )}
        {(step === 'failed' || step === 'disabled') && (
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        )}
        {step === 'expired' && (
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )}
      </div>
      <h3 className="mt-3 text-lg font-semibold text-gray-900">{heading}</h3>
      <p className="mt-1 text-sm text-gray-600">{body}</p>
      {receipt && <p className="mt-1 text-sm text-gray-500">Receipt: {receipt}</p>}
      {step === 'waiting' && (
        <p className="mt-3 inline-flex items-center gap-2 text-xs font-medium text-amber-800">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse motion-reduce:animate-none" aria-hidden="true" />
          Waiting for confirmation…
        </p>
      )}
      {children}
      {(onPrimary || onSecondary) && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {onPrimary && (
            <Button type="button" variant="primary" onClick={onPrimary}>
              {primaryLabel ?? 'Continue'}
            </Button>
          )}
          {onSecondary && (
            <Button type="button" variant="secondary" onClick={onSecondary}>
              {secondaryLabel ?? 'Close'}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
