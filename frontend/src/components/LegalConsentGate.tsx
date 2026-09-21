import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api, ApiError } from '../lib/api'
import { legalConfig } from '../config/legal'
import { useAuth } from '../context/AuthContext'

/**
 * Blocks member portal until Privacy/Terms versions match the current published versions.
 */
export function LegalConsentGate({ children }: { children: React.ReactNode }) {
  const { member, refreshMember } = useAuth()
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false)
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!member) return children

  const needsPrivacy = member.privacy_policy_version !== legalConfig.privacyPolicyVersion
  const needsTerms = member.terms_version !== legalConfig.termsVersion
  if (!needsPrivacy && !needsTerms) return children

  async function submit() {
    setError(null)
    if ((needsPrivacy && !acceptedPrivacy) || (needsTerms && !acceptedTerms)) {
      setError('Accept the updated Privacy Policy and Terms to continue.')
      return
    }
    setBusy(true)
    try {
      await api('/member/profile?action=accept-legal', {
        method: 'POST',
        auth: true,
        body: {
          privacyPolicyVersion: legalConfig.privacyPolicyVersion,
          termsVersion: legalConfig.termsVersion,
          acceptedPrivacy: true,
          acceptedTerms: true,
        },
      })
      await refreshMember()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not record acceptance. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-12">
      <div className="glass-card w-full max-w-lg p-6 sm:p-8" role="dialog" aria-labelledby="legal-reconsent-title">
        <h1 id="legal-reconsent-title" className="text-xl font-bold text-gray-900">
          Updated legal terms
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          {legalConfig.tradingName} updated its{' '}
          {needsPrivacy && needsTerms ? 'Privacy Policy and Terms & Conditions' : needsPrivacy ? 'Privacy Policy' : 'Terms & Conditions'}
          . Please review and accept the current versions to continue using your member account.
        </p>
        <ul className="mt-4 space-y-2 text-sm text-gray-700">
          {needsPrivacy ? (
            <li>
              Privacy Policy version <code className="text-xs">{legalConfig.privacyPolicyVersion}</code>
              {' — '}
              <Link className="text-luma-700 underline" to="/privacy" target="_blank" rel="noopener noreferrer">
                Read Privacy Policy
              </Link>
            </li>
          ) : null}
          {needsTerms ? (
            <li>
              Terms version <code className="text-xs">{legalConfig.termsVersion}</code>
              {' — '}
              <Link className="text-luma-700 underline" to="/terms" target="_blank" rel="noopener noreferrer">
                Read Terms &amp; Conditions
              </Link>
            </li>
          ) : null}
        </ul>
        <div className="mt-6 space-y-3">
          {needsPrivacy ? (
            <label className="flex items-start gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                className="mt-1"
                checked={acceptedPrivacy}
                onChange={(e) => setAcceptedPrivacy(e.target.checked)}
              />
              <span>I have read and accept the Privacy Policy ({legalConfig.privacyPolicyVersion}).</span>
            </label>
          ) : null}
          {needsTerms ? (
            <label className="flex items-start gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                className="mt-1"
                checked={acceptedTerms}
                onChange={(e) => setAcceptedTerms(e.target.checked)}
              />
              <span>I have read and accept the Terms &amp; Conditions ({legalConfig.termsVersion}).</span>
            </label>
          ) : null}
        </div>
        {error ? <p className="mt-3 text-sm text-red-700" role="alert">{error}</p> : null}
        <button
          type="button"
          disabled={busy}
          onClick={() => void submit()}
          className="mt-6 w-full rounded-lg bg-luma-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-luma-800 disabled:opacity-60"
        >
          {busy ? 'Saving…' : 'Accept and continue'}
        </button>
      </div>
    </div>
  )
}
