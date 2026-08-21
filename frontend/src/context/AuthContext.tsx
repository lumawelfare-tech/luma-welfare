import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { api, getSession, setSession, clearSession } from '../lib/api'

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
      const session = getSession()
      if (!session) {
        setLoading(false)
        return
      }
      try {
        const data = await api<{ member: Member; isAdmin?: boolean; adminRole?: string | null }>('/auth/me', { auth: true })
        if (!cancelled) {
          setMember(data.member)
          setIsAdmin(data.isAdmin === true)
          setAdminRole(data.adminRole ?? null)
        }
      } catch {
        clearSession()
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    hydrate()
    return () => {
      cancelled = true
    }
  }, [])

  async function login(email: string, password: string): Promise<LoginResult> {
    const data = await api<{ session: { access_token: string }; member: Member }>(
      '/auth/login',
      { method: 'POST', body: { email, password } },
    )
    if (data.session?.access_token) {
      setSession(data.session.access_token)
      setMember(data.member)
      // After login, fetch admin status from /auth/me
      let userIsAdmin = false
      let userAdminRole: string | null = null
      try {
        const me = await api<{ isAdmin?: boolean; adminRole?: string | null }>('/auth/me', { auth: true })
        userIsAdmin = me.isAdmin === true
        userAdminRole = me.adminRole ?? null
      } catch {
        // Non-admin members — this is fine
      }
      setIsAdmin(userIsAdmin)
      setAdminRole(userAdminRole)
      return { member: data.member, isAdmin: userIsAdmin }
    }
    return { member: null, isAdmin: false }
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