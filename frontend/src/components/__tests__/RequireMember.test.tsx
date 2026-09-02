import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi, type Mock } from 'vitest'
import { RequireMember } from '../RequireMember'
import { useAuth } from '../../context/AuthContext'

vi.mock('../../context/AuthContext', () => ({
  useAuth: vi.fn(),
}))

const mockedUseAuth = useAuth as Mock

const renderWithRouter = (initialPath: string) =>
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route element={<RequireMember />}>
          <Route path="/protected" element={<div>Protected Content</div>} />
        </Route>
        <Route path="/login" element={<div>Login Page</div>} />
        <Route path="/verify-email" element={<div>Verify Email Page</div>} />
        <Route path="/dashboard" element={<div>Dashboard Page</div>} />
      </Routes>
    </MemoryRouter>,
  )

describe('RequireMember', () => {
  it('shows loading state while auth is loading', () => {
    mockedUseAuth.mockReturnValue({ member: null, loading: true })
    renderWithRouter('/protected')
    expect(screen.getByText('Checking your account…')).toBeInTheDocument()
  })

  it('redirects to login when not authenticated', () => {
    mockedUseAuth.mockReturnValue({ member: null, loading: false })
    renderWithRouter('/protected')
    expect(screen.getByText('Login Page')).toBeInTheDocument()
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
  })

  it('redirects to verify-email when status is pending_approval', () => {
    mockedUseAuth.mockReturnValue({
      member: { status: 'pending_approval', email: 'test@example.com' },
      loading: false,
    })
    renderWithRouter('/protected')
    expect(screen.getByText('Verify Email Page')).toBeInTheDocument()
  })

  it('renders outlet when authenticated with active status', () => {
    mockedUseAuth.mockReturnValue({
      member: { status: 'active', email: 'test@example.com' },
      loading: false,
    })
    renderWithRouter('/protected')
    expect(screen.getByText('Protected Content')).toBeInTheDocument()
  })

  it('renders outlet when authenticated with approved status', () => {
    mockedUseAuth.mockReturnValue({
      member: { status: 'approved', email: 'test@example.com' },
      loading: false,
    })
    renderWithRouter('/protected')
    expect(screen.getByText('Protected Content')).toBeInTheDocument()
  })
})
