import {
  PAYMENTS_DISABLED_COPY,
  PAYMENTS_ENABLED_COPY,
  PAYMENTS_MOCK_COPY,
  PAYMENTS_SANDBOX_BADGE,
  isSandboxPayments,
  resolvePaymentsMode,
} from '../lib/paymentsUi'

/**
 * Small chip shown wherever online payments are offered so members know a
 * sandbox transaction will not move real money.
 */
export function PaymentsSandboxBadge({ mpesaEnvironment }: { mpesaEnvironment?: string | null }) {
  if (mpesaEnvironment !== 'sandbox') return null
  return (
    <span className="inline-flex items-center rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-800">
      {PAYMENTS_SANDBOX_BADGE}
    </span>
  )
}

type PaymentsModeBannerProps = {
  serverPaymentsEnabled: boolean
  mpesaEnvironment?: string | null
  /** Copy used in the `disabled` state. Defaults to the general disabled notice. */
  disabledCopy?: string
}

/**
 * Renders exactly one of the three payment states: local mock preview,
 * server-enabled, or server-disabled. The server flag is the source of truth.
 */
export function PaymentsModeBanner({
  serverPaymentsEnabled,
  mpesaEnvironment,
  disabledCopy = PAYMENTS_DISABLED_COPY,
}: PaymentsModeBannerProps) {
  const mode = resolvePaymentsMode(serverPaymentsEnabled)

  if (mode === 'mock') {
    return (
      <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800" role="status">
        {PAYMENTS_MOCK_COPY}
      </div>
    )
  }

  if (mode === 'enabled') {
    const sandbox = isSandboxPayments(serverPaymentsEnabled, mpesaEnvironment)
    return (
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800" role="status">
        <span>{PAYMENTS_ENABLED_COPY}</span>
        {sandbox && <PaymentsSandboxBadge mpesaEnvironment={mpesaEnvironment} />}
      </div>
    )
  }

  return (
    <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800" role="status">
      {disabledCopy}
    </div>
  )
}
