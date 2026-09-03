import { useEffect, useState, useRef } from 'react'
import { api, ApiError } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'

export function Profile() {
  const { member } = useAuth()
  const [form, setForm] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Password change
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)
  const [passwordError, setPasswordError] = useState('')
  const [passwordSuccess, setPasswordSuccess] = useState(false)

  // eslint-disable-next-line oxc/react/set-state-in-effect — deriving form/avatarPreview from member prop; legitimate prop→state sync
  useEffect(() => {
    if (member) {
      // eslint-disable-next-line oxc/react/set-state-in-effect — deriving form state from member prop
      setForm({
        fullName: member.full_name ?? '',
        idNumber: (member.id_number as string) ?? '',
        altPhone: (member.alt_phone as string) ?? '',
        county: (member.county as string) ?? '',
        location: (member.location as string) ?? '',
        occupation: (member.occupation as string) ?? '',
      })
      setAvatarPreview((member as any).photo_url ?? null)
    }
  }, [member])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaved(false)
    setSaving(true)
    try {
      await api('/member/profile', { method: 'PATCH', auth: true, body: form })
      setSaved(true)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save your profile.')
    } finally {
      setSaving(false)
    }
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    if (file.size > 5 * 1024 * 1024) {
      setError('Profile photo must be under 5MB.')
      return
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      setError('Only JPG, PNG, and WebP images are allowed.')
      return
    }

    setUploadingAvatar(true)
    setError(null)
    try {
      // Read file as base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
          const result = reader.result as string
          resolve(result.split(',')[1])
        }
        reader.onerror = reject
        reader.readAsDataURL(file)
      })

      const d = await api<{ photo_url: string }>('/member/profile?action=avatar', {
        method: 'POST',
        auth: true,
        body: {
          fileName: file.name,
          fileData: base64,
          fileType: file.type,
        },
      })

      setAvatarPreview(d.photo_url)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to upload photo.')
    } finally {
      setUploadingAvatar(false)
    }
  }

  const memberName = member?.full_name ?? ''
  const initials = memberName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
  const displayAvatar = avatarPreview ?? (member as any)?.photo_url

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Profile</h1>
        <p className="mt-1 text-sm text-gray-500">Keep your information up to date.</p>
      </div>

      {/* Profile header */}
      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6">
        <div className="flex items-center gap-4">
          {/* Avatar */}
          <div className="relative group">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="relative flex h-16 w-16 items-center justify-center rounded-full bg-luma-100 text-xl font-bold text-luma-700 overflow-hidden hover:ring-2 hover:ring-luma-300 transition-all"
              disabled={uploadingAvatar}
            >
              {displayAvatar ? (
                <img src={displayAvatar} alt="Profile" className="h-full w-full object-cover" />
              ) : (
                initials
              )}
              {/* Overlay on hover */}
              <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                {uploadingAvatar ? (
                  <svg className="h-5 w-5 text-white animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                ) : (
                  <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" /><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" /></svg>
                )}
              </div>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".jpg,.jpeg,.png,.webp"
              onChange={handleAvatarUpload}
              className="hidden"
            />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{member?.full_name ?? 'Member'}</h2>
            <p className="text-sm text-gray-500">{member?.email ?? ''}</p>
            <div className="mt-1 flex items-center gap-2">
              <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                member?.status === 'active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-50 text-gray-600 border-gray-200'
              }`}>
                {member?.status ?? 'unknown'}
              </span>
              {member?.membership_number && (
                <span className="text-xs text-gray-400">#{member.membership_number}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Edit form */}
      <form onSubmit={submit} className="mt-6 rounded-xl border border-gray-200 bg-white p-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Personal Information</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Full name</label>
            <input value={form.fullName ?? ''} onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))} className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-luma-500 focus:bg-white" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">ID number</label>
            <input value={form.idNumber ?? ''} onChange={(e) => setForm((f) => ({ ...f, idNumber: e.target.value }))} className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-luma-500 focus:bg-white" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Alternate phone</label>
            <input value={form.altPhone ?? ''} onChange={(e) => setForm((f) => ({ ...f, altPhone: e.target.value }))} className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-luma-500 focus:bg-white" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Occupation</label>
            <input value={form.occupation ?? ''} onChange={(e) => setForm((f) => ({ ...f, occupation: e.target.value }))} className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-luma-500 focus:bg-white" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">County</label>
            <input value={form.county ?? ''} onChange={(e) => setForm((f) => ({ ...f, county: e.target.value }))} className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-luma-500 focus:bg-white" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Location</label>
            <input value={form.location ?? ''} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-luma-500 focus:bg-white" />
          </div>
        </div>

        {error && <div className="mt-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}
        {saved && <div className="mt-4 rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700">Profile saved successfully.</div>}

        <button disabled={saving} className="mt-5 rounded-lg bg-luma-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-luma-800 disabled:opacity-60 transition-all">
          {saving ? 'Saving…' : 'Save Profile'}
        </button>
      </form>

      {/* Change Password */}
      <form onSubmit={async (e) => {
        e.preventDefault()
        setPasswordError('')
        setPasswordSuccess(false)

        if (!currentPassword) { setPasswordError('Current password is required.'); return }
        if (!newPassword) { setPasswordError('New password is required.'); return }
        if (newPassword.length < 8) { setPasswordError('New password must be at least 8 characters.'); return }
        if (!/[A-Za-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) { setPasswordError('New password must contain at least one letter and one number.'); return }
        if (newPassword !== confirmPassword) { setPasswordError('New passwords do not match.'); return }
        if (currentPassword === newPassword) { setPasswordError('New password must be different from current password.'); return }

        setChangingPassword(true)
        try {
          await api('/member/profile?action=password', {
            method: 'POST',
            auth: true,
            body: { currentPassword, newPassword },
          })
          setPasswordSuccess(true)
          setCurrentPassword('')
          setNewPassword('')
          setConfirmPassword('')
        } catch (err) {
          setPasswordError(err instanceof ApiError ? err.message : 'Could not change password.')
        } finally {
          setChangingPassword(false)
        }
      }} className="mt-6 rounded-xl border border-gray-200 bg-white p-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Change Password</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Current password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => { setCurrentPassword(e.target.value); setPasswordError(''); setPasswordSuccess(false) }}
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-luma-500 focus:bg-white"
            />
          </div>
          <div />
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">New password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => { setNewPassword(e.target.value); setPasswordError(''); setPasswordSuccess(false) }}
              placeholder="At least 8 characters"
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-luma-500 focus:bg-white"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Confirm new password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => { setConfirmPassword(e.target.value); setPasswordError(''); setPasswordSuccess(false) }}
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-luma-500 focus:bg-white"
            />
          </div>
        </div>
        {passwordError && <div className="mt-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{passwordError}</div>}
        {passwordSuccess && <div className="mt-4 rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700">Password changed successfully.</div>}
        <button disabled={changingPassword} className="mt-5 rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60 transition-all">
          {changingPassword ? 'Changing…' : 'Change Password'}
        </button>
      </form>
    </div>
  )
}
