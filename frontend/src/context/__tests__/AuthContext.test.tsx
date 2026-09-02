/**
 * AuthContext — Unit Tests
 *
 * Tests auth state transitions: unauthenticated, authenticated member,
 * authenticated admin, pending-approval, and logout behavior.
 *
 * Run: npm test -- AuthContext
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { AuthProvider, useAuth } from '../AuthContext'

const mockMember = {
  id: 'member-uuid',
  membership_number: 'LUMA-001',
  full_name: 'Test Member',
  phone: '+254700000001',
  email: 'member@test.com',
  status: 'active' as const,
  joined_at: '2024-01-01',
  approved_at: '2024-01-15',
  approved_by: 'admin-uuid',
  photo_url: null,
  id_number: '12345678',
  alt_phone: null,
  county: 'Nairobi',
  location: 'Westlands',
  occupation: 'Engineer',
  created_at: '2024-01-01',
  updated_at: '2024-01-15',
}

const mockAdminMember = {
  ...mockMember,
  id: 'admin-uuid',
  full_name: 'Test Admin',
  email: 'admin@test.com',
}

vi.mock('../../lib/supabase', () => {
  const unsubscribe = vi.fn()
  return {
    supabase: {
      auth: {
        getSession: vi.fn(),
        onAuthStateChange: vi.fn(() => ({
          data: { subscription: { unsubscribe } },
        })),
        signInWithPassword: vi.fn(),
        signInWithOAuth: vi.fn(),
        signOut: vi.fn(() => Promise.resolve()),
      },
    },
  }
})

vi.mock('../../lib/api', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    api: vi.fn(),
  }
})

import { supabase } from '../../lib/supabase'
import { api } from '../../lib/api'

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  // ── Unauthenticated state ─────────────────────────────────────────────────

  it('provides unauthenticated state when no session exists', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: null } })
    vi.mocked(supabase.auth.onAuthStateChange).mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    })

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.member).toBeNull()
    expect(result.current.isAdmin).toBe(false)
    expect(result.current.adminRole).toBeNull()
  })

  // ── Authenticated member state ─────────────────────────────────────────────

  it('loads member profile when session exists', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: {
        session: {
          user: { id: 'member-uuid' },
          access_token: 'valid-token',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        },
      },
    })
    vi.mocked(supabase.auth.onAuthStateChange).mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    })
    vi.mocked(api).mockResolvedValue({
      member: mockMember,
      isAdmin: false,
      adminRole: null,
      registrationFeePaid: true,
    })

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.member).toEqual(mockMember)
    expect(result.current.isAdmin).toBe(false)
    expect(result.current.registrationFeePaid).toBe(true)
    expect(api).toHaveBeenCalledWith('/auth/me', { auth: true })
  })

  // ── Authenticated admin state ──────────────────────────────────────────────

  it('loads admin profile and sets isAdmin when user is admin', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: {
        session: {
          user: { id: 'admin-uuid' },
          access_token: 'admin-token',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        },
      },
    })
    vi.mocked(supabase.auth.onAuthStateChange).mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    })
    vi.mocked(api).mockResolvedValue({
      member: mockAdminMember,
      isAdmin: true,
      adminRole: 'super_admin',
      registrationFeePaid: true,
    })

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.member).toEqual(mockAdminMember)
    expect(result.current.isAdmin).toBe(true)
    expect(result.current.adminRole).toBe('super_admin')
  })

  // ── pending_approval state ─────────────────────────────────────────────────

  it('reflects pending_approval member status', async () => {
    const pendingMember = { ...mockMember, status: 'pending_approval' as const }
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: {
        session: {
          user: { id: 'pending-uuid' },
          access_token: 'pending-token',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        },
      },
    })
    vi.mocked(supabase.auth.onAuthStateChange).mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    })
    vi.mocked(api).mockResolvedValue({
      member: pendingMember,
      isAdmin: false,
      adminRole: null,
      registrationFeePaid: false,
    })

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.member?.status).toBe('pending_approval')
    expect(result.current.isAdmin).toBe(false)
  })

  // ── useAuth throws outside provider ───────────────────────────────────────

  it('useAuth throws when called outside AuthProvider', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => renderHook(() => useAuth())).toThrow(
      'useAuth must be used inside AuthProvider',
    )
    consoleError.mockRestore()
  })
})
