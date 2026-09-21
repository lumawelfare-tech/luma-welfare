import { render, screen } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { AppBootLoader } from '../AppBootLoader'
import { AuthBootGate } from '../AuthBootGate'
import { useAuth } from '../../context/AuthContext'

vi.mock('framer-motion', async () => {
  const actual = await vi.importActual<typeof import('framer-motion')>('framer-motion')
  return {
    ...actual,
    useReducedMotion: vi.fn(() => false),
  }
})

vi.mock('../../context/AuthContext', () => ({
  useAuth: vi.fn(),
}))

import { useReducedMotion } from 'framer-motion'

const mockedReduced = useReducedMotion as unknown as ReturnType<typeof vi.fn>
const mockedUseAuth = useAuth as unknown as ReturnType<typeof vi.fn>

describe('AppBootLoader', () => {
  beforeEach(() => {
    mockedReduced.mockReturnValue(false)
  })

  it('renders brand wordmark and mark', () => {
    render(<AppBootLoader />)
    expect(screen.getByText('Luma Welfare')).toBeInTheDocument()
    expect(screen.getByText('LW')).toBeInTheDocument()
    expect(screen.getByText('Community Welfare')).toBeInTheDocument()
  })

  it('exposes an accessible loading status', () => {
    render(<AppBootLoader message="Preparing your session…" />)
    const status = screen.getByRole('status')
    expect(status).toHaveAttribute('aria-busy', 'true')
    expect(status).toHaveAttribute('aria-live', 'polite')
    expect(screen.getByText(/Loading Luma Welfare/i)).toBeInTheDocument()
    expect(screen.getByText('Preparing your session…')).toBeInTheDocument()
  })

  it('uses a static indicator when reduced motion is preferred', () => {
    mockedReduced.mockReturnValue(true)
    render(<AppBootLoader />)
    const root = screen.getByTestId('app-boot-loader')
    expect(root).toHaveAttribute('data-reduced-motion', 'true')
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.getByText('Luma Welfare')).toBeInTheDocument()
  })
})

describe('AuthBootGate', () => {
  it('shows AppBootLoader while auth is initializing', () => {
    mockedUseAuth.mockReturnValue({ loading: true })
    render(
      <AuthBootGate>
        <div>App Ready</div>
      </AuthBootGate>,
    )
    expect(screen.getByTestId('app-boot-loader')).toBeInTheDocument()
    expect(screen.queryByText('App Ready')).not.toBeInTheDocument()
  })

  it('renders children when initialization finishes (no infinite loader)', () => {
    mockedUseAuth.mockReturnValue({ loading: false, member: null })
    render(
      <AuthBootGate>
        <div>App Ready</div>
      </AuthBootGate>,
    )
    expect(screen.queryByTestId('app-boot-loader')).not.toBeInTheDocument()
    expect(screen.getByText('App Ready')).toBeInTheDocument()
  })

  it('does not keep the loader when auth reports not loading after failure path', () => {
    // Mirrors AuthContext hydrate: loadProfile errors still end with loading=false
    mockedUseAuth.mockReturnValue({ loading: false, member: null, isAdmin: false })
    render(
      <AuthBootGate>
        <div role="main">Public shell</div>
      </AuthBootGate>,
    )
    expect(screen.queryByTestId('app-boot-loader')).not.toBeInTheDocument()
    expect(screen.getByRole('main')).toHaveTextContent('Public shell')
  })
})
