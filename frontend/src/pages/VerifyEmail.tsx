import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { api, ApiError } from '../lib/api'

const OTP_LENGTH = 6
const RESEND_SECONDS = 60

type Phase = 'input' | 'verifying' | 'success'

function messageFor(err: unknown): string {
  if (!(err instanceof ApiError)) return 'Network error. Check your connection and try again.'
  switch (err.code) {
    case 'INVALID_CODE':
      return err.message
    case 'EXPIRED_CODE':
      return 'This code has expired. Request a new one below.'
    case 'TOO_MANY_ATTEMPTS':
      return err.message
    case 'RESEND_COOLDOWN':
    case 'RATE_LIMITED':
      return err.message
    case 'EMAIL_FAILED':
      return 'We could not send the verification email. Please try resending.'
    case 'NETWORK':
      return 'Network error. Check your connection and try again.'
    default:
      return err.message || 'Something went wrong. Try again.'
  }
}

export function VerifyEmail() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()

  const stateEmail = (location.state as { email?: string } | null)?.email
  const initialEmail = stateEmail ?? searchParams.get('email') ?? ''

  const [email, setEmail] = useState(initialEmail)
  const [emailInput, setEmailInput] = useState('')
  const [code, setCode] = useState<string[]>(Array(OTP_LENGTH).fill(''))
  const [phase, setPhase] = useState<Phase>('input')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [resending, setResending] = useState(false)
  const [countdown, setCountdown] = useState(initialEmail ? RESEND_SECONDS : 0)

  const inputsRef = useRef<(HTMLInputElement | null)[]>([])

  // Countdown ticker
  useEffect(() => {
    if (countdown <= 0) return
    const t = setInterval(() => setCountdown((s) => (s > 0 ? s - 1 : 0)), 1000)
    return () => clearInterval(t)
  }, [countdown])

  const focusBox = useCallback((index: number) => {
    const target = Math.max(0, Math.min(OTP_LENGTH - 1, index))
    inputsRef.current[target]?.focus()
    inputsRef.current[target]?.select()
  }, [])

  const verify = useCallback(
    async (fullCode: string) => {
      if (!email || fullCode.length !== OTP_LENGTH) return
      setPhase('verifying')
      setError(null)
      setNotice(null)
      try {
        const data = await api<{ verified?: boolean; alreadyVerified?: boolean }>(
          '/auth/verify-email',
          { method: 'POST', body: { email, code: fullCode } },
        )
        if (data.verified || data.alreadyVerified) {
          setPhase('success')
          setTimeout(() => navigate('/login', { state: { verified: true } }), 1600)
        }
      } catch (err) {
        setPhase('input')
        setError(messageFor(err))
        setCode(Array(OTP_LENGTH).fill(''))
        focusBox(0)
      }
    },
    [email, navigate, focusBox],
  )

  // Distribute digits across boxes starting at `start` (handles typing + autofill)
  const distribute = useCallback(
    (start: number, raw: string) => {
      const digits = raw.replace(/\D/g, '')
      if (!digits) return
      setCode((prev) => {
        const next = [...prev]
        let i = start
        for (const d of digits) {
          if (i >= OTP_LENGTH) break
          next[i] = d
          i++
        }
        const filled = next.join('')
        if (filled.length === OTP_LENGTH && !filled.includes('')) {
          // auto-submit once complete
          setTimeout(() => verify(filled), 0)
        } else {
          focusBox(i)
        }
        return next
      })
    },
    [verify, focusBox],
  )

  function handleChange(index: number, value: string) {
    setError(null)
    if (value.length > 1) {
      distribute(index, value)
      return
    }
    setCode((prev) => {
      const next = [...prev]
      next[index] = value
      const filled = next.join('')
      if (filled.length === OTP_LENGTH && !filled.includes('')) {
        setTimeout(() => verify(filled), 0)
      } else if (value) {
        focusBox(index + 1)
      }
      return next
    })
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace') {
      e.preventDefault()
      setCode((prev) => {
        const next = [...prev]
        if (next[index]) {
          next[index] = ''
        } else if (index > 0) {
          next[index - 1] = ''
          focusBox(index - 1)
        }
        return next
      })
    } else if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault()
      focusBox(index - 1)
    } else if (e.key === 'ArrowRight' && index < OTP_LENGTH - 1) {
      e.preventDefault()
      focusBox(index + 1)
    }
  }

  function handlePaste(index: number, e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault()
    const text = e.clipboardData.getData('text')
    if (!/\d/.test(text)) return
    setError(null)
    // Always fill from the first box for a full-code paste
    distribute(0, text)
    // Mark index as intentionally used in the closure context
    void index
  }

  async function resend() {
    if (resending || countdown > 0) return
    setResending(true)
    setError(null)
    setNotice(null)
    try {
      const data = await api<{ sent?: boolean; alreadyVerified?: boolean; retryAfter?: number }>(
        '/auth/verify-email?action=resend',
        { method: 'POST', body: { email } },
      )
      if (data.alreadyVerified) {
        setPhase('success')
        setTimeout(() => navigate('/login', { state: { verified: true } }), 1600)
        return
      }
      setCode(Array(OTP_LENGTH).fill(''))
      focusBox(0)
      setNotice(`A new code was sent to ${email}.`)
      setCountdown(data.retryAfter ?? RESEND_SECONDS)
    } catch (err) {
      if (err instanceof ApiError && err.retryAfter) {
        setCountdown(err.retryAfter)
      }
      setError(messageFor(err))
    } finally {
      setResending(false)
    }
  }

  async function sendToEmail(e: React.FormEvent) {
    e.preventDefault()
    const target = emailInput.trim().toLowerCase()
    if (!target) return
    setResending(true)
    setError(null)
    try {
      await api('/auth/verify-email?action=resend', { method: 'POST', body: { email: target } })
      setEmail(target)
      setNotice(`If an account exists for ${target}, a verification code is on its way.`)
      setCountdown(RESEND_SECONDS)
    } catch (err) {
      setError(messageFor(err))
    } finally {
      setResending(false)
    }
  }

  // ── No email known: ask for it, then behave like the resend flow ──────────
  if (!email) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center py-16">
        <div className="w-full max-w-md px-4">
          <div className="rounded-3xl border border-gray-200 bg-white p-8 shadow-xl">
            <div className="text-center">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-luma-700 font-bold text-white text-lg">
                LW
              </span>
              <h1 className="mt-4 text-2xl font-bold text-gray-900">Verify Your Email</h1>
              <p className="mt-2 text-sm text-gray-500">
                Enter the email you registered with and we will send you a 6-digit code.
              </p>
            </div>
            <form onSubmit={sendToEmail} className="mt-8 space-y-4">
              <div>
                <label htmlFor="verify-email" className="mb-1.5 block text-sm font-medium text-gray-700">
                  Email
                </label>
                <input
                  id="verify-email"
                  type="email"
                  required
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none focus:border-luma-500 focus:bg-white focus:ring-2 focus:ring-luma-500/20 transition-all"
                />
              </div>
              {error && <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
              {notice && <div className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">{notice}</div>}
              <button
                disabled={resending}
                className="w-full rounded-xl bg-luma-700 py-3 text-sm font-bold text-white hover:bg-luma-800 disabled:opacity-60 transition-all shadow-sm"
              >
                {resending ? 'Sending…' : 'Send Code'}
              </button>
            </form>
            <p className="mt-6 text-center text-sm text-gray-500">
              <Link to="/register" className="font-semibold text-luma-700 hover:underline">
                Back to registration
              </Link>
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center py-16">
      <div className="w-full max-w-md px-4">
        <div className="rounded-3xl border border-gray-200 bg-white p-8 shadow-xl">
          {/* Header */}
          <div className="text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-luma-700 font-bold text-white text-lg">
              LW
            </span>
            <h1 className="mt-4 text-2xl font-bold text-gray-900">
              {phase === 'success' ? 'Email Verified!' : 'Verify Your Email'}
            </h1>
            {phase !== 'success' && (
              <p className="mt-2 text-sm text-gray-500">
                Enter the 6-digit code sent to{' '}
                <span className="font-semibold text-gray-700">{email}</span>
              </p>
            )}
          </div>

          {phase === 'success' ? (
            <div className="mt-8 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-green-600">
                <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="mt-4 text-sm text-gray-600">
                Your email is verified and your account is active. Redirecting you to sign in…
              </p>
              <button
                onClick={() => navigate('/login', { state: { verified: true } })}
                className="mt-6 w-full rounded-xl bg-luma-700 py-3 text-sm font-bold text-white hover:bg-luma-800 transition-all shadow-sm"
              >
                Go to Sign In
              </button>
            </div>
          ) : (
            <>
              {/* OTP boxes */}
              <div className="mt-8 flex justify-center gap-2 sm:gap-3">
                {code.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => {
                      inputsRef.current[i] = el
                    }}
                    type="text"
                    inputMode="numeric"
                    autoComplete={i === 0 ? 'one-time-code' : 'off'}
                    aria-label={`Digit ${i + 1}`}
                    maxLength={OTP_LENGTH}
                    disabled={phase === 'verifying'}
                    value={digit}
                    autoFocus={i === 0}
                    onChange={(e) => handleChange(i, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(i, e)}
                    onPaste={(e) => handlePaste(i, e)}
                    onFocus={(e) => e.target.select()}
                    className={`h-12 w-10 sm:h-14 sm:w-12 rounded-xl border bg-gray-50 text-center font-mono text-xl font-bold text-gray-900 outline-none transition-all focus:bg-white focus:ring-2 ${
                      error
                        ? 'border-red-300 focus:border-red-400 focus:ring-red-500/20'
                        : 'border-gray-200 focus:border-luma-500 focus:ring-luma-500/20'
                    } disabled:opacity-60`}
                  />
                ))}
              </div>

              <p className="mt-3 text-center text-xs text-gray-400">
                Your code expires in 10 minutes.
              </p>

              {error && (
                <div className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
              )}
              {notice && (
                <div className="mt-4 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">{notice}</div>
              )}

              {/* Verify */}
              <button
                onClick={() => verify(code.join(''))}
                disabled={phase === 'verifying' || code.join('').length !== OTP_LENGTH}
                className="mt-6 w-full rounded-xl bg-luma-700 py-3 text-sm font-bold text-white hover:bg-luma-800 disabled:opacity-60 transition-all shadow-sm"
              >
                {phase === 'verifying' ? 'Verifying…' : 'Verify'}
              </button>

              {/* Resend */}
              <div className="mt-5 text-center">
                <p className="text-sm text-gray-500">Didn&apos;t receive the code?</p>
                <button
                  onClick={resend}
                  disabled={resending || countdown > 0}
                  className="mt-1 text-sm font-semibold text-luma-700 hover:text-luma-800 hover:underline disabled:text-gray-400 disabled:no-underline disabled:cursor-not-allowed"
                >
                  {resending
                    ? 'Sending…'
                    : countdown > 0
                      ? `Resend code in ${countdown}s`
                      : 'Resend Code'}
                </button>
              </div>

              <p className="mt-6 text-center text-sm text-gray-500">
                Wrong email?{' '}
                <button
                  onClick={() => {
                    setEmail('')
                    setCode(Array(OTP_LENGTH).fill(''))
                    setError(null)
                    setNotice(null)
                  }}
                  className="font-semibold text-luma-700 hover:underline"
                >
                  Change it
                </button>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
