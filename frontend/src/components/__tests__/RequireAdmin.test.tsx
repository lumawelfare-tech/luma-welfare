import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi, type Mock, beforeEach } from 'vitest'
import { RequireAdmin } from '../RequireAdmin'
import { useAuth } from '../../context/AuthContext'
import { api } from '../../lib/api'

vi.mock('../../context/AuthContext', () => ({
  useAuth: vi.fn(),
}))

vi.mock('../../lib/api', () => ({
  api: vi.fn(),
  ApiError: class ApiError extends Error {
    status: number
    code: string
    constructor(status: number, message: string, code = 'ERROR') {
      super(message)
      this.status = status
      this.code = code
    }
  },
  setAdmin2faStepUpToken: vi.fn(),
}))

vi.mock('../AdminLogin', () => ({
  AdminLogin: () => <div>Admin Login</div>,
}))

const mockedUseAuth = useAuth as Mock
const mockedApi = api as Mock

function renderAdmin() {
  return render(
    <MemoryRouter initialEntries={['/admin']}>
      <Routes>
        <Route element={<RequireAdmin />}>
          <Route path="/admin" element={<div>Admin Content</div>} />
        </Route>
        <Route path="/dashboard" element={<div>Dashboard</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('RequireAdmin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fail-closes when 2FA status check errors', async () => {
    const setTwoFaVerified = vi.fn()
    mockedUseAuth.mockReturnValue({
      member: null,
      isAdmin: true,
      twoFaVerified: false,
      setTwoFaVerified,
      loading: false,
    })
    mockedApi.mockRejectedValue(new Error('network'))

    renderAdmin()

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/Unable to verify admin security settings/i)
    })
    expect(setTwoFaVerified).toHaveBeenCalledWith(false)
    expect(screen.queryByText('Admin Content')).not.toBeInTheDocument()
  })

  it('requires 2FA setup when staff 2FA is disabled', async () => {
    const setTwoFaVerified = vi.fn()
    mockedUseAuth.mockReturnValue({
      member: null,
      isAdmin: true,
      twoFaVerified: false,
      setTwoFaVerified,
      loading: false,
    })
    mockedApi.mockResolvedValue({ two_factor_enabled: false })

    renderAdmin()

    await waitFor(() => {
      expect(screen.getByText(/Set up two-factor authentication/i)).toBeInTheDocument()
    })
    expect(screen.queryByText('Admin Content')).not.toBeInTheDocument()
  })
})
