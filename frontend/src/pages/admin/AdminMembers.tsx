import { useEffect, useState, useCallback, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, ApiError } from '../../lib/api'
import { useHead } from '../../lib/seo'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../components/Toast'
import { DataTable, type Column } from '../../components/DataTable'
import { displayEmail, formatKenyanPhone, toTelHref } from '../../lib/pii'
import { IdRevealCell } from '../../components/IdRevealCell'
import { Icon } from '../../components/Icon'
import { BulkActionBar } from '../../components/BulkActionBar'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { FilterBar } from '../../components/FilterBar'
import { FilterDrawer } from '../../components/FilterDrawer'
import { SearchInput } from '../../components/SearchInput'
import { StatusBadge } from '../../components/StatusBadge'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { exportMemberRecordsCSV, exportMemberRecordsExcel, exportMemberRecordsPDF, type MemberRecord } from '../../lib/exports'
import { ErrorState } from '../../components/ErrorState'
import { SkeletonTable } from '../../components/Skeleton'
import { reportLoadError } from '../../lib/userFacingError'
import { formatApplicationProgramCodes, familyCoverageLabel, applicationProgramLabel } from '../../lib/applicationPrograms'
import { hasAdminPermission } from '../../lib/adminPermissions'
import {
  beneficiaryStatusLabel,
  familyTierLabel,
  identityDocLabel,
  identityDocStatusLabel,
} from '../../lib/identityDocs'

/** Typed confirmation matches member full name (case-insensitive) or the word DELETE. */
export function matchesDeleteConfirmation(typed: string, fullName: string): boolean {
  const t = typed.trim()
  if (!t) return false
  if (t.toUpperCase() === 'DELETE') return true
  return t.localeCompare(fullName.trim(), undefined, { sensitivity: 'accent' }) === 0
}

type Member = {
  id: string
  membership_number: string | null
  application_number?: string | null
  full_name: string
  phone: string
  email: string | null
  id_number_masked?: string | null
  profile_incomplete?: boolean
  is_anonymized?: boolean
  anonymized_at?: string | null
  status: string
  joined_at: string | null
  county?: string | null
  family_coverage?: string | null
  application_program_codes?: string[] | null
  application_submitted_at?: string | null
}

function formatAdminDate(value: unknown): string {
  if (value == null || value === '') return '—'
  const s = String(value)
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (iso && !s.includes('T')) {
    const d = new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])))
    return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString()
  }
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString()
}

function formatAdminDateTime(value: unknown): string {
  if (value == null || value === '') return '—'
  const d = new Date(String(value))
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString()
}

function DetailField({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? 'col-span-2 min-w-0' : 'min-w-0'}>
      <span className="text-gray-400">{label}</span>
      <div className="font-medium break-words">{children ?? '—'}</div>
    </div>
  )
}

function ConsentRow({
  label,
  acceptedAt,
  version,
}: {
  label: string
  acceptedAt: unknown
  version?: unknown
}) {
  const ok = Boolean(acceptedAt)
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm py-1.5 border-b border-gray-100 last:border-0">
      <span className="text-gray-700">{label}</span>
      <span className={ok ? 'font-medium text-emerald-700' : 'text-gray-400'}>
        {ok ? `Accepted ${formatAdminDateTime(acceptedAt)}` : 'Not recorded'}
        {version ? ` · v${String(version)}` : ''}
      </span>
    </div>
  )
}

function latestLegalAcceptance(
  rows: Record<string, unknown>[] | undefined,
  documentType: string,
): Record<string, unknown> | undefined {
  return (rows ?? []).find((row) => String(row.document_type ?? '') === documentType)
}

const BASE_MEMBER_STATUS_FILTERS = [
  { value: '', label: 'All' },
  { value: 'pending_approval', label: 'Applications' },
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'closed', label: 'Closed' },
]

const ANONYMIZED_FILTER = { value: 'anonymized', label: 'Anonymized' }

const ALLOWED_MEMBER_STATUS = new Set<string>([
  ...BASE_MEMBER_STATUS_FILTERS.map((f) => f.value),
  ANONYMIZED_FILTER.value,
])

export function AdminMembers() {
  useHead('Members', undefined, { noindex: true })
  const { addToast } = useToast()
  const { isSuperadmin, adminPermissions } = useAuth()
  const canViewIdentityDocs = hasAdminPermission(adminPermissions, isSuperadmin, 'documents:read')
  const canVerifyIdentityDocs = hasAdminPermission(adminPermissions, isSuperadmin, 'documents:verify')
  const memberStatusFilters = isSuperadmin
    ? [...BASE_MEMBER_STATUS_FILTERS, ANONYMIZED_FILTER]
    : BASE_MEMBER_STATUS_FILTERS
  const [searchParams, setSearchParams] = useSearchParams()
  const statusFromUrl = searchParams.get('status') ?? ''
  const initialFilter = ALLOWED_MEMBER_STATUS.has(statusFromUrl)
    ? (statusFromUrl === 'anonymized' && !isSuperadmin ? '' : statusFromUrl)
    : ''
  const [members, setMembers] = useState<Member[]>([])
  const [filter, setFilter] = useState(initialFilter)
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebouncedValue(query, 300)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const perPage = 50

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkLoading, setBulkLoading] = useState(false)

  // Soft-close dialog (non-closed → closed)
  const [closeTarget, setCloseTarget] = useState<Member | null>(null)
  // Permanent purge dialog (closed + superadmin)
  const [purgeTarget, setPurgeTarget] = useState<Member | null>(null)
  const [bulkPurgeOpen, setBulkPurgeOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [deleteBusy, setDeleteBusy] = useState(false)

  // Export
  const [exporting, setExporting] = useState<'csv' | 'excel' | 'pdf' | null>(null)

  // CSV Import
  const [showImport, setShowImport] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [importResults, setImportResults] = useState<{ row: number; email: string; status: string; message: string }[] | null>(null)

  // Member detail
  const [detailMember, setDetailMember] = useState<Member | null>(null)
  const [detailData, setDetailData] = useState<{
    member: Record<string, unknown>
    subscriptions: Record<string, unknown>[]
    family_members: Record<string, unknown>[]
    contributions: Record<string, unknown>[]
    registration_fees?: Record<string, unknown>[]
    identity_documents?: Record<string, unknown>[]
    legal_acceptances?: Record<string, unknown>[]
  } | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [docBusyId, setDocBusyId] = useState<string | null>(null)
  const [rejectTarget, setRejectTarget] = useState<{ id: string; type: string } | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  // Application approve / reject dialog
  const [decisionTarget, setDecisionTarget] = useState<{ member: Member; action: 'approve' | 'reject' } | null>(null)
  const [decisionRemarks, setDecisionRemarks] = useState('')

  // Bulk dialogs
  const [bulkAction, setBulkAction] = useState<'active' | 'suspended' | 'closed' | null>(null)
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)

  const load = useCallback(async (pageNum = 1) => {
    setError(null)
    try {
      const qs = new URLSearchParams()
      if (filter) qs.set('status', filter)
      if (debouncedQuery.trim()) qs.set('q', debouncedQuery.trim())
      qs.set('page', String(pageNum))
      qs.set('per_page', String(perPage))
      const d = await api<{ members: Member[]; total: number; page: number; pages: number }>(`/admin/members?${qs.toString()}`, { auth: true })
      setMembers(d.members ?? [])
      setTotalCount(d.total ?? 0)
      setTotalPages(d.pages ?? 1)
      setPage(d.page ?? pageNum)
    } catch (e) {
      setError(reportLoadError(e, { page: 'admin-members' }, 'Could not load members.'))
    } finally {
      setLoading(false)
    }
  }, [filter, debouncedQuery])

  // eslint-disable-next-line oxc/react/set-state-in-effect — loading initialized true; setLoading(false) in finally after await
  useEffect(() => { load(1) }, [load])

  // Keep list filter aligned with ?status= deep links (e.g. from admin dashboard stats).
  useEffect(() => {
    const s = searchParams.get('status') ?? ''
    const next = ALLOWED_MEMBER_STATUS.has(s) ? s : ''
    setFilter((prev) => (prev === next ? prev : next))
  }, [searchParams])

  function applyFilter(value: string) {
    setFilter(value)
    setPage(1)
    const next = new URLSearchParams(searchParams)
    if (value) next.set('status', value)
    else next.delete('status')
    setSearchParams(next, { replace: true })
  }

  function normalizeMember(m: Member): MemberRecord {
    return {
      member_full_name: m.full_name ?? 'Not provided',
      member_phone: m.phone ?? 'Not provided',
      member_email: m.email ?? 'Not provided',
      membership_number: m.membership_number ?? '—',
      status: m.status ?? 'Unknown',
      joined_at: m.joined_at ?? '',
    }
  }

  // Export all matching records from server
  const [showExportMenu, setShowExportMenu] = useState(false)

  async function fetchAllMembers(): Promise<Member[]> {
    const d = await api<{ members: Member[]; total: number }>(
      '/admin/members?action=export',
      { method: 'POST', auth: true, body: { status: filter || undefined, q: debouncedQuery.trim() || undefined } },
    )
    return d.members ?? []
  }

  function handleExport(format: 'csv' | 'excel' | 'pdf', allRecords: boolean = false) {
    setShowExportMenu(false)
    setExporting(format)
    async function run() {
      try {
        let records: MemberRecord[]
        let filterSummary: string
        if (allRecords) {
          const allMembers = await fetchAllMembers()
          records = allMembers.map(normalizeMember)
          const parts: string[] = []
          if (filter) parts.push(`Status: ${filter}`)
          if (debouncedQuery.trim()) parts.push(`Search: ${debouncedQuery.trim()}`)
          filterSummary = parts.length > 0 ? `All matching: ${parts.join(' | ')}` : 'All members'
        } else {
          records = members.map(normalizeMember)
          const parts: string[] = []
          if (filter) parts.push(`Status: ${filter}`)
          if (debouncedQuery.trim()) parts.push(`Search: ${debouncedQuery.trim()}`)
          filterSummary = parts.length > 0 ? `Current page: ${parts.join(' | ')}` : 'Current page'
        }
        if (records.length === 0) {
          addToast('info', 'No member records available for export.')
          setExporting(null)
          return
        }
        if (format === 'csv') exportMemberRecordsCSV(records)
        else if (format === 'excel') exportMemberRecordsExcel(records, filterSummary)
        else exportMemberRecordsPDF(records, filterSummary)
        addToast('success', `Export complete — ${records.length} member${records.length !== 1 ? 's' : ''}`)
      } catch {
        addToast('error', 'Export failed. Please try again.')
      } finally {
        setExporting(null)
      }
    }
    run()
  }

  async function viewMember(member: Member) {
    setDetailMember(member)
    setDetailData(null)
    setDetailError(null)
    setLoadingDetail(true)
    try {
      const d = await api<{
        member: Record<string, unknown>
        subscriptions: Record<string, unknown>[]
        family_members: Record<string, unknown>[]
        contributions: Record<string, unknown>[]
        registration_fees?: Record<string, unknown>[]
        identity_documents?: Record<string, unknown>[]
      }>(`/admin/members/${member.id}`, { auth: true })
      setDetailData(d)
      setRejectTarget(null)
      setRejectReason('')
    } catch {
      setDetailError('Could not load member details.')
      addToast('warning', 'Could not load member details.')
    } finally {
      setLoadingDetail(false)
    }
  }

  async function refreshDetail() {
    if (!detailMember) return
    const d = await api<{
      member: Record<string, unknown>
      subscriptions: Record<string, unknown>[]
      family_members: Record<string, unknown>[]
      contributions: Record<string, unknown>[]
      registration_fees?: Record<string, unknown>[]
      identity_documents?: Record<string, unknown>[]
    }>(`/admin/members/${detailMember.id}`, { auth: true })
    setDetailData(d)
  }

  async function viewIdentityDocument(docId: string) {
    setDocBusyId(docId)
    try {
      const d = await api<{ file_url: string }>('/admin/members?action=view-identity-document', {
        method: 'POST',
        auth: true,
        body: { documentId: docId },
      })
      if (d.file_url) window.open(d.file_url, '_blank', 'noopener,noreferrer')
    } catch (e) {
      addToast('error', e instanceof ApiError ? e.message : 'Could not open the document.')
    } finally {
      setDocBusyId(null)
    }
  }

  async function verifyIdentityDocument(docId: string) {
    setDocBusyId(docId)
    try {
      await api('/admin/members?action=verify-identity-document', {
        method: 'POST',
        auth: true,
        body: { documentId: docId },
      })
      addToast('success', 'Document verified. The member will be notified.')
      await refreshDetail()
    } catch (e) {
      addToast('error', e instanceof ApiError ? e.message : 'Could not verify the document.')
    } finally {
      setDocBusyId(null)
    }
  }

  async function rejectIdentityDocument() {
    if (!rejectTarget || !rejectReason.trim()) {
      addToast('warning', 'A rejection reason is required.')
      return
    }
    setDocBusyId(rejectTarget.id)
    try {
      await api('/admin/members?action=reject-identity-document', {
        method: 'POST',
        auth: true,
        body: { documentId: rejectTarget.id, reason: rejectReason.trim() },
      })
      addToast('success', 'Document rejected. The member will be notified.')
      setRejectTarget(null)
      setRejectReason('')
      await refreshDetail()
    } catch (e) {
      addToast('error', e instanceof ApiError ? e.message : 'Could not reject the document.')
    } finally {
      setDocBusyId(null)
    }
  }

  function openDecision(member: Member, action: 'approve' | 'reject') {
    setDecisionTarget({ member, action })
    setDecisionRemarks('')
  }

  async function setStatus(
    id: string,
    status: 'active' | 'suspended' | 'closed',
    opts?: { rejectApplication?: boolean; adminRemarks?: string },
  ) {
    setBusyId(id)
    try {
      const result = await api<{ session_invalidated?: boolean }>(`/admin/members/${id}`, {
        method: 'PATCH',
        auth: true,
        body: {
          status,
          ...(status === 'closed' && opts?.rejectApplication ? { rejectApplication: true } : {}),
          ...(opts?.adminRemarks ? { adminRemarks: opts.adminRemarks } : {}),
        },
      })
      addToast(
        'success',
        status === 'active'
          ? 'Application approved — membership number assigned if missing.'
          : status === 'suspended'
            ? 'Member suspended.'
            : opts?.rejectApplication
              ? 'Application rejected.'
              : 'Member closed.',
      )
      if ((status === 'suspended' || status === 'closed') && result.session_invalidated === false) {
        addToast('warning', 'Status saved, but the member session could not be revoked. Ask them to sign out, or retry later.')
      }
      setDecisionTarget(null)
      await load()
    } catch (e) {
      addToast('error', e instanceof ApiError ? e.message : 'Could not update the member.')
    } finally {
      setBusyId(null)
    }
  }

  async function confirmDecision() {
    if (!decisionTarget) return
    const remarks = decisionRemarks.trim()
    if (decisionTarget.action === 'approve') {
      await setStatus(decisionTarget.member.id, 'active', {
        adminRemarks: remarks || undefined,
      })
    } else {
      await setStatus(decisionTarget.member.id, 'closed', {
        rejectApplication: true,
        adminRemarks: remarks || undefined,
      })
    }
  }

  async function softCloseMember() {
    if (!closeTarget) return
    setDeleteBusy(true)
    try {
      await api(`/admin/members/${closeTarget.id}`, { method: 'DELETE', auth: true })
      addToast('success', `Member "${closeTarget.full_name}" has been closed.`)
      setCloseTarget(null)
      setConfirmText('')
      await load()
    } catch (e) {
      addToast('error', e instanceof ApiError ? e.message : 'Could not close the member.')
    } finally {
      setDeleteBusy(false)
    }
  }

  async function purgeMembers(ids: string[], expectedName?: string) {
    if (ids.length === 1 && expectedName && !matchesDeleteConfirmation(confirmText, expectedName)) return
    if (ids.length > 1 && confirmText.trim().toUpperCase() !== 'DELETE') return
    setDeleteBusy(true)
    try {
      const d = await api<{
        results: { member_id: string; success: boolean; path?: string; error?: string }[]
        summary: { total: number; success: number; failed: number }
      }>('/admin/delete-member', {
        method: 'POST',
        auth: true,
        body: ids.length === 1 ? { memberId: ids[0] } : { memberIds: ids },
      })
      const ok = d.summary?.success ?? 0
      const fail = d.summary?.failed ?? 0
      const hardIds = new Set((d.results ?? []).filter((r) => r.success && r.path === 'hard_delete').map((r) => r.member_id))
      const anonIds = new Set((d.results ?? []).filter((r) => r.success && r.path === 'anonymize').map((r) => r.member_id))
      if (ok > 0) {
        const anonCount = anonIds.size
        const hardCount = hardIds.size
        if (anonCount > 0 && hardCount === 0) {
          addToast(
            'success',
            anonCount === 1
              ? 'Anonymized 1 member. Personal data erased, financial records kept.'
              : `Anonymized ${anonCount} members. Personal data erased, financial records kept.`,
          )
        } else if (hardCount > 0 && anonCount === 0) {
          addToast(
            'success',
            hardCount === 1 ? 'Deleted 1 member.' : `Deleted ${hardCount} members.`,
          )
        } else {
          addToast(
            'success',
            `Deleted ${hardCount} member${hardCount === 1 ? '' : 's'}; anonymized ${anonCount} (financial records kept).`,
          )
        }
        // Default list hides anonymized; remove both hard-deleted and anonymized rows immediately.
        // When viewing the Anonymized filter, keep anonymized shells visible with badge.
        const viewingAnonymized = filter === 'anonymized'
        setMembers((prev) =>
          prev
            .filter((m) => !hardIds.has(m.id))
            .filter((m) => viewingAnonymized || !anonIds.has(m.id))
            .map((m) =>
              anonIds.has(m.id)
                ? {
                    ...m,
                    full_name: 'Deleted member',
                    email: null,
                    id_number_masked: '—',
                    phone: '0700000000',
                    profile_incomplete: false,
                    is_anonymized: true,
                    anonymized_at: new Date().toISOString(),
                    status: 'closed',
                  }
                : m,
            ),
        )
        setSelectedIds((prev) => {
          const next = new Set(prev)
          for (const id of hardIds) next.delete(id)
          if (!viewingAnonymized) {
            for (const id of anonIds) next.delete(id)
          }
          return next
        })
        const removedFromList = hardCount + (viewingAnonymized ? 0 : anonCount)
        setTotalCount((c) => Math.max(0, c - removedFromList))
      }
      if (fail > 0) {
        const firstErr = (d.results ?? []).find((r) => !r.success)?.error
        addToast('error', firstErr ?? `${fail} delete${fail === 1 ? '' : 's'} failed.`)
      }
      setPurgeTarget(null)
      setBulkPurgeOpen(false)
      setConfirmText('')
    } catch (e) {
      addToast('error', e instanceof ApiError ? e.message : 'Permanent delete failed.')
    } finally {
      setDeleteBusy(false)
    }
  }

  async function bulkStatusUpdate(status: 'active' | 'suspended' | 'closed') {
    setBulkLoading(true)
    try {
      const ids = Array.from(selectedIds)
      const d = await api<{ results: { id: string; success: boolean; error?: string }[]; summary: { total: number; success: number; errors: number } }>(
        '/admin/members?action=batch',
        { method: 'POST', auth: true, body: { ids, status } },
      )
      if (d.summary.errors > 0) {
        addToast('warning', `${d.summary.success} updated, ${d.summary.errors} failed.`)
      } else {
        addToast('success', `${d.summary.success} member${d.summary.success !== 1 ? 's' : ''} ${status === 'active' ? 'approved' : status === 'suspended' ? 'suspended' : 'closed'}.`)
      }
    } catch (e) {
      addToast('error', e instanceof ApiError ? e.message : 'Batch operation failed.')
    } finally {
      setBulkLoading(false)
      setBulkAction(null)
      setSelectedIds(new Set())
      await load()
    }
  }

  function parseCSV(text: string): Record<string, string>[] {
    const lines = text.split('\n').filter((l) => l.trim())
    if (lines.length < 2) return []
    const headers = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'))
    return lines.slice(1).map((line) => {
      const values: string[] = []
      let current = ''
      let inQuotes = false
      for (const char of line) {
        if (char === '"') { inQuotes = !inQuotes; continue }
        if (char === ',' && !inQuotes) { values.push(current.trim()); current = ''; continue }
        current += char
      }
      values.push(current.trim())
      const row: Record<string, string> = {}
      headers.forEach((h, i) => { row[h] = values[i] ?? '' })
      return row
    })
  }

  async function handleImport() {
    if (!importFile) return
    setImporting(true)
    setImportResults(null)
    try {
      const text = await importFile.text()
      const rows = parseCSV(text)
      if (rows.length === 0) {
        setImportResults([{ row: 0, email: '', status: 'error', message: 'No data rows found in CSV.' }])
        return
      }
      const d = await api<{ results: { row: number; email: string; status: string; message: string }[]; summary: { total: number; success: number; errors: number } }>(
        '/admin/members?action=import',
        { method: 'POST', auth: true, body: { members: rows } },
      )
      setImportResults(d.results ?? [])
      if (d.summary.errors === 0) {
        addToast('success', `Successfully imported ${d.summary.success} members.`)
        await load()
      } else {
        addToast('warning', `Imported ${d.summary.success} of ${d.summary.total} members.`)
      }
    } catch (e) {
      addToast('error', e instanceof ApiError ? e.message : 'Import failed.')
    } finally {
      setImporting(false)
    }
  }

  const columns: Column<Member>[] = [
    {
      key: 'full_name',
      header: 'Member',
      sortable: true,
      render: (m) => (
        <button type="button" onClick={() => viewMember(m)} className="min-h-[44px] text-left hover:underline">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-gray-900">{m.full_name}</span>
            {m.is_anonymized ? (
              <span
                className="max-w-[14rem] rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-700 ring-1 ring-slate-200/80"
                title="Anonymized: personal data erased, financial records retained"
              >
                Anonymized: personal data erased, financial records retained
              </span>
            ) : m.profile_incomplete ? (
              <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 ring-1 ring-amber-200/80">
                Incomplete profile
              </span>
            ) : null}
          </div>
          {m.membership_number && <div className="text-xs text-gray-400">#{m.membership_number}</div>}
          {m.application_number && <div className="text-xs text-gray-400">{m.application_number}</div>}
        </button>
      ),
    },
    {
      key: 'phone',
      header: 'Phone',
      sortable: true,
      render: (m) => {
        const label = formatKenyanPhone(m.phone)
        const href = toTelHref(m.phone)
        if (!href || label === '—') return <span className="text-gray-400">—</span>
        return (
          <a href={href} className="inline-flex min-h-[44px] items-center text-sm font-medium text-luma-700 hover:underline">
            {label}
          </a>
        )
      },
    },
    {
      key: 'id_number_masked',
      header: 'ID No.',
      sortable: false,
      render: (m) => (
        m.is_anonymized ? (
          <span className="text-sm text-gray-400">—</span>
        ) : (
          <IdRevealCell memberId={m.id} masked={m.id_number_masked ?? '—'} />
        )
      ),
    },
    {
      key: 'email',
      header: 'Email',
      sortable: true,
      render: (m) => {
        const email = displayEmail(m.email)
        return (
          <span className={`text-sm ${email === '—' ? 'text-gray-400' : 'text-gray-700'}`}>
            {email}
          </span>
        )
      },
    },
    {
      key: 'county',
      header: 'County',
      sortable: true,
      render: (m) => (
        <span className="text-sm text-gray-700">{m.county?.trim() || '—'}</span>
      ),
    },
    {
      key: 'family_coverage',
      header: 'Coverage',
      sortable: true,
      render: (m) => (
        <span className="text-sm text-gray-700">{familyCoverageLabel(m.family_coverage)}</span>
      ),
    },
    {
      key: 'application_program_codes',
      header: 'Programs',
      sortable: false,
      render: (m) => {
        const codes = m.application_program_codes ?? []
        if (codes.length === 0) return <span className="text-sm text-gray-400">—</span>
        return (
          <span className="text-sm text-gray-700" title={formatApplicationProgramCodes(codes)}>
            {codes.length} selected
          </span>
        )
      },
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (m) => (
        <StatusBadge status={m.is_anonymized ? 'closed' : m.status}>
          {m.is_anonymized ? 'anonymized' : m.status.replace(/_/g, ' ')}
        </StatusBadge>
      ),
    },
    {
      key: 'application_submitted_at',
      header: 'Applied',
      sortable: true,
      render: (m) => (
        <span className="text-gray-500 text-xs">
          {formatAdminDate(m.application_submitted_at || m.joined_at)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      className: 'sticky right-0 z-[1] min-w-[11rem] bg-white text-right shadow-[-6px_0_8px_-6px_rgba(0,0,0,0.08)]',
      hideOnMobile: true,
      render: (m) => (
        m.is_anonymized ? (
          <span className="text-xs text-gray-400">No actions</span>
        ) : (
        <div className="flex min-h-[44px] items-center justify-end gap-1.5">
          {m.status === 'pending_approval' && (
            <>
              <button
                type="button"
                disabled={busyId === m.id}
                onClick={() => openDecision(m, 'approve')}
                className="min-h-[44px] rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              >
                Approve
              </button>
              <button
                type="button"
                disabled={busyId === m.id}
                onClick={() => openDecision(m, 'reject')}
                className="min-h-[44px] rounded-md border border-red-200 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 transition-colors"
              >
                Reject
              </button>
            </>
          )}
          {m.status === 'active' && (
            <button
              type="button"
              disabled={busyId === m.id}
              onClick={() => setStatus(m.id, 'suspended')}
              className="min-h-[44px] rounded-md border border-gray-200 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              Suspend
            </button>
          )}
          {m.status === 'suspended' && (
            <button
              type="button"
              disabled={busyId === m.id}
              onClick={() => setStatus(m.id, 'active')}
              className="min-h-[44px] rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              Reinstate
            </button>
          )}
          {m.status !== 'closed' && (
            <button
              type="button"
              disabled={busyId === m.id}
              onClick={() => { setCloseTarget(m); setConfirmText('') }}
              className="min-h-[44px] rounded-md border border-amber-200 px-3 py-2 text-xs font-medium text-amber-800 hover:bg-amber-50 disabled:opacity-50 transition-colors"
            >
              Close
            </button>
          )}
          {isSuperadmin && m.status === 'closed' && (
            <button
              type="button"
              disabled={busyId === m.id || deleteBusy}
              onClick={() => { setPurgeTarget(m); setConfirmText('') }}
              className="touch-target inline-flex h-11 w-11 flex-none items-center justify-center rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50"
              aria-label={`Permanently delete ${m.full_name}`}
              title="Permanently delete"
            >
              <Icon name="trash" className="h-4 w-4" />
            </button>
          )}
          {m.status === 'closed' && !isSuperadmin && (
            <span className="text-xs text-gray-400">—</span>
          )}
        </div>
        )
      ),
    },
  ]

  return (
    <div className="py-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Members</h1>
          <p className="mt-1 text-sm text-gray-500">{totalCount} member{totalCount !== 1 ? 's' : ''} found</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <button onClick={() => setShowExportMenu(!showExportMenu)} disabled={exporting !== null || loading}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              {exporting ? (
                <><svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Exporting…</>
              ) : 'Export ▾'}
            </button>
            {showExportMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowExportMenu(false)} />
                <div className="absolute right-0 top-full z-50 mt-1 w-56 glass-panel py-1 shadow-lg">
                  <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Current Page ({members.length})</div>
                  {([['csv', 'CSV'], ['excel', 'Excel'], ['pdf', 'PDF']] as const).map(([fmt, label]) => (
                    <button key={fmt} onClick={() => handleExport(fmt, false)} className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50">{label}</button>
                  ))}
                  <div className="border-t border-gray-100 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">All Matching Records</div>
                  {([['csv', 'CSV'], ['excel', 'Excel'], ['pdf', 'PDF']] as const).map(([fmt, label]) => (
                    <button key={`all-${fmt}`} onClick={() => handleExport(fmt, true)} className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50">{label}</button>
                  ))}
                </div>
              </>
            )}
          </div>
          <button onClick={() => { setShowImport(true); setImportFile(null); setImportResults(null) }} className="rounded-lg bg-luma-700 px-4 py-2 text-sm font-semibold text-white hover:bg-luma-800 transition-colors">
            Import CSV
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="mt-6">
        <FilterBar
          options={memberStatusFilters}
          value={filter}
          onChange={applyFilter}
          aria-label="Filter members by status"
          onOpenMobileFilters={() => setMobileFiltersOpen(true)}
          search={
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder="Search name, phone, ID, email, membership #..."
              aria-label="Search members"
            />
          }
        />
        <FilterDrawer
          open={mobileFiltersOpen}
          onClose={() => setMobileFiltersOpen(false)}
          title="Filter members"
          footer={
            <button
              type="button"
              onClick={() => setMobileFiltersOpen(false)}
              className="w-full min-h-[44px] rounded-lg bg-luma-700 px-4 py-2 text-sm font-semibold text-white hover:bg-luma-800"
            >
              Show results
            </button>
          }
        >
          <fieldset>
            <legend className="text-xs font-semibold uppercase tracking-wide text-gray-500">Status</legend>
            <div className="mt-2 flex flex-col gap-1">
              {memberStatusFilters.map((opt) => (
                <button
                  key={opt.value || 'all'}
                  type="button"
                  onClick={() => applyFilter(opt.value)}
                  aria-pressed={filter === opt.value}
                  className={`rounded-lg px-3 py-3 text-left text-sm font-medium min-h-[44px] ${
                    filter === opt.value ? 'bg-luma-100 text-luma-800' : 'bg-gray-50 text-gray-700'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </fieldset>
        </FilterDrawer>
      </div>

      {error && (
        <div className="mt-4">
          <ErrorState message={error} onRetry={() => { setLoading(true); load(page) }} />
        </div>
      )}

      {/* Members Table with Selection */}
      <div className="mt-6">
        {loading ? (
          <SkeletonTable rows={5} />
        ) : (
          <DataTable
            data={members as unknown as Record<string, unknown>[]}
            columns={columns as Column<Record<string, unknown>>[]}
            keyExtractor={(r) => String(r.id)}
            selectable
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
            getId={(r) => String(r.id)}
            pageSize={25}
            emptyMessage="No members found."
            renderMobileCard={(row) => {
              const m = row as unknown as Member
              const phoneLabel = formatKenyanPhone(m.phone)
              const tel = toTelHref(m.phone)
              const email = displayEmail(m.email)
              return (
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <button type="button" onClick={() => viewMember(m)} className="min-h-[44px] text-left">
                      <div className="font-medium text-gray-900">{m.full_name}</div>
                      {m.membership_number && <div className="text-xs text-gray-400">#{m.membership_number}</div>}
          {m.application_number && <div className="text-xs text-gray-400">{m.application_number}</div>}
                      {m.is_anonymized ? (
                        <span className="mt-1 inline-block max-w-[16rem] rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-700">
                          Anonymized: personal data erased, financial records retained
                        </span>
                      ) : m.profile_incomplete ? (
                        <span className="mt-1 inline-block rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-800">
                          Incomplete profile
                        </span>
                      ) : null}
                    </button>
                    <StatusBadge status={m.status}>{m.status.replace(/_/g, ' ')}</StatusBadge>
                  </div>
                  <div className="grid gap-2 text-sm">
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Phone</div>
                      {tel && phoneLabel !== '—' ? (
                        <a href={tel} className="inline-flex min-h-[44px] items-center font-medium text-luma-700">{phoneLabel}</a>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </div>
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">ID No.</div>
                      {m.is_anonymized ? (
                        <span className="text-gray-400">—</span>
                      ) : (
                        <IdRevealCell memberId={m.id} masked={m.id_number_masked ?? '—'} />
                      )}
                    </div>
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Email</div>
                      <div className={email === '—' ? 'text-gray-400' : 'text-gray-700'}>{email}</div>
                    </div>
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">County</div>
                      <div className="text-gray-700">{m.county?.trim() || '—'}</div>
                    </div>
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Coverage</div>
                      <div className="text-gray-700">{familyCoverageLabel(m.family_coverage)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Programs</div>
                      <div className="text-gray-700">
                        {(m.application_program_codes?.length ?? 0) > 0
                          ? `${m.application_program_codes!.length} selected`
                          : '—'}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Applied</div>
                      <div className="text-gray-700">{formatAdminDate(m.application_submitted_at || m.joined_at)}</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {m.is_anonymized ? (
                      <span className="text-xs text-gray-400">No actions</span>
                    ) : (
                      <>
                        {m.status === 'pending_approval' && (
                          <>
                            <button type="button" disabled={busyId === m.id} onClick={() => openDecision(m, 'approve')} className="min-h-[44px] rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold text-white">Approve</button>
                            <button type="button" disabled={busyId === m.id} onClick={() => openDecision(m, 'reject')} className="min-h-[44px] rounded-md border border-red-200 px-3 py-2 text-xs font-medium text-red-700">Reject</button>
                          </>
                        )}
                        {m.status === 'active' && (
                          <button type="button" disabled={busyId === m.id} onClick={() => setStatus(m.id, 'suspended')} className="min-h-[44px] rounded-md border border-gray-200 px-3 py-2 text-xs font-medium text-gray-600">Suspend</button>
                        )}
                        {m.status === 'suspended' && (
                          <button type="button" disabled={busyId === m.id} onClick={() => setStatus(m.id, 'active')} className="min-h-[44px] rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold text-white">Reinstate</button>
                        )}
                        {m.status !== 'closed' && (
                          <button type="button" disabled={busyId === m.id} onClick={() => { setCloseTarget(m); setConfirmText('') }} className="min-h-[44px] rounded-md border border-amber-200 px-3 py-2 text-xs font-medium text-amber-800">Close</button>
                        )}
                        {isSuperadmin && m.status === 'closed' && (
                          <button
                            type="button"
                            disabled={busyId === m.id || deleteBusy}
                            onClick={() => { setPurgeTarget(m); setConfirmText('') }}
                            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md border border-red-200 px-3 py-2 text-xs font-medium text-red-600"
                            aria-label={`Permanently delete ${m.full_name}`}
                          >
                            <Icon name="trash" className="h-4 w-4" /> Delete permanently
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )
            }}
          />
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between glass-panel px-4 py-3">
          <div className="text-sm text-gray-500">
            Page {page} of {totalPages}
          </div>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => load(page - 1)}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => load(page + 1)}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Bulk Action Bar */}
      <BulkActionBar
        selectedCount={selectedIds.size}
        onClear={() => setSelectedIds(new Set())}
        actions={[
          { label: 'Approve', variant: 'primary', onClick: () => setBulkAction('active'), loading: bulkLoading },
          { label: 'Suspend', variant: 'warning', onClick: () => setBulkAction('suspended'), loading: bulkLoading },
          { label: 'Close', variant: 'danger', onClick: () => setBulkAction('closed'), loading: bulkLoading },
          ...(isSuperadmin
            ? [{
                label: 'Delete permanently',
                variant: 'danger' as const,
                onClick: () => {
                  const closed = members.filter((m) => selectedIds.has(m.id) && m.status === 'closed')
                  if (closed.length === 0) {
                    addToast('warning', 'Select at least one closed member to permanently delete.')
                    return
                  }
                  setConfirmText('')
                  setBulkPurgeOpen(true)
                },
                loading: deleteBusy,
              }]
            : []),
        ]}
      />

      {/* Bulk Action Confirm Dialog */}
      <ConfirmDialog
        open={bulkAction !== null}
        title={bulkAction === 'active' ? 'Approve Members' : bulkAction === 'suspended' ? 'Suspend Members' : 'Close Members'}
        message={`This will ${bulkAction === 'active' ? 'approve' : bulkAction === 'suspended' ? 'suspend' : 'close'} ${selectedIds.size} selected member${selectedIds.size !== 1 ? 's' : ''}.`}
        confirmLabel={bulkAction === 'active' ? 'Approve All' : bulkAction === 'suspended' ? 'Suspend All' : 'Close All'}
        variant={bulkAction === 'active' ? 'primary' : bulkAction === 'suspended' ? 'warning' : 'danger'}
        loading={bulkLoading}
        onConfirm={() => bulkAction && bulkStatusUpdate(bulkAction)}
        onCancel={() => setBulkAction(null)}
      />

      {/* Soft-close confirmation */}
      <ConfirmDialog
        open={closeTarget !== null}
        title="Close Member"
        variant="warning"
        confirmLabel="Close account"
        loading={deleteBusy}
        onConfirm={softCloseMember}
        onCancel={() => { setCloseTarget(null); setConfirmText('') }}
        message={
          <>
            <p className="text-sm font-medium text-gray-900">{closeTarget?.full_name}</p>
            <p className="mt-2">This closes the account. The member can no longer sign in. Historical records are kept. This is not a permanent purge.</p>
          </>
        }
      />

      {/* Permanent purge — single */}
      <ConfirmDialog
        open={purgeTarget !== null}
        title="Permanently delete member"
        variant="danger"
        confirmLabel="Delete permanently"
        loading={deleteBusy}
        confirmDisabled={!purgeTarget || !matchesDeleteConfirmation(confirmText, purgeTarget.full_name)}
        onConfirm={() => purgeTarget && void purgeMembers([purgeTarget.id], purgeTarget.full_name)}
        onCancel={() => { setPurgeTarget(null); setConfirmText('') }}
        message={
          <>
            <div className="mb-3 rounded-lg bg-gray-50 px-4 py-3">
              <p className="text-sm font-medium text-gray-900">{purgeTarget?.full_name}</p>
              <p className="text-xs text-gray-500">{displayEmail(purgeTarget?.email)}</p>
              <p className="text-xs text-gray-400">Status: closed</p>
            </div>
            <p>This is <strong>permanent</strong> and cannot be undone.</p>
            <p className="mt-2 text-sm">If this member has contributions, claims, payments, or fees, personal details will be erased and financial rows kept under an anonymous placeholder so reports stay correct. Otherwise the account is fully removed.</p>
            <div className="mt-3">
              <label className="text-sm font-medium text-gray-700">
                Type the member&apos;s full name or <span className="font-mono font-bold text-red-600">DELETE</span> to confirm:
              </label>
              <input
                aria-label="Type member name or DELETE to confirm permanent deletion"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder='Full name or "DELETE"'
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && purgeTarget && matchesDeleteConfirmation(confirmText, purgeTarget.full_name)) {
                    void purgeMembers([purgeTarget.id], purgeTarget.full_name)
                  }
                }}
              />
            </div>
          </>
        }
      />

      {/* Permanent purge — bulk closed */}
      <ConfirmDialog
        open={bulkPurgeOpen}
        title="Permanently delete closed members"
        variant="danger"
        confirmLabel="Delete permanently"
        loading={deleteBusy}
        confirmDisabled={confirmText.trim().toUpperCase() !== 'DELETE'}
        onConfirm={() => {
          const ids = members.filter((m) => selectedIds.has(m.id) && m.status === 'closed').map((m) => m.id)
          void purgeMembers(ids)
        }}
        onCancel={() => { setBulkPurgeOpen(false); setConfirmText('') }}
        message={
          <>
            <p>
              Permanently delete{' '}
              <strong>{members.filter((m) => selectedIds.has(m.id) && m.status === 'closed').length}</strong>
              {' '}closed member{members.filter((m) => selectedIds.has(m.id) && m.status === 'closed').length === 1 ? '' : 's'}.
              This cannot be undone. Members with financial history will be anonymized; others are removed.
            </p>
            <div className="mt-3">
              <label className="text-sm font-medium text-gray-700">
                Type <span className="font-mono font-bold text-red-600">DELETE</span> to confirm:
              </label>
              <input
                aria-label="Type DELETE to confirm bulk permanent deletion"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder='Type "DELETE"'
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
              />
            </div>
          </>
        }
      />

      {/* Import CSV Modal */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl">
            <div className="px-6 py-5">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Import Members from CSV</h3>
                <button onClick={() => setShowImport(false)} aria-label="Close import dialog" className="text-gray-400 hover:text-gray-600">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>

              <div className="mt-4 rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-700">
                <p className="font-medium">Required CSV columns:</p>
                <p className="mt-1 font-mono text-xs">full_name, phone, email (optional)</p>
                <p className="mt-2 text-xs text-blue-600">Members are imported with <strong>active</strong> status and a registration fee record is created automatically.</p>
              </div>

              {!importResults ? (
                <>
                  <div className="mt-4">
                    <label className="block text-sm font-medium text-gray-700">Select CSV File</label>
                    <input
                      aria-label="Select CSV file to import"
                      type="file"
                      accept=".csv"
                      onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-luma-100 file:px-3 file:py-1 file:text-sm file:font-medium file:text-luma-700 hover:file:bg-luma-200"
                    />
                  </div>
                  <div className="mt-4">
                    <button
                      onClick={handleImport}
                      disabled={!importFile || importing}
                      className="w-full rounded-lg bg-luma-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-luma-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {importing ? (
                        <span className="flex items-center justify-center gap-2">
                          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                          Importing...
                        </span>
                      ) : 'Import Members'}
                    </button>
                  </div>
                </>
              ) : (
                <div className="mt-4">
                  <h4 className="text-sm font-medium text-gray-700">Import Results</h4>
                  <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-gray-200">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 text-left uppercase tracking-wide text-gray-500">
                        <tr><th className="px-3 py-2">Row</th><th className="px-3 py-2">Email</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Message</th></tr>
                      </thead>
                      <tbody>
                        {importResults.map((r, i) => (
                          <tr key={i} className="border-t border-gray-100">
                            <td className="px-3 py-2 text-gray-500">{r.row || '—'}</td>
                            <td className="px-3 py-2 text-gray-600">{r.email || '—'}</td>
                            <td className="px-3 py-2">
                              <StatusBadge status={r.status}>{r.status}</StatusBadge>
                            </td>
                            <td className="px-3 py-2 text-gray-600">{r.message}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-6 py-4">
              <button
                onClick={() => { setShowImport(false); setImportFile(null); setImportResults(null) }}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                {importResults ? 'Close' : 'Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Member Detail Drawer */}
      {detailMember && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-end bg-black/40"
          onClick={() => setDetailMember(null)}
          onKeyDown={(e) => { if (e.key === 'Escape') setDetailMember(null) }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`${detailMember.full_name} details`}
            className="h-full w-full max-w-lg bg-white shadow-2xl overflow-y-auto overflow-x-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
              <div className="min-w-0">
                <h3 className="text-lg font-semibold text-gray-900 truncate">{detailMember.full_name}</h3>
                <p className="text-sm text-gray-500 truncate">{detailMember.email ?? detailMember.phone}</p>
              </div>
              <button onClick={() => setDetailMember(null)} aria-label="Close" className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 min-h-11 min-w-11">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {loadingDetail ? (
              <div className="p-12 text-center text-gray-400">Loading member details…</div>
            ) : detailError ? (
              <div className="p-6">
                <ErrorState message={detailError} onRetry={() => void viewMember(detailMember)} />
              </div>
            ) : detailData ? (
              <div className="p-6 space-y-6">
                {(() => {
                  const m = detailData.member
                  const legal = detailData.legal_acceptances
                  const constitution = latestLegalAcceptance(legal, 'constitution')
                  const privacy = latestLegalAcceptance(legal, 'privacy')
                  const terms = latestLegalAcceptance(legal, 'terms')
                  const selfSub = latestLegalAcceptance(legal, 'self_submission')
                  const programs = Array.isArray(m.application_programs)
                    ? (m.application_programs as { code?: string; name?: string }[])
                    : []
                  const programCodes = Array.isArray(m.application_program_codes)
                    ? (m.application_program_codes as string[])
                    : []
                  return (
                    <>
                <div className="rounded-xl border border-gray-200 p-4">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Application status</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm min-w-0 break-words">
                    <DetailField label="Status">
                      <span className="capitalize">{String(m.status ?? '').replace(/_/g, ' ') || '—'}</span>
                    </DetailField>
                    <DetailField label="Application #">{String(m.application_number ?? '—')}</DetailField>
                    <DetailField label="Membership #">{String(m.membership_number ?? '—')}</DetailField>
                    <DetailField label="Application date">{formatAdminDate(m.application_submitted_at)}</DetailField>
                    <DetailField label="Approval date">{formatAdminDate(m.approved_at)}</DetailField>
                    <DetailField label="Approving administrator">
                      {String(m.approved_by_name ?? (m.approved_by ? m.approved_by : '—'))}
                    </DetailField>
                    <DetailField label="Joined">{formatAdminDate(m.joined_at)}</DetailField>
                    <DetailField label="Payment verified">
                      {m.payment_verified_at ? formatAdminDate(m.payment_verified_at) : 'Not verified'}
                    </DetailField>
                    {m.admin_remarks != null && String(m.admin_remarks) !== '' && (
                      <DetailField label="Admin remarks" wide>
                        <span className="whitespace-pre-wrap">{String(m.admin_remarks)}</span>
                      </DetailField>
                    )}
                  </div>
                  {detailMember.status === 'pending_approval' && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button type="button" onClick={() => openDecision(detailMember, 'approve')} className="min-h-11 rounded-md bg-emerald-600 px-3 text-xs font-semibold text-white">Approve</button>
                      <button type="button" onClick={() => openDecision(detailMember, 'reject')} className="min-h-11 rounded-md border border-red-200 px-3 text-xs font-medium text-red-700">Reject</button>
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-gray-200 p-4">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Applicant details</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm min-w-0 break-words">
                    <DetailField label="Full name" wide>{String(m.full_name ?? '—')}</DetailField>
                    <DetailField label="National ID / Passport">
                      {detailMember.is_anonymized ? (
                        '—'
                      ) : (
                        <IdRevealCell memberId={detailMember.id} masked={String(m.id_number_masked ?? '—')} />
                      )}
                    </DetailField>
                    <DetailField label="Date of birth">{formatAdminDate(m.date_of_birth)}</DetailField>
                    <DetailField label="Gender">
                      <span className="capitalize">{String(m.gender ?? '—').replace(/_/g, ' ')}</span>
                    </DetailField>
                    <DetailField label="Marital status">
                      <span className="capitalize">{String(m.marital_status ?? '—')}</span>
                    </DetailField>
                    <DetailField label="KRA PIN">
                      <span className="tabular-nums">{String(m.kra_pin_masked ?? '—')}</span>
                    </DetailField>
                  </div>
                </div>

                <div className="rounded-xl border border-gray-200 p-4">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Address</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm min-w-0 break-words">
                    <DetailField label="County">{String(m.county ?? '—')}</DetailField>
                    <DetailField label="Town / area">{String(m.location ?? '—')}</DetailField>
                    <DetailField label="Residential address" wide>{String(m.residential_address ?? '—')}</DetailField>
                  </div>
                </div>

                <div className="rounded-xl border border-gray-200 p-4">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Contact</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm min-w-0 break-words">
                    <DetailField label="Mobile number">{String(m.phone ?? '—')}</DetailField>
                    <DetailField label="WhatsApp number">{String(m.whatsapp_phone ?? '—')}</DetailField>
                    <DetailField label="Email">{String(m.email ?? '—')}</DetailField>
                    <DetailField label="Alternative contact">{String(m.alt_phone ?? '—')}</DetailField>
                  </div>
                </div>

                <div className="rounded-xl border border-gray-200 p-4">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Emergency / next of kin</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm min-w-0 break-words">
                    <DetailField label="Full name" wide>{String(m.emergency_contact_name ?? '—')}</DetailField>
                    <DetailField label="Relationship">{String(m.emergency_contact_relationship ?? '—')}</DetailField>
                    <DetailField label="Phone">{String(m.emergency_contact_phone ?? '—')}</DetailField>
                    <DetailField label="Alternative phone">{String(m.emergency_contact_alt_phone ?? '—')}</DetailField>
                  </div>
                </div>

                <div className="rounded-xl border border-gray-200 p-4">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Programs</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm min-w-0 break-words">
                    <DetailField label="Family coverage">{familyCoverageLabel(typeof m.family_coverage === 'string' ? m.family_coverage : null)}</DetailField>
                    <DetailField label="Selected packages" wide>
                      {programs.length > 0 ? (
                        <ul className="mt-1 space-y-1">
                          {programs.map((p) => (
                            <li key={String(p.code)}>{p.name || applicationProgramLabel(String(p.code ?? ''))}</li>
                          ))}
                        </ul>
                      ) : programCodes.length > 0 ? (
                        <ul className="mt-1 space-y-1">
                          {programCodes.map((code) => (
                            <li key={code}>{formatApplicationProgramCodes([code])}</li>
                          ))}
                        </ul>
                      ) : (
                        '—'
                      )}
                    </DetailField>
                  </div>
                </div>

                <div className="rounded-xl border border-gray-200 p-4">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Declarations</h4>
                  <ConsentRow
                    label="Constitution / Membership Terms accepted"
                    acceptedAt={constitution?.accepted_at ?? m.constitution_accepted_at}
                    version={constitution?.document_version ?? m.constitution_version}
                  />
                  <ConsentRow
                    label="Privacy Policy accepted"
                    acceptedAt={privacy?.accepted_at ?? m.privacy_accepted_at}
                    version={privacy?.document_version ?? m.privacy_policy_version}
                  />
                  <ConsentRow
                    label="Terms & Conditions accepted"
                    acceptedAt={terms?.accepted_at ?? m.terms_accepted_at}
                    version={terms?.document_version ?? m.terms_version}
                  />
                  <ConsentRow
                    label="Self-submission confirmed"
                    acceptedAt={selfSub?.accepted_at ?? m.self_submission_confirmed_at}
                    version={selfSub?.document_version}
                  />
                </div>
                    </>
                  )
                })()}

                {(detailData.registration_fees?.length ?? 0) > 0 && (
                  <div className="rounded-xl border border-gray-200 p-4">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Registration fees</h4>
                    <div className="space-y-1">
                      {detailData.registration_fees!.map((f) => (
                        <div key={String(f.id)} className="flex items-center justify-between text-sm py-1.5 border-b border-gray-100 last:border-0">
                          <span className="text-gray-600">KSh {Number(f.amount ?? 0).toLocaleString()}</span>
                          <span className="text-xs font-medium">{String(f.status ?? '—')}</span>
                          <span className="text-xs text-gray-400">{f.paid_at ? new Date(String(f.paid_at)).toLocaleDateString() : '—'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Subscriptions */}
                <div className="rounded-xl border border-gray-200 p-4">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Subscriptions ({detailData.subscriptions.length})</h4>
                  {detailData.subscriptions.length === 0 ? (
                    <p className="text-sm text-gray-400">No subscriptions</p>
                  ) : (
                    <div className="space-y-2">
                      {detailData.subscriptions.map((sub: Record<string, unknown>) => (
                        <div key={String(sub.id)} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
                          <div>
                            <div className="text-sm font-medium">{String((sub.packages as Record<string, unknown>)?.name ?? '—')}</div>
                            <div className="text-xs text-gray-500">{String((sub.package_tiers as Record<string, unknown>)?.name ?? '')}</div>
                          </div>
                          <StatusBadge status={String(sub.status)}>{String(sub.status)}</StatusBadge>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Recent Contributions */}
                <div className="rounded-xl border border-gray-200 p-4">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Package payments ({detailData.contributions.length})</h4>
                  {detailData.contributions.length === 0 ? (
                    <p className="text-sm text-gray-400">No contributions</p>
                  ) : (
                    <div className="space-y-1">
                      {detailData.contributions.slice(0, 10).map((c: Record<string, unknown>) => (
                        <div key={String(c.id)} className="flex items-center justify-between text-sm py-1.5 border-b border-gray-100 last:border-0">
                          <span className="text-gray-600">{String(c.period)}</span>
                          <span className="font-medium">KSh {Number(c.amount ?? 0).toLocaleString()}</span>
                          {c.amount_paid != null && (
                            <span className="text-xs text-gray-500">paid {Number(c.amount_paid).toLocaleString()}</span>
                          )}
                          <span className={`text-xs font-medium ${c.status === 'Verified' || c.status === 'Paid' ? 'text-emerald-600' : c.status === 'Pending' ? 'text-amber-600' : 'text-red-600'}`}>{String(c.status)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Identity documents */}
                <div className="rounded-xl border border-gray-200 p-4">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">
                    Identity documents ({(detailData.identity_documents ?? []).length})
                  </h4>
                  {(detailData.identity_documents ?? []).length === 0 ? (
                    <p className="text-sm text-gray-400">No National ID or KRA documents uploaded yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {(detailData.identity_documents ?? []).map((doc) => {
                        const docId = String(doc.id)
                        const docType = String(doc.document_type ?? '')
                        const status = String(doc.verification_status ?? 'pending')
                        const familyId = doc.family_member_id ? String(doc.family_member_id) : null
                        const owner = familyId
                          ? String(detailData.family_members.find((f) => String(f.id) === familyId)?.full_name ?? 'Beneficiary')
                          : 'Member'
                        return (
                          <div key={docId} className="rounded-lg border border-gray-100 p-3">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div>
                                <p className="text-sm font-medium text-gray-900">{identityDocLabel(docType)}</p>
                                <p className="mt-0.5 text-xs text-gray-500">
                                  {owner}
                                  {doc.created_at ? ` · ${new Date(String(doc.created_at)).toLocaleDateString()}` : ''}
                                  {doc.original_filename ? ` · ${String(doc.original_filename)}` : ''}
                                </p>
                              </div>
                              <StatusBadge status={status}>{identityDocStatusLabel(status)}</StatusBadge>
                            </div>
                            {doc.rejection_reason ? (
                              <p className="mt-1 text-xs text-red-600">Reason: {String(doc.rejection_reason)}</p>
                            ) : null}
                            <div className="mt-3 flex flex-wrap gap-2">
                              {canViewIdentityDocs && (
                                <button
                                  type="button"
                                  disabled={docBusyId === docId}
                                  onClick={() => void viewIdentityDocument(docId)}
                                  className="min-h-11 rounded-md border border-gray-200 px-3 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                                >
                                  {docBusyId === docId ? 'Opening…' : 'View document'}
                                </button>
                              )}
                              {canVerifyIdentityDocs && status === 'pending' && (
                                <>
                                  <button
                                    type="button"
                                    disabled={docBusyId === docId}
                                    onClick={() => void verifyIdentityDocument(docId)}
                                    className="min-h-11 rounded-md bg-emerald-600 px-3 text-xs font-semibold text-white disabled:opacity-60"
                                  >
                                    Verify
                                  </button>
                                  <button
                                    type="button"
                                    disabled={docBusyId === docId}
                                    onClick={() => { setRejectTarget({ id: docId, type: docType }); setRejectReason('') }}
                                    className="min-h-11 rounded-md border border-red-200 px-3 text-xs font-medium text-red-700"
                                  >
                                    Reject
                                  </button>
                                </>
                              )}
                            </div>
                            {rejectTarget?.id === docId && (
                              <div className="mt-3 space-y-2">
                                <label className="block text-xs font-medium text-gray-600">
                                  Reason for rejection
                                  <select
                                    value={['Unclear document', 'Wrong document', 'Expired document', 'Information does not match', 'Other'].includes(rejectReason) ? rejectReason : rejectReason ? 'Other' : ''}
                                    onChange={(e) => setRejectReason(e.target.value === 'Other' ? '' : e.target.value)}
                                    className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                                  >
                                    <option value="">Select a reason</option>
                                    <option value="Unclear document">Unclear document</option>
                                    <option value="Wrong document">Wrong document</option>
                                    <option value="Expired document">Expired document</option>
                                    <option value="Information does not match">Information does not match</option>
                                    <option value="Other">Other</option>
                                  </select>
                                </label>
                                {(!['Unclear document', 'Wrong document', 'Expired document', 'Information does not match'].includes(rejectReason) || rejectReason === '') && (
                                  <input
                                    value={['Unclear document', 'Wrong document', 'Expired document', 'Information does not match'].includes(rejectReason) ? '' : rejectReason}
                                    onChange={(e) => setRejectReason(e.target.value)}
                                    placeholder="Describe the issue"
                                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                                  />
                                )}
                                <div className="flex gap-2">
                                  <button type="button" onClick={() => void rejectIdentityDocument()} disabled={!rejectReason.trim() || docBusyId === docId} className="min-h-11 rounded-md bg-red-600 px-3 text-xs font-semibold text-white disabled:opacity-60">
                                    Confirm rejection
                                  </button>
                                  <button type="button" onClick={() => { setRejectTarget(null); setRejectReason('') }} className="min-h-11 rounded-md border border-gray-200 px-3 text-xs">
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* Family & beneficiaries */}
                <div className="rounded-xl border border-gray-200 p-4">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">
                    Family &amp; beneficiaries ({detailData.family_members.length})
                  </h4>
                  {detailData.family_members.length === 0 ? (
                    <p className="text-sm text-gray-400">No family members on file.</p>
                  ) : (
                    <div className="space-y-3">
                      {(['nuclear', 'extended'] as const).map((tier) => {
                        const list = detailData.family_members.filter((f) => String(f.tier ?? 'nuclear') === tier)
                        if (list.length === 0) return null
                        return (
                          <div key={tier}>
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1">{familyTierLabel(tier)}</p>
                            <div className="space-y-1">
                              {list.map((f) => (
                                <div key={String(f.id)} className="flex flex-wrap items-center justify-between gap-2 text-sm py-1.5 border-b border-gray-100 last:border-0">
                                  <div>
                                    <span className="font-medium">{String(f.full_name ?? '')}</span>
                                    <span className="text-gray-400 ml-2 capitalize">{String(f.relationship ?? '')}</span>
                                    {f.id_number_masked ? <span className="text-gray-400 ml-2 tabular-nums">ID {String(f.id_number_masked)}</span> : null}
                                  </div>
                                  <StatusBadge status={String(f.beneficiary_status ?? 'active')}>
                                    {beneficiaryStatusLabel(String(f.beneficiary_status ?? 'active'))}
                                  </StatusBadge>
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
      <ConfirmDialog
        open={Boolean(decisionTarget)}
        title={decisionTarget?.action === 'approve' ? 'Approve application' : 'Reject application'}
        message={
          <div className="space-y-3 text-sm text-gray-600">
            <p>
              {decisionTarget?.action === 'approve'
                ? `Approve ${decisionTarget?.member.full_name ?? 'this applicant'} and issue a membership number if missing.`
                : `Reject ${decisionTarget?.member.full_name ?? 'this applicant'} and close the application.`}
            </p>
            <div>
              <label htmlFor="admin-decision-remarks" className="mb-1 block text-xs font-medium text-gray-700">Admin remarks (optional)</label>
              <textarea
                id="admin-decision-remarks"
                value={decisionRemarks}
                onChange={(e) => setDecisionRemarks(e.target.value)}
                maxLength={2000}
                rows={3}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900"
              />
            </div>
            {decisionTarget?.action === 'approve' && (
              <p className="text-sm text-gray-600">
                Activation requires a paid registration fee on file. Members without a paid fee cannot be activated.
              </p>
            )}
          </div>
        }
        confirmLabel={decisionTarget?.action === 'approve' ? 'Approve' : 'Reject'}
        variant={decisionTarget?.action === 'approve' ? 'primary' : 'danger'}
        loading={busyId === decisionTarget?.member.id}
        onConfirm={confirmDecision}
        onCancel={() => setDecisionTarget(null)}
      />
    </div>
  )
}
