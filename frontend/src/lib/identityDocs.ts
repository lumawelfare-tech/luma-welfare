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
