import { useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { useAuth } from '../context/AuthContext'
import { api, ApiError } from '../lib/api'
import { useHead } from '../lib/seo'
import { AuthCard, alertErrorClass, alertSuccessClass, alertWarnClass } from '../components/PageHero'
import { Button, Input } from '../components/ui'
import { lumaPress } from '../lib/lumaMotion'
import { safeInternalPath } from '../lib/sanitize'

const MotionButton = motion.create(Button)

export function Login() {
  useHead('Login', undefined, { noindex: true })
  const { login, signInWithGoogle, member, isAdmin } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = safeInternalPath((location.state as { from?: string })?.from, '/dashboard')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(() => {
    const googleError = sessionStorage.getItem('google_auth_error')
    if (googleError) {
      sessionStorage.removeItem('google_auth_error')
      return googleError
    }
    return null
  })
  const [busy, setBusy] = useState(false)
  const [googleBusy, setGoogleBusy] = useState(false)
  const [searchParams] = useSearchParams()
  const passwordReset = searchParams.get('passwordReset') === 'true' || (location.state as Record<string, unknown>)?.passwordReset === true
  const justVerified = (location.state as { verified?: boolean } | null)?.verified === true

  // Unverified email — surfaced by AuthContext as EMAIL_NOT_CONFIRMED
  const [needsVerification, setNeedsVerification] = useState(false)

  // 2FA state
  const [requires2fa, setRequires2fa] = useState(false)
  const [totpCode, setTotpCode] = useState('')
  const [verifying2fa, setVerifying2fa] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setNeedsVerification(false)
    setBusy(true)
    try {
      const result = await login(email.trim(), password)
      if (result.requires2fa) {
        setRequires2fa(true)
        setBusy(false)
        return
      }
      // Pending (unverified) accounts can only reach here when Supabase
      // confirmations are disabled in the hosted project. Either way, route
      // them to the verification screen so the OTP flow can activate them.
      if (result.member && result.member.status === 'pending_approval') {
        navigate('/verify-email', { state: { email: email.trim() }, replace: true })
        return
      }
      if (result.isAdmin) {
        navigate('/admin', { replace: true })
      } else {
        navigate(from, { replace: true })
      }
    } catch (err) {
      if (err instanceof ApiError && err.code === 'EMAIL_NOT_CONFIRMED') {
        setNeedsVerification(true)
        setError(null)
      } else {
        setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.')
      }
    } finally {
      setBusy(false)
    }
  }

  async function handleVerify2FA() {
    if (!totpCode || totpCode.length !== 6) {
      setError('Enter the 6-digit code from your authenticator app.')
      return
    }
    setVerifying2fa(true)
    setError(null)
    try {
      await api('/admin/2fa?action=verify', {
        method: 'POST',
        auth: true,
        body: { code: totpCode },
      })
      // 2FA verified — now navigate
      navigate('/admin', { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Invalid code. Please try again.')
    } finally {
      setVerifying2fa(false)
    }
  }

  async function handleGoogle() {
    setError(null)
    setGoogleBusy(true)
    try {
      await signInWithGoogle()
      // User will be redirected to Google, then back to the app
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed. Try again.')
      setGoogleBusy(false)
    }
  }

  if (member) {
    navigate(isAdmin ? '/admin' : '/dashboard', { replace: true })
  }

  const reduceMotion = useReducedMotion()

  return (
    <AuthCard>
          {/* Logo */}
          <div className="text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-luma-700 font-bold text-white text-lg shadow-sm shadow-luma-700/30">
              LW
            </span>
            <h1 className="mt-4 text-2xl font-bold text-gray-900">{requires2fa ? 'Two-Factor Verification' : 'Welcome Back'}</h1>
            <p className="mt-2 text-sm text-gray-600">
              {requires2fa
                ? 'Enter the 6-digit code from your authenticator app'
                : 'Sign in to your Luma Welfare account'}
            </p>
          </div>

          {/* 2FA Verification */}
          {requires2fa ? (
            <div className="mt-8 space-y-4">
              <Input
                label="Verification Code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={totpCode}
                onChange={(e) => { setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(null) }}
                placeholder="000000"
                maxLength={6}
                autoFocus
                aria-label="Two-factor authentication code"
                className="text-center font-mono text-xl tracking-[0.3em]"
              />

              {error && (
                <div className={alertErrorClass} role="alert">{error}</div>
              )}

              <MotionButton
                type="button"
                variant="primary"
                size="lg"
                block
                onClick={handleVerify2FA}
                disabled={verifying2fa || totpCode.length !== 6}
                loading={verifying2fa}
                whileTap={lumaPress.default(Boolean(reduceMotion))}
              >
                {verifying2fa ? 'Verifying…' : 'Verify'}
              </MotionButton>

              <Button
                type="button"
                variant="ghost"
                block
                onClick={() => { setRequires2fa(false); setTotpCode(''); setError(null) }}
                className="text-gray-600 hover:text-gray-800"
              >
                Use a different account
              </Button>
            </div>
          ) : (
            <>
              <form onSubmit={submit} className="mt-8 space-y-4" noValidate>
                <Input
                  id="login-email"
                  label="Email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(null) }}
                  placeholder="you@example.com"
                  error={error && !needsVerification ? error : undefined}
                />
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <label htmlFor="login-password" className="text-sm font-medium text-gray-700">Password</label>
                    <Link to="/forgot-password" className="text-xs font-medium text-luma-700 hover:text-luma-800 hover:underline">
                      Forgot password?
                    </Link>
                  </div>
                  <Input
                    id="login-password"
                    type="password"
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setError(null) }}
                    placeholder="••••••••"
                    aria-invalid={error && !needsVerification ? true : undefined}
                    aria-describedby={error && !needsVerification ? 'login-email-error' : undefined}
                  />
                </div>

                {passwordReset && (
                  <div className={alertSuccessClass} role="status">
                    Password reset successful. You can now sign in with your new password.
                  </div>
                )}

                {justVerified && (
                  <div className={alertSuccessClass} role="status">
                    Email verified successfully. You can now sign in to your account.
                  </div>
                )}

                {needsVerification && (
                  <div className={alertWarnClass} role="alert">
                    <p className="font-medium">Your email isn&apos;t verified yet.</p>
                    <p className="mt-1 text-xs">
                      Enter the 6-digit code we sent to {email.trim()} or request a new one.
                    </p>
                    <button
                      type="button"
                      onClick={() => navigate('/verify-email', { state: { email: email.trim() } })}
                      className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-amber-950 hover:underline"
                    >
                      Verify your email →
                    </button>
                  </div>
                )}

                <MotionButton
                  type="submit"
                  data-testid="login-submit"
                  variant="primary"
                  size="lg"
                  block
                  disabled={busy || googleBusy}
                  loading={busy}
                  whileTap={lumaPress.default(Boolean(reduceMotion))}
                >
                  {busy ? 'Signing in…' : 'Sign In'}
                </MotionButton>
              </form>

              <div className="my-6 flex items-center gap-3">
                <div className="h-px flex-1 bg-gray-200/80" />
                <span className="text-xs font-medium text-gray-500 uppercase">or</span>
                <div className="h-px flex-1 bg-gray-200/80" />
              </div>

              <MotionButton
                type="button"
                variant="secondary"
                size="lg"
                block
                onClick={handleGoogle}
                disabled={busy || googleBusy}
                loading={googleBusy}
                whileTap={lumaPress.default(Boolean(reduceMotion))}
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                {googleBusy ? 'Connecting…' : 'Continue with Google'}
              </MotionButton>
            </>
          )}

          {!requires2fa && (
            <p className="mt-6 text-center text-sm text-gray-600">
              Not a member yet?{' '}
              <Link to="/register" className="font-semibold text-luma-800 hover:underline">
                Join now
              </Link>
            </p>
          )}
    </AuthCard>
  )
}
