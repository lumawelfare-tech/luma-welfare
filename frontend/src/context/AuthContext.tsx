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

type AuthState = {
  member: Member | null
  loading: boolean
  login: (email: string, password: string) => Promise<Member | null>
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
        const data = await api<{ member: Member }>('/auth/me', { auth: true })
        if (!cancelled) setMember(data.member)
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

  async function login(email: string, password: string): Promise<Member | null> {
    const data = await api<{ session: { access_token: string }; member: Member }>(
      '/auth/login',
      { method: 'POST', body: { email, password } },
    )
    if (data.session?.access_token) {
      setSession(data.session.access_token)
      setMember(data.member)
      return data.member
    }
    return null
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
  }

  return (
    <AuthContext.Provider value={{ member, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}