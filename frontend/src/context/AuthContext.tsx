import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { api, setSession, clearSession, ApiError } from '../lib/api'
import { supabase } from '../lib/supabase'
import { setSentryUser, clearSentryUser } from '../lib/sentry'

export type Member = {
  id: string
  membership_number: string | null
  application_number?: string | null
  full_name: string
  phone: string
  email: string | null
  status: 'pending_approval' | 'active' | 'suspended' | 'closed'
  joined_at: string | null
  approved_at: string | null
  approved_by: string | null
  photo_url: string | null
  id_number: string | null
  alt_phone: string | null
  county: string | null
  location: string | null
  occupation: string | null
  date_of_birth?: string | null
  created_at: string | null
  updated_at: string | null
  privacy_accepted_at?: string | null
  terms_accepted_at?: string | null
  privacy_policy_version?: string | null
  terms_version?: string | null
  application_program_codes?: string[] | null
  payment_verified_at?: string | null
}

export type LoginResult = {
  member: Member | null
  isAdmin: boolean
  emailConfirmed?: boolean
  requires2fa?: boolean
  requires2faSetup?: boolean
}

type AuthState = {
  member: Member | null
  isAdmin: boolean
  adminRole: string | null
  isSuperadmin: boolean
  /** Permission keys from auth-me (`resource:action`). Empty for non-admins. */
  adminPermissions: string[]
  registrationFeePaid: boolean
  emailConfirmed: boolean
  loading: boolean
  twoFaVerified: boolean
  login: (email: string, password: string) => Promise<LoginResult>
  signInWithGoogle: () => Promise<void>
  register: (input: Record<string, unknown>) => Promise<{
    applicationNumber?: string
    membershipStatus?: string
    registrationFee?: { amount: number; currency: string }
  }>
  logout: () => void
  setTwoFaVerified: (v: boolean) => void
  refreshMember: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

/**
 * Server-side Google OAuth authorization check.
 * Verifies that the Google-authenticated user is an existing Luma Welfare member.
 * NEVER creates member records — Google is a login method, not a registration method.
 */
async function authorizeGoogleLogin(): Promise<{ authorized: boolean; message?: string; code?: string }> {
  try {
    const data = await api<{ authorized: boolean; message?: string; code?: string }>(
      '/auth/google-authorize',
      { method: 'POST', auth: true },
    )
    return data
  } catch {
    return { authorized: false, message: 'Authorization check failed. Please try again.', code: 'INTERNAL' }
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [member, setMember] = useState<Member | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [adminRole, setAdminRole] = useState<string | null>(null)
  const [isSuperadmin, setIsSuperadmin] = useState(false)
  const [adminPermissions, setAdminPermissions] = useState<string[]>([])
  const [registrationFeePaid, setRegistrationFeePaid] = useState(false)
  const [emailConfirmed, setEmailConfirmed] = useState(false)
  const [twoFaVerified, setTwoFaVerified] = useState(false)
  const [loading, setLoading] = useState(true)

  // Fetch member profile and admin status from the server
  async function loadProfile(): Promise<{
    member: Member | null
    isAdmin: boolean
    adminRole: string | null
    isSuperadmin: boolean
    adminPermissions: string[]
    registrationFeePaid: boolean
    emailConfirmed: boolean
  }> {
    try {
      const data = await api<{
        member: Member
        isAdmin?: boolean
        adminRole?: string | null
        isSuperadmin?: boolean
        adminPermissions?: string[]
        registrationFeePaid?: boolean
        emailConfirmed?: boolean
      }>('/auth/me', { auth: true })
      const role = data.adminRole ?? null
      const superFlag = data.isSuperadmin === true || role === 'superadmin'
      const perms = Array.isArray(data.adminPermissions)
        ? data.adminPermissions.filter((p): p is string => typeof p === 'string')
        : []
      return {
        member: data.member,
        isAdmin: data.isAdmin === true,
        adminRole: role,
        isSuperadmin: superFlag,
        adminPermissions: perms,
        registrationFeePaid: data.registrationFeePaid === true,
        emailConfirmed: data.emailConfirmed === true,
      }
    } catch {
      return {
        member: null,
        isAdmin: false,
        adminRole: null,
        isSuperadmin: false,
        adminPermissions: [],
        registrationFeePaid: false,
        emailConfirmed: false,
      }
    }
  }

  function applyProfile(profile: Awaited<ReturnType<typeof loadProfile>>) {
    setMember(profile.member)
    setIsAdmin(profile.isAdmin)
    setAdminRole(profile.adminRole)
    setIsSuperadmin(profile.isSuperadmin)
    setAdminPermissions(profile.adminPermissions)
    setRegistrationFeePaid(profile.registrationFeePaid)
    setEmailConfirmed(profile.emailConfirmed)
  }

  function clearAuthState() {
    setMember(null)
    setIsAdmin(false)
    setAdminRole(null)
    setIsSuperadmin(false)
    setAdminPermissions([])
    setRegistrationFeePaid(false)
    setEmailConfirmed(false)
  }

  useEffect(() => {
    let cancelled = false

    // Initial session hydration
    async function hydrate() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setLoading(false)
        return
      }

      setSession(session.access_token, session.expires_at)

      const profile = await loadProfile()
      if (!cancelled) {
        applyProfile(profile)
        if (profile.member?.id) {
          setSentryUser({
            id: profile.member.id,
            role: profile.isAdmin ? (profile.adminRole ?? 'admin') : 'member',
          })
        }
      }
    }

    hydrate().finally(() => { if (!cancelled) setLoading(false) })

    // Listen for auth state changes (OAuth redirects, token refresh, sign out)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (cancelled) return

      if (event === 'SIGNED_OUT' || !session) {
        clearAuthState()
        clearSession()
        clearSentryUser()
        return
      }

      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        if (session?.access_token) {
          setSession(session.access_token, session.expires_at)
        }

        // For OAuth sign-ins, perform server-side authorization check
        if (session?.user && session.user.app_metadata?.provider !== 'email') {
          const authResult = await authorizeGoogleLogin()
          if (!authResult.authorized) {
            // Unauthorized — sign out and store error for display
            clearAuthState()
            clearSession()
            supabase.auth.signOut()
            // Store the authorization error so the login page can display it
            sessionStorage.setItem('google_auth_error', authResult.message ?? 'Google login not authorized.')
            window.location.href = '/login'
            return
          }
        }

        const profile = await loadProfile()
        applyProfile(profile)
        if (profile.member?.id) {
          setSentryUser({
            id: profile.member.id,
            role: profile.isAdmin ? (profile.adminRole ?? 'admin') : 'member',
          })
        }

        // After OAuth sign-in, redirect admins to admin dashboard
        if (session?.user && session.user.app_metadata?.provider !== 'email' && profile.isAdmin) {
          window.location.href = '/admin/dashboard'
          return
        }
      }
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  async function login(email: string, password: string): Promise<LoginResult> {
    type LoginResponse = {
      session?: { access_token: string; refresh_token?: string; expires_at?: number } | null
      requires_2fa?: boolean
      requires_2fa_setup?: boolean
    }

    let loginRes: LoginResponse
    try {
      loginRes = await api<LoginResponse>('/auth/login', {
        method: 'POST',
        body: { email, password },
      })
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'EMAIL_NOT_CONFIRMED') {
          throw new ApiError(403, 'Please verify your email address before signing in.', 'EMAIL_NOT_CONFIRMED')
        }
        if (err.code === 'ACCOUNT_INACTIVE') {
          throw err
        }
        if (err.status === 429) throw err
        throw new ApiError(err.status || 400, 'Email or password is incorrect.', 'LOGIN_FAILED')
      }
      throw new ApiError(400, 'Email or password is incorrect.', 'LOGIN_FAILED')
    }

    const accessToken = loginRes.session?.access_token
    if (accessToken && loginRes.session?.refresh_token) {
      const { error: setErr } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: loginRes.session.refresh_token,
      })
      if (setErr) {
        throw new ApiError(400, 'Email or password is incorrect.', 'LOGIN_FAILED')
      }
      setSession(accessToken, loginRes.session.expires_at)
    } else if (accessToken) {
      setSession(accessToken, loginRes.session?.expires_at)
    } else {
      throw new ApiError(400, 'Email or password is incorrect.', 'LOGIN_FAILED')
    }

    const me = await loadProfile()
    applyProfile(me)

    if (me.member && (me.member.status === 'suspended' || me.member.status === 'closed') && !me.isAdmin) {
      clearSession()
      await supabase.auth.signOut()
      clearAuthState()
      throw new ApiError(403, 'Your account is suspended or closed. Contact Luma Welfare support.', 'ACCOUNT_INACTIVE')
    }

    if (me.isAdmin) {
      if (loginRes.requires_2fa) {
        return { member: me.member, isAdmin: true, emailConfirmed: me.emailConfirmed, requires2fa: true }
      }
      if (loginRes.requires_2fa_setup) {
        return { member: me.member, isAdmin: true, emailConfirmed: me.emailConfirmed, requires2faSetup: true }
      }
    }

    return { member: me.member, isAdmin: me.isAdmin, emailConfirmed: me.emailConfirmed }
  }

  async function signInWithGoogle(): Promise<void> {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/dashboard`,
      },
    })
    if (error) throw error
    // Note: After OAuth redirect, the onAuthStateChange listener above handles
    // authorization check and admin redirect. The redirectTo is /dashboard as a
    // fallback — the listener checks isAdmin and redirects to /admin/dashboard
    // for admin users.
  }

  async function register(input: Record<string, unknown>): Promise<{
    applicationNumber?: string
    membershipStatus?: string
    registrationFee?: { amount: number; currency: string }
  }> {
    const res = await api<{
      applicationNumber?: string
      membershipStatus?: string
      registrationFee?: { amount: number; currency: string }
    }>('/auth/register', { method: 'POST', body: input })
    return {
      applicationNumber: res.applicationNumber,
      membershipStatus: res.membershipStatus,
      registrationFee: res.registrationFee,
    }
  }

  async function refreshMember(): Promise<void> {
    const profile = await loadProfile()
    applyProfile(profile)
  }

  function logout() {
    clearSession()
    clearSentryUser()
    supabase.auth.signOut()
    clearAuthState()
    setTwoFaVerified(false)
  }
  return (
    <AuthContext.Provider value={{ member, isAdmin, adminRole, isSuperadmin, adminPermissions, registrationFeePaid, emailConfirmed, twoFaVerified, loading, login, signInWithGoogle, register, logout, setTwoFaVerified, refreshMember }}>
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react/only-export-components — useAuth is a standard React hook export
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
