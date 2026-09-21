import type { ReactNode } from 'react'
import { useAuth } from '../context/AuthContext'
import { AppBootLoader } from './AppBootLoader'

/**
 * Shows the branded full-screen boot loader only while AuthProvider
 * is hydrating the initial session. Route Suspense keeps using PageLoader.
 */
export function AuthBootGate({ children }: { children: ReactNode }) {
  const { loading } = useAuth()

  if (loading) {
    return <AppBootLoader message="Preparing your session…" />
  }

  return <>{children}</>
}
