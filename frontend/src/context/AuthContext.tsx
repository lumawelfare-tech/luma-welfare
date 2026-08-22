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
  loading: boolean
  login: (email: string, password: string) => Promise<LoginResult>
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [member, setMember] = useState<Member | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [adminRole, setAdminRole] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function hydrate() {
      // Check Supabase session first
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setLoading(false)
        return
      }

      // Store session in localStorage for backward compatibility
      setSession(session.access_token, session.expires_at)

      try {
        const data = await api<{ member: Member; isAdmin?: boolean; adminRole?: string | null }>('/auth/me', { auth: true })
        if (!cancelled) {
          setMember(data.member)
          setIsAdmin(data.isAdmin === true)
          setAdminRole(data.adminRole ?? null)
        }
      } catch {
        clearSession()
        await supabase.auth.signOut()
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    hydrate()
    return () => { cancelled = true }
  }, [])

  async function login(email: string, password: string): Promise<LoginResult> {
    // Use Supabase Auth client-side
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      throw new Error(error.message)
    }

    if (data.session?.access_token) {
      setSession(data.session.access_token, data.session.expires_at)
    }

    // Fetch member profile and admin status
    const me = await api<{ member: Member; isAdmin?: boolean; adminRole?: string | null }>('/auth/me', { auth: true })
    setMember(me.member)
    setIsAdmin(me.isAdmin === true)
    setAdminRole(me.adminRole ?? null)
    return { member: me.member, isAdmin: me.isAdmin === true }
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
  }

  return (
    <AuthContext.Provider value={{ member, isAdmin, adminRole, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
