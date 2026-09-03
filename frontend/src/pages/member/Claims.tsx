import { useEffect, useState, useCallback, useRef } from 'react'
import { api, ApiError } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { ClaimTimeline } from '../../components/ClaimTimeline'

type Subscription = { id: string; status: string; packages: { code: string; name: string }[]; qualification?: { status: string } | null }
type Claim = {
  id: string
  claim_number: string
  claim_type: string | null
  amount_requested: number | null
  description: string | null
  status: string
  admin_notes: string | null
  created_at: string
  submitted_at: string | null
  decided_at: string | null
  paid_at: string | null
  packages: { code: string | null; name: string | null } | null
}
type ClaimDocument = {
  id: string
  document_type: string
  file_name: string
  file_url: string
  file_type: string | null
  size_bytes: number | null
  uploaded_at: string
  created_at: string
}

const statusStyles: Record<string, string> = {
  Draft: 'bg-gray-100 text-gray-600 border-gray-200',
  Submitted: 'bg-blue-50 text-blue-700 border-blue-200',
  'Under Review': 'bg-amber-50 text-amber-700 border-amber-200',
  'Additional Information Required': 'bg-orange-50 text-orange-700 border-orange-200',
  Approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Rejected: 'bg-red-50 text-red-700 border-red-200',
  Paid: 'bg-purple-50 text-purple-700 border-purple-200',
}

const claimTypes = [
  'Burial Support',
  'Hospital Insurance',
  'Education Support',
  'Business Support',
  'Building Support',
  'Land Purchase Support',
  'Farming Support',
  'Wedding Support',
  'Dowry/Ruracio Support',
  'Disaster Relief',
  'Youth Empowerment',
  'Senior Citizen Support',
  'Other',
]

export function Claims() {
  const { registrationFeePaid } = useAuth()
  const [claims, setClaims] = useState<Claim[]>([])
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // Submit form
  const [showForm, setShowForm] = useState(false)
  const [formSubId, setFormSubId] = useState('')
  const [formType, setFormType] = useState('')
  const [formDesc, setFormDesc] = useState('')
  const [formAmount, setFormAmount] = useState('')
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Detail modal
  const [detail, setDetail] = useState<Claim | null>(null)
  const [documents, setDocuments] = useState<ClaimDocument[]>([])
  const [uploading, setUploading] = useState(false)

  // Focus management
  const formRef = useRef<HTMLFormElement>(null)
  const detailRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    try {
      const [me, claimsData] = await Promise.all([
        api<{ subscriptions: Subscription[] }>('/auth/me', { auth: true }),
        api<{ claims: Claim[] }>('/member/claims', { auth: true }),
      ])
      setSubscriptions((me.subscriptions ?? []).filter((s: Subscription) => s.status === 'active'))
      setClaims(claimsData.claims ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load claims.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Focus management for form
  useEffect(() => {
    if (showForm && formRef.current) {
      const firstInput = formRef.current.querySelector('select, input, textarea') as HTMLElement
      if (firstInput) firstInput.focus()
    }
  }, [showForm])

  // Focus management for detail modal
  useEffect(() => {
    if (detail && detailRef.current) {
      detailRef.current.focus()
    }
  }, [detail])

  // Realtime: subscribe to claim status changes for the current member
  useEffect(() => {
    const channel = supabase
      .channel('member-claims-live')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'claims' }, () => {
        load() // Reload claims when any claim is updated
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'claims' }, () => {
        load() // Reload when a new claim appears (e.g. admin creates one)
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [load])

  function resetForm() {
    setFormSubId('')
    setFormType('')
    setFormDesc('')
    setFormAmount('')
    setFormError('')
    setShowForm(false)
  }

  async function submitClaim(e: React.FormEvent, submit: boolean) {
    e.preventDefault()
    setFormError('')
    if (!formSubId) { setFormError('Select a package.'); return }
    if (!formType) { setFormError('Select a claim type.'); return }
    if (!formDesc.trim()) { setFormError('Describe your claim.'); return }

    setSubmitting(true)
    try {
      await api('/member/claims', {
        method: 'POST',
        auth: true,
        body: {
          subscriptionId: formSubId,
          claimType: formType,
          description: formDesc.trim(),
          amountRequested: formAmount ? Number(formAmount) : undefined,
          submit,
        },
      })
      setNotice(submit ? 'Claim submitted for review.' : 'Claim saved as draft.')
      resetForm()
      await load()
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : 'Could not submit claim.')
    } finally {
      setSubmitting(false)
    }
  }

  async function viewDetail(claim: Claim) {
    setDetail(claim)
    setDocuments([])
    try {
      const d = await api<{ claim: Claim; documents: ClaimDocument[] }>(`/member/claims?id=${claim.id}`, { auth: true })
      setDocuments(d.documents ?? [])
    } catch {
      // Silently fail
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!detail || !e.target.files?.[0]) return
    const file = e.target.files[0]
    e.target.value = ''

    if (file.size > 10 * 1024 * 1024) {
      setError('File size must be under 10MB.')
      return
    }

    setUploading(true)
    try {
      const reader = new FileReader()
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string
          const base64Data = result.split(',')[1]
          resolve(base64Data)
        }
        reader.onerror = reject
        reader.readAsDataURL(file)
      })

      await api(`/member/claims/upload?claimId=${detail.id}`, {
        method: 'POST',
        auth: true,
        body: {
          fileName: file.name,
          fileData: base64,
          fileType: file.type,
          documentType: 'supporting_document',
        },
      })

      setNotice('Document uploaded successfully.')
      const d = await api<{ claim: Claim; documents: ClaimDocument[] }>(`/member/claims?id=${detail.id}`, { auth: true })
      setDocuments(d.documents ?? [])
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to upload document.')
    } finally {
      setUploading(false)
    }
  }

  if (!registrationFeePaid) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-8 max-w-6xl mx-auto">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-8 text-center">
          <h1 className="text-lg font-semibold text-gray-900">Registration Fee Required</h1>
          <p className="mt-2 text-sm text-gray-600">Please pay the registration fee before filing claims.</p>
        </div>
      </div>
    )
  }

  // Stats
  const submittedCount = claims.filter(c => c.status === 'Submitted' || c.status === 'Under Review').length
  const approvedCount = claims.filter(c => c.status === 'Approved' || c.status === 'Paid').length

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Claims</h1>
          <p className="mt-1 text-sm text-gray-500">Submit and track your welfare claims.</p>
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            disabled={subscriptions.length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-luma-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-luma-800 disabled:opacity-50 transition-colors min-h-[44px]"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            New Claim
          </button>
        )}
      </div>

      {notice && (
        <div className="mt-4 rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700 flex items-center gap-2">
          <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          {notice}
        </div>
      )}
      {error && (
        <div className="mt-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-center gap-2" role="alert">
          <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>
          <span className="flex-1">{error}</span>
          <button onClick={() => { setError(null); setLoading(true); load() }} className="font-medium underline flex-shrink-0 min-h-[44px] px-2">
            Retry
          </button>
        </div>
      )}

      {/* Quick stats */}
      {!loading && claims.length > 0 && (
        <div className="mt-6 grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-center">
            <div className="text-lg font-bold text-gray-900">{claims.length}</div>
            <div className="text-[10px] font-medium uppercase text-gray-400">Total</div>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-center">
            <div className="text-lg font-bold text-amber-700">{submittedCount}</div>
            <div className="text-[10px] font-medium uppercase text-amber-600">In Progress</div>
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-center">
            <div className="text-lg font-bold text-emerald-700">{approvedCount}</div>
            <div className="text-[10px] font-medium uppercase text-emerald-600">Approved</div>
          </div>
        </div>
      )}

      {/* Submit Form */}
      {showForm && (
        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6" role="region" aria-label="Claim submission form">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">File a Claim</h2>
            <button onClick={resetForm} className="text-sm text-gray-500 hover:text-gray-700 min-h-[44px] px-2" aria-label="Cancel claim submission">Cancel</button>
          </div>
          <p className="text-sm text-gray-500 mb-4">
            Describe your welfare claim. You can save as draft and upload documents before submitting.
          </p>
          <form ref={formRef} onSubmit={(e) => submitClaim(e, true)} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="claim-pkg" className="block text-sm font-medium text-gray-700 mb-1">Package *</label>
                <select
                  id="claim-pkg"
                  value={formSubId}
                  onChange={(e) => { setFormSubId(e.target.value); setFormError('') }}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-luma-500 focus:ring-1 focus:ring-luma-500 min-h-[44px]"
                  aria-required="true"
                >
                  <option value="">Select package</option>
                  {subscriptions.map(s => (
                    <option key={s.id} value={s.id}>{s.packages?.[0]?.name ?? 'Package'}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="claim-type" className="block text-sm font-medium text-gray-700 mb-1">Claim Type *</label>
                <select
                  id="claim-type"
                  value={formType}
                  onChange={(e) => { setFormType(e.target.value); setFormError('') }}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-luma-500 focus:ring-1 focus:ring-luma-500 min-h-[44px]"
                  aria-required="true"
                >
                  <option value="">Select type</option>
                  {claimTypes.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="claim-amt" className="block text-sm font-medium text-gray-700 mb-1">Amount Requested (KSh, optional)</label>
                <input
                  id="claim-amt"
                  type="number"
                  min="0"
                  value={formAmount}
                  onChange={(e) => setFormAmount(e.target.value)}
                  placeholder="e.g. 50000"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-luma-500 focus:ring-1 focus:ring-luma-500 min-h-[44px]"
                />
              </div>
            </div>
            <div>
              <label htmlFor="claim-desc" className="block text-sm font-medium text-gray-700 mb-1">Description *</label>
              <textarea
                id="claim-desc"
                value={formDesc}
                onChange={(e) => { setFormDesc(e.target.value); setFormError('') }}
                rows={4}
                placeholder="Describe your claim in detail — why you need support, relevant dates, circumstances…"
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-luma-500 focus:ring-1 focus:ring-luma-500 resize-none"
                aria-required="true"
              />
            </div>

            {formError && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700" role="alert">{formError}</div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-lg bg-luma-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-luma-800 disabled:opacity-50 transition-colors min-h-[44px]"
              >
                {submitting ? 'Submitting…' : 'Submit Claim'}
              </button>
              <button
                type="button"
                onClick={(e) => submitClaim(e, false)}
                disabled={submitting}
                className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors min-h-[44px]"
              >
                Save as Draft
              </button>
            </div>
          </form>
        </div>
      )}

      {loading && (
        <div className="mt-8 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 rounded-lg bg-gray-100 animate-pulse" />
          ))}
        </div>
      )}

      {!loading && claims.length === 0 && (
        <div className="mt-8 rounded-xl border border-gray-200 bg-white p-12 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-gray-100 text-gray-400">
            <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </div>
          <h2 className="mt-4 text-lg font-semibold text-gray-900">No claims yet</h2>
          <p className="mt-2 text-sm text-gray-500 max-w-sm mx-auto">
            When you need welfare support, you can file a claim from here. Your claim will be reviewed by an administrator.
          </p>
          {subscriptions.length > 0 ? (
            <button
              onClick={() => setShowForm(true)}
              className="mt-5 inline-flex items-center gap-2 rounded-lg bg-luma-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-luma-800 transition-all min-h-[44px]"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
              File Your First Claim
            </button>
          ) : (
            <p className="mt-4 text-xs text-gray-400">Join a package first to be eligible for claims.</p>
          )}
        </div>
      )}

      {/* Claims List */}
      {!loading && claims.length > 0 && (
        <div className="mt-6 space-y-3">
          {claims.map((cl) => (
            <div key={cl.id} className="rounded-xl border border-gray-200 bg-white p-4 hover:shadow-md transition-all">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => viewDetail(cl)}
                      className="font-semibold text-luma-700 hover:text-luma-800 hover:underline text-left min-h-[44px] flex items-center"
                    >
                      {cl.claim_number}
                    </button>
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusStyles[cl.status] ?? 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                      {cl.status}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-sm text-gray-600">
                    <span>{cl.packages?.name ?? 'Package'}</span>
                    <span className="text-gray-300">·</span>
                    <span>{cl.claim_type ?? 'General'}</span>
                  </div>
                  {cl.description && (
                    <p className="mt-1.5 text-sm text-gray-500 line-clamp-2">{cl.description}</p>
                  )}
                  {cl.admin_notes && (
                    <div className="mt-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
                      <span className="font-medium">Admin:</span> {cl.admin_notes}
                    </div>
                  )}

                  {/* Inline timeline for active claims */}
                  {(cl.status === 'Submitted' || cl.status === 'Under Review' || cl.status === 'Approved' || cl.status === 'Paid') && (
                    <div className="mt-3 max-w-sm">
                      <ClaimTimeline status={cl.status} />
                    </div>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  {cl.amount_requested != null && (
                    <div className="text-sm font-medium text-gray-900">KSh {cl.amount_requested.toLocaleString('en-KE')}</div>
                  )}
                  <div className="text-xs text-gray-400 mt-0.5">
                    {new Date(cl.created_at).toLocaleDateString()}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail Modal */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-12 overflow-y-auto" onClick={() => setDetail(null)} role="dialog" aria-modal="true" aria-label={`Claim ${detail.claim_number}`} onKeyDown={(e) => { if (e.key === 'Escape') setDetail(null) }}>
          <div ref={detailRef} className="w-full max-w-lg rounded-xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()} tabIndex={-1}>
            <div className="px-6 py-5 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{detail.claim_number}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusStyles[detail.status] ?? 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                      {detail.status}
                    </span>
                    <span className="text-xs text-gray-400">{detail.claim_type}</span>
                  </div>
                </div>
                <button onClick={() => setDetail(null)} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 min-h-[44px] min-w-[44px] flex items-center justify-center" aria-label="Close">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>

              {/* Timeline in detail modal */}
              <div className="mt-4">
                <ClaimTimeline status={detail.status} />
              </div>
            </div>
            <div className="px-6 py-4 space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-gray-400 text-xs">Package</span>
                  <div className="font-medium text-gray-900">{detail.packages?.name ?? '—'}</div>
                </div>
                <div>
                  <span className="text-gray-400 text-xs">Amount Requested</span>
                  <div className="font-medium text-gray-900">
                    {detail.amount_requested != null ? `KSh ${detail.amount_requested.toLocaleString('en-KE')}` : '—'}
                  </div>
                </div>
                <div>
                  <span className="text-gray-400 text-xs">Created</span>
                  <div className="text-gray-700">{new Date(detail.created_at).toLocaleString()}</div>
                </div>
                {detail.submitted_at && (
                  <div>
                    <span className="text-gray-400 text-xs">Submitted</span>
                    <div className="text-gray-700">{new Date(detail.submitted_at).toLocaleString()}</div>
                  </div>
                )}
                {detail.decided_at && (
                  <div>
                    <span className="text-gray-400 text-xs">Decided</span>
                    <div className="text-gray-700">{new Date(detail.decided_at).toLocaleString()}</div>
                  </div>
                )}
                {detail.paid_at && (
                  <div>
                    <span className="text-gray-400 text-xs">Paid</span>
                    <div className="text-gray-700">{new Date(detail.paid_at).toLocaleString()}</div>
                  </div>
                )}
              </div>
              {detail.description && (
                <div>
                  <span className="text-gray-400 text-xs">Description</span>
                  <p className="mt-1 text-gray-700 whitespace-pre-wrap">{detail.description}</p>
                </div>
              )}
              {detail.admin_notes && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
                  <span className="text-xs font-medium text-amber-700">Admin Notes</span>
                  <p className="mt-0.5 text-sm text-amber-800 whitespace-pre-wrap">{detail.admin_notes}</p>
                </div>
              )}

              {/* Documents */}
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-400 text-xs">Documents</span>
                  {(detail.status === 'Draft' || detail.status === 'Submitted' || detail.status === 'Additional Information Required') && (
                    <label className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2.5 text-xs font-medium text-luma-700 hover:bg-gray-50 cursor-pointer transition-colors min-h-[44px]">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg>
                      {uploading ? 'Uploading…' : 'Upload File'}
                      <input
                        type="file"
                        className="hidden"
                        accept=".jpg,.jpeg,.png,.webp,.pdf,.doc,.docx"
                        onChange={handleFileUpload}
                        disabled={uploading}
                        aria-label="Upload supporting document"
                      />
                    </label>
                  )}
                </div>
                {documents.length === 0 && (
                  <div className="mt-2 rounded-lg border border-dashed border-gray-200 p-4 text-center">
                    <svg className="h-8 w-8 mx-auto text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
                    <p className="mt-1 text-xs text-gray-400">No documents uploaded yet</p>
                    <p className="text-[10px] text-gray-300">Upload supporting documents (photos, receipts, etc.)</p>
                  </div>
                )}
                <div className="mt-2 space-y-1">
                  {documents.map((doc) => (
                    <a
                      key={doc.id}
                      href={doc.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2.5 hover:bg-gray-50 transition-colors min-h-[44px]"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <svg className="h-4 w-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
                        <span className="text-sm text-luma-700 truncate">{doc.file_name}</span>
                      </div>
                      <span className="text-xs text-gray-400 flex-shrink-0 ml-2">
                        {doc.size_bytes ? `${Math.round(doc.size_bytes / 1024)}KB` : ''}
                      </span>
                    </a>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
