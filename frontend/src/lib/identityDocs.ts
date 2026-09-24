/** Display labels for member identity / beneficiary documents. Server remains source of truth. */

export const IDENTITY_DOC_LABELS: Record<string, string> = {
  national_id: 'National ID',
  kra_certificate: 'KRA PIN certificate',
  beneficiary_id: 'Beneficiary National ID',
  beneficiary_kra: 'Beneficiary KRA certificate',
  other: 'Other document',
}

export function identityDocLabel(type: string | null | undefined): string {
  if (!type) return 'Document'
  return IDENTITY_DOC_LABELS[type] ?? type.replace(/_/g, ' ')
}

export function identityDocStatusLabel(status: string | null | undefined): string {
  if (!status) return 'Not uploaded'
  if (status === 'verified') return 'Verified'
  if (status === 'rejected') return 'Rejected'
  if (status === 'superseded') return 'Replaced'
  if (status === 'pending') return 'Pending verification'
  return status.replace(/_/g, ' ')
}

export function familyTierLabel(tier: string | null | undefined): string {
  if (tier === 'extended') return 'Extended family'
  if (tier === 'nuclear') return 'Nuclear family'
  return 'Family'
}

export function beneficiaryStatusLabel(status: string | null | undefined): string {
  if (!status) return 'Active'
  if (status === 'pending') return 'Pending'
  if (status === 'active') return 'Active'
  if (status === 'inactive') return 'Inactive'
  if (status === 'rejected') return 'Rejected'
  return status.replace(/_/g, ' ')
}

export type IdentityDocsNextStep = {
  kind: 'missing' | 'pending' | 'rejected' | 'ok'
  message: string
}

/** Next action for member ID documents. KRA is optional — do not invent a requirement. */
export function identityDocsNextStep(
  docs: { document_type: string; verification_status: string }[],
): IdentityDocsNextStep {
  const current = docs.filter((d) => d.document_type === 'national_id' || d.document_type === 'kra_certificate')
  if (current.some((d) => d.verification_status === 'rejected')) {
    return { kind: 'rejected', message: 'A document needs correction. Open Profile to see the reason and upload a replacement.' }
  }
  if (current.some((d) => d.verification_status === 'pending')) {
    return { kind: 'pending', message: 'Your documents are awaiting office review. No further action is needed yet.' }
  }
  if (!current.some((d) => d.document_type === 'national_id')) {
    return { kind: 'missing', message: 'Upload your National ID PDF on Profile so the office can verify your membership.' }
  }
  return { kind: 'ok', message: '' }
}
