import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { api, setSession, clearSession } from '../lib/api'
import { supabase } from '../lib/supabase'

export type Member = {
  id: string
  membership_number: string | null
  full_name: string
  phone: string
  email: string | null
  status: 'pending_approval' | 'active' | 'suspended' | 'closed'
  joined_at: string | null
  approved_at: string | null
  [key: string]: unknown
}

export type LoginResult = {
  member: Member | null
  isAdmin: boolean
}

type AuthState = {
  member: Member | null
  isAdmin: boolean
  adminRole: string | null
  registrationFeePaid: boolean
  loading: boolean
  login: (email: string, password: string) => Promise<LoginResult>
  signInWithGoogle: () => Promise<void>
  register: (input: {
    email: string
    password: string
    fullName: string
    phone: string
    idNumber?: string
  }) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthState | null>(null)

/**
 * After OAuth login, ensure the user has a member record.
 * Uses a dedicated Edge Function that creates the member directly
 * from the authenticated user's Supabase Auth identity — no phone required.
 */
async function ensureMemberRecord() {
  try {
    // Try to fetch existing member first
    const data = await api<{ member: Member | null }>('/auth/me', { auth: true })
    if (data.member) return
  } catch {
    // No member record — create one via the OAuth provisioning endpoint
  }

  try {
    await api('/auth/oauth-provision', { method: 'POST', auth: true })
  } catch {
    // Provisioning may fail if there's a race condition — that's okay
    // The auth-me check above will handle it on next request
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [member, setMember] = useState<Member | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [adminRole, setAdminRole] = useState<string | null>(null)
  const [registrationFeePaid, setRegistrationFeePaid] = useState(false)
  const [loading, setLoading] = useState(true)

  // Fetch member profile and admin status from the server
  async function loadProfile(): Promise<{ member: Member | null; isAdmin: boolean; adminRole: string | null; registrationFeePaid: boolean }> {
    try {
      const data = await api<{ member: Member; isAdmin?: boolean; adminRole?: string | null; registrationFeePaid?: boolean }>('/auth/me', { auth: true })
      return { member: data.member, isAdmin: data.isAdmin === true, adminRole: data.adminRole ?? null, registrationFeePaid: data.registrationFeePaid === true }
    } catch {
      return { member: null, isAdmin: false, adminRole: null, registrationFeePaid: false }
    }
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

      setSession(session.access_token, session.expires_at)        // Ensure OAuth users have a member record
        if (session.user.app_metadata?.provider !== 'email') {
          await ensureMemberRecord()
        }

      const profile = await loadProfile()
      if (!cancelled) {
        setMember(profile.member)
        setIsAdmin(profile.isAdmin)
        setAdminRole(profile.adminRole)
        setRegistrationFeePaid(profile.registrationFeePaid)
      }
    }

    hydrate().finally(() => { if (!cancelled) setLoading(false) })

    // Listen for auth state changes (OAuth redirects, token refresh, sign out)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (cancelled) return

      if (event === 'SIGNED_OUT' || !session) {
        setMember(null)
        setIsAdmin(false)
        setAdminRole(null)
        clearSession()
        return
      }

      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        if (session?.access_token) {
          setSession(session.access_token, session.expires_at)
        }

        // For OAuth sign-ins, ensure member record exists
        if (session?.user && session.user.app_metadata?.provider !== 'email') {
          await ensureMemberRecord()
        }

        const profile = await loadProfile()
        setMember(profile.member)
        setIsAdmin(profile.isAdmin)
        setAdminRole(profile.adminRole)
        setRegistrationFeePaid(profile.registrationFeePaid)
      }
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  async function login(email: string, password: string): Promise<LoginResult> {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      throw new Error(error.message)
    }

    if (data.session?.access_token) {
      setSession(data.session.access_token, data.session.expires_at)
    }

    const me = await loadProfile()
    setMember(me.member)
    setIsAdmin(me.isAdmin)
    setAdminRole(me.adminRole)
    setRegistrationFeePaid(me.registrationFeePaid)
    return { member: me.member, isAdmin: me.isAdmin }
  }

  async function signInWithGoogle(): Promise<void> {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/dashboard`,
      },
    })
    if (error) throw error
  }

  async function register(input: {
    email: string
    password: string
    fullName: string
    phone: string
    idNumber?: string
  }): Promise<void> {
    await api('/auth/register', { method: 'POST', body: input })
  }

  function logout() {
    clearSession()
    supabase.auth.signOut()
    setMember(null)
    setIsAdmin(false)
    setAdminRole(null)
    setRegistrationFeePaid(false)
  }    return (
    <AuthContext.Provider value={{ member, isAdmin, adminRole, registrationFeePaid, loading, login, signInWithGoogle, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
