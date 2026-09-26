import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PaymentsModeBanner, PaymentsSandboxBadge } from '../PaymentsModeBanner'
import {
  PAYMENTS_DISABLED_COPY,
  PAYMENTS_ENABLED_COPY,
  PAYMENTS_MOCK_COPY,
  PAYMENTS_SANDBOX_BADGE,
} from '../../lib/paymentsUi'

describe('PaymentsModeBanner', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_PAYMENTS_UI_MOCK', undefined)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('shows the disabled copy when the server reports payments off', () => {
    render(<PaymentsModeBanner serverPaymentsEnabled={false} mpesaEnvironment={null} />)

    expect(screen.getByText(PAYMENTS_DISABLED_COPY)).toBeInTheDocument()
    expect(screen.queryByText(PAYMENTS_ENABLED_COPY)).not.toBeInTheDocument()
  })

  it('shows the enabled copy when the server reports payments on', () => {
    render(<PaymentsModeBanner serverPaymentsEnabled mpesaEnvironment="production" />)

    expect(screen.getByText(PAYMENTS_ENABLED_COPY)).toBeInTheDocument()
    expect(screen.queryByText(PAYMENTS_DISABLED_COPY)).not.toBeInTheDocument()
  })

  it('never claims payments are enabled while the local mock flag is on', () => {
    vi.stubEnv('VITE_PAYMENTS_UI_MOCK', 'true')
    render(<PaymentsModeBanner serverPaymentsEnabled mpesaEnvironment="sandbox" />)

    expect(screen.getByText(PAYMENTS_MOCK_COPY)).toBeInTheDocument()
    expect(screen.queryByText(PAYMENTS_ENABLED_COPY)).not.toBeInTheDocument()
    expect(screen.queryByText(PAYMENTS_DISABLED_COPY)).not.toBeInTheDocument()
  })

  it('uses the caller-supplied disabled copy for the contribution surface', () => {
    render(<PaymentsModeBanner serverPaymentsEnabled={false} disabledCopy="Record it manually." />)

    expect(screen.getByText('Record it manually.')).toBeInTheDocument()
    expect(screen.queryByText(PAYMENTS_DISABLED_COPY)).not.toBeInTheDocument()
  })

  it('shows the sandbox badge only when payments are enabled on the sandbox', () => {
    const { rerender } = render(
      <PaymentsModeBanner serverPaymentsEnabled mpesaEnvironment="sandbox" />,
    )
    expect(screen.getByText(PAYMENTS_SANDBOX_BADGE)).toBeInTheDocument()

    rerender(<PaymentsModeBanner serverPaymentsEnabled mpesaEnvironment="production" />)
    expect(screen.queryByText(PAYMENTS_SANDBOX_BADGE)).not.toBeInTheDocument()

    rerender(<PaymentsModeBanner serverPaymentsEnabled={false} mpesaEnvironment="sandbox" />)
    expect(screen.queryByText(PAYMENTS_SANDBOX_BADGE)).not.toBeInTheDocument()
  })
})

describe('PaymentsSandboxBadge', () => {
  it('renders nothing outside the sandbox', () => {
    const { container } = render(<PaymentsSandboxBadge mpesaEnvironment="production" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the sandbox label', () => {
    render(<PaymentsSandboxBadge mpesaEnvironment="sandbox" />)
    expect(screen.getByText(PAYMENTS_SANDBOX_BADGE)).toBeInTheDocument()
  })
})
