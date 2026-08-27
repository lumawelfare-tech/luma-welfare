import { useEffect, useState } from 'react'
import { api, ApiError } from '../../lib/api'
import { useHead } from '../../lib/seo'
import { useToast } from '../../components/Toast'
import { WebhookSettings } from '../../components/WebhookSettings'

type Setting = { key: string; value: unknown; description: string | null }

export function AdminSettings() {
  useHead('Settings', undefined, { noindex: true })
  const { addToast } = useToast()
  const [settings, setSettings] = useState<Setting[]>([])
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState('general')

  // 2FA state
  const [twoFAEnabled, setTwoFAEnabled] = useState(false)
  const [twoFALoading, setTwoFALoading] = useState(true)
  const [setupData, setSetupData] = useState<{ secret: string; otpauth_url: string; current_code: string } | null>(null)
  const [verifyCode, setVerifyCode] = useState('')
  const [verifyError, setVerifyError] = useState('')
  const [verifySuccess, setVerifySuccess] = useState('')
  const [twoFAAction, setTwoFAAction] = useState<'idle' | 'setup' | 'enable' | 'disable'>('idle')
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([])
  const [showRecoveryCodes, setShowRecoveryCodes] = useState(false)

  async function load() {
    try {
      const d = await api<Record<string, unknown>>('/settings?resource=settings', { auth: true })
      const rows: Setting[] = []
      for (const [key, value] of Object.entries(d)) {
        if (key === 'error') continue
        rows.push({ key, value: typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value ?? ''), description: null })
      }
      setSettings(rows)
      const edits: Record<string, string> = {}
      for (const r of rows) edits[r.key] = r.value as string
      setEditing(edits)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load settings.')
    }
  }

  async function load2FA() {
    try {
      const d = await api<{ two_factor_enabled: boolean }>('/admin/2fa', { auth: true })
      setTwoFAEnabled(d.two_factor_enabled)
    } catch { /* ignore */ }
    finally { setTwoFALoading(false) }
  }

  useEffect(() => { load(); load2FA() }, [])

  async function save() {
    setSaving(true)
    setError(null)
    try {
      for (const s of settings) {
        if (editing[s.key] !== (s.value as string)) {
          await api(`/admin/settings`, { method: 'PATCH', auth: true, body: { key: s.key, value: editing[s.key] } })
        }
      }
      addToast('success', 'Settings saved.')
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save settings.')
    } finally {
      setSaving(false)
    }
  }

  async function handleSetup2FA() {
    setVerifyError('')
    setVerifySuccess('')
    setRecoveryCodes([])
    try {
      const d = await api<{ secret: string; otpauth_url: string; current_code: string }>('/admin/2fa?action=setup', { method: 'POST', auth: true })
      setSetupData(d)
      setTwoFAAction('setup')
    } catch (err) {
      setVerifyError(err instanceof ApiError ? err.message : 'Could not set up 2FA.')
    }
  }

  async function handleEnable2FA() {
    if (!verifyCode || verifyCode.length !== 6) {
      setVerifyError('Enter the 6-digit code from your authenticator app.')
      return
    }
    setVerifyError('')
    try {
      const d = await api<{ message: string; recovery_codes: string[] }>('/admin/2fa?action=enable', {
        method: 'POST', auth: true, body: { code: verifyCode },
      })
      setRecoveryCodes(d.recovery_codes)
      setShowRecoveryCodes(true)
      setTwoFAEnabled(true)
      setTwoFAAction('idle')
      setSetupData(null)
      setVerifyCode('')
      setVerifySuccess('2FA enabled successfully.')
    } catch (err) {
      setVerifyError(err instanceof ApiError ? err.message : 'Could not enable 2FA.')
    }
  }

  async function handleDisable2FA() {
    if (!verifyCode) {
      setVerifyError('Enter your TOTP code or a recovery code to disable 2FA.')
      return
    }
    setVerifyError('')
    try {
      await api('/admin/2fa?action=disable', {
        method: 'POST', auth: true, body: { code: verifyCode },
      })
      setTwoFAEnabled(false)
      setTwoFAAction('idle')
      setVerifyCode('')
      setVerifySuccess('2FA disabled.')
    } catch (err) {
      setVerifyError(err instanceof ApiError ? err.message : 'Could not disable 2FA.')
    }
  }

  const tabs = ['general', 'security', 'webhooks']
  const filtered = tab === 'general'
    ? settings.filter(s => ['org_contact', 'stats', 'mpesa'].includes(s.key))
    : []

  const keyLabels: Record<string, string> = {
    org_contact: 'Organization Contact',
    stats: 'Public Statistics',
    mpesa: 'M-Pesa Configuration',
  }

  // Hide save button for non-general tabs
  const showSave = tab === 'general'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          <p className="text-sm text-gray-500 mt-1">Manage platform configuration and security.</p>
        </div>
        {showSave && (
          <button onClick={save} disabled={saving} className="rounded-lg bg-luma-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-luma-800 disabled:opacity-60 transition-colors">
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        )}
      </div>

      {error && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg border border-gray-200 bg-white p-1">
        {tabs.map(t => (
          <button key={t} onClick={() => setTab(t)} className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${tab === t ? 'bg-luma-50 text-luma-700' : 'text-gray-500 hover:bg-gray-50'}`}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* General Settings */}
      {tab === 'general' && (
        <div className="space-y-4">
          {filtered.map(s => (
            <div key={s.key} className="rounded-xl border border-gray-200 bg-white p-4">
              <label className="text-sm font-medium text-gray-700">{keyLabels[s.key] ?? s.key}</label>
              <textarea
                value={editing[s.key] ?? ''}
                onChange={(e) => setEditing(ed => ({ ...ed, [s.key]: e.target.value }))}
                rows={4}
                className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-xs outline-none focus:border-luma-500"
              />
            </div>
          ))}
          {filtered.length === 0 && <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-gray-500">No settings in this section.</div>}
        </div>
      )}

      {/* Webhooks */}
      {tab === 'webhooks' && (
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <WebhookSettings />
        </div>
      )}

      {/* Security Settings */}
      {tab === 'security' && (
        <div className="space-y-4">
          {/* 2FA Section */}
          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Two-Factor Authentication (2FA)</h3>
                <p className="mt-1 text-sm text-gray-500">
                  {twoFAEnabled
                    ? '2FA is enabled. Your account requires a TOTP code in addition to your password.'
                    : 'Add an extra layer of security to your admin account with TOTP-based two-factor authentication.'}
                </p>
              </div>
              <div className={`flex h-8 w-8 items-center justify-center rounded-full ${twoFAEnabled ? 'bg-emerald-100' : 'bg-gray-100'}`}>
                {twoFAEnabled ? (
                  <svg className="h-4 w-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                ) : (
                  <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0-10.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.75c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.249-8.25-3.286z" /></svg>
                )}
              </div>
            </div>

            {twoFALoading && <div className="mt-4 text-sm text-gray-400">Loading…</div>}

            {!twoFALoading && !twoFAEnabled && twoFAAction === 'idle' && (
              <button onClick={handleSetup2FA} className="mt-4 rounded-lg bg-luma-700 px-4 py-2 text-sm font-semibold text-white hover:bg-luma-800 transition-colors">
                Enable 2FA
              </button>
            )}

            {!twoFALoading && twoFAEnabled && twoFAAction === 'idle' && (
              <div className="mt-4">
                <button onClick={() => { setTwoFAAction('disable'); setVerifyCode(''); setVerifyError(''); setVerifySuccess('') }} className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors">
                  Disable 2FA
                </button>
              </div>
            )}

            {/* Setup: Show QR/secret + verify */}
            {twoFAAction === 'setup' && setupData && (
              <div className="mt-4 space-y-4">
                <div className="rounded-lg bg-gray-50 border border-gray-200 p-4">
                  <p className="text-sm font-medium text-gray-700 mb-2">1. Add to your authenticator app</p>
                  <p className="text-xs text-gray-500 mb-3">Scan this QR code URL or enter the secret manually:</p>
                  <div className="rounded-lg bg-white border border-gray-200 px-3 py-2 mb-2">
                    <code className="text-xs text-gray-700 break-all">{setupData.otpauth_url}</code>
                  </div>
                  <div className="rounded-lg bg-white border border-gray-200 px-3 py-2">
                    <span className="text-xs text-gray-500">Secret: </span>
                    <code className="text-sm font-mono font-semibold text-gray-900">{setupData.secret}</code>
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">2. Enter the 6-digit code from your app</p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={verifyCode}
                      onChange={(e) => { setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setVerifyError('') }}
                      placeholder="000000"
                      maxLength={6}
                      className="w-32 rounded-lg border border-gray-300 px-3 py-2 text-center font-mono text-lg tracking-widest focus:border-luma-500 focus:ring-1 focus:ring-luma-500"
                      aria-label="2FA verification code"
                    />
                    <button onClick={handleEnable2FA} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors">
                      Verify & Enable
                    </button>
                    <button onClick={() => { setTwoFAAction('idle'); setSetupData(null); setVerifyCode('') }} className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
                      Cancel
                    </button>
                  </div>
                </div>
                {verifyError && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{verifyError}</div>}
              </div>
            )}

            {/* Disable: verify to disable */}
            {twoFAAction === 'disable' && (
              <div className="mt-4 space-y-3">
                <p className="text-sm text-gray-600">Enter your TOTP code or a recovery code to disable 2FA:</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={verifyCode}
                    onChange={(e) => { setVerifyCode(e.target.value); setVerifyError('') }}
                    placeholder="6-digit code or recovery code"
                    className="w-48 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-luma-500 focus:ring-1 focus:ring-luma-500"
                    aria-label="2FA code or recovery code"
                  />
                  <button onClick={handleDisable2FA} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 transition-colors">
                    Disable 2FA
                  </button>
                  <button onClick={() => { setTwoFAAction('idle'); setVerifyCode('') }} className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
                    Cancel
                  </button>
                </div>
                {verifyError && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{verifyError}</div>}
              </div>
            )}

            {verifySuccess && <div className="mt-3 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-700">{verifySuccess}</div>}
          </div>

          {/* Recovery Codes */}
          {showRecoveryCodes && recoveryCodes.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
              <div className="flex items-center gap-2 mb-3">
                <svg className="h-5 w-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
                <h3 className="text-sm font-semibold text-amber-800">Save Your Recovery Codes</h3>
              </div>
              <p className="text-sm text-amber-700 mb-3">Store these codes safely. Each code can be used once if you lose access to your authenticator app.</p>
              <div className="grid grid-cols-2 gap-2">
                {recoveryCodes.map((code, i) => (
                  <div key={i} className="rounded-lg bg-white border border-amber-200 px-3 py-1.5 font-mono text-sm text-gray-900">{code}</div>
                ))}
              </div>
              <button onClick={() => setShowRecoveryCodes(false)} className="mt-3 text-xs font-medium text-amber-700 hover:text-amber-800">
                I've saved these codes
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
