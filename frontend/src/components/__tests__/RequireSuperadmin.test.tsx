import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi, type Mock, beforeEach, describe, it, expect } from 'vitest'
import { RequireSuperadmin } from '../RequireSuperadmin'
import { useAuth } from '../../context/AuthContext'

vi.mock('../../context/AuthContext', () => ({
  useAuth: vi.fn(),
}))

const mockedUseAuth = useAuth as Mock

function renderGate(initial = '/admin/staff-roles') {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route path="/admin/dashboard" element={<div>Dashboard</div>} />
        <Route element={<RequireSuperadmin />}>
          <Route path="/admin/staff-roles" element={<div>Staff Page</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

describe('RequireSuperadmin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('redirects non-superadmin admins to dashboard', () => {
    mockedUseAuth.mockReturnValue({
      isAdmin: true,
      isSuperadmin: false,
      loading: false,
    })
    renderGate()
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.queryByText('Staff Page')).not.toBeInTheDocument()
  })

  it('renders outlet for superadmin', () => {
    mockedUseAuth.mockReturnValue({
      isAdmin: true,
      isSuperadmin: true,
      loading: false,
    })
    renderGate()
    expect(screen.getByText('Staff Page')).toBeInTheDocument()
  })

  it('redirects when not admin', () => {
    mockedUseAuth.mockReturnValue({
      isAdmin: false,
      isSuperadmin: false,
      loading: false,
    })
    renderGate()
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
  })
})
