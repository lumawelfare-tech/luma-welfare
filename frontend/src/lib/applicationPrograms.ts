/**
 * Application “programs of interest” — aligned with joinable `packages.code` values.
 * Keep allowlist in sync with supabase/functions/shared/validate.ts.
 */

export const APPLICATION_PROGRAM_OPTIONS = [
  { code: 'welfare', label: 'Welfare & Bereavement Support' },
  { code: 'hospital', label: 'Outpatient Hospital Support' },
  { code: 'education', label: 'Education Support' },
  { code: 'business', label: 'Business Support' },
  { code: 'building', label: 'Building Support' },
  { code: 'land', label: 'Land Purchase Support' },
  { code: 'farming', label: 'Farming Support' },
  { code: 'senior', label: 'Senior Citizen Support' },
  { code: 'mission_of_mercy', label: 'Mission of Mercy' },
  { code: 'wedding', label: 'Wedding Support' },
  { code: 'dowry', label: 'Dowry / Ruracio Support' },
  { code: 'disaster', label: 'Disaster Relief Support' },
  { code: 'youth', label: 'Youth Empowerment Support' },
] as const

export type ApplicationProgramCode = (typeof APPLICATION_PROGRAM_OPTIONS)[number]['code']

const LABEL_BY_CODE = Object.fromEntries(
  APPLICATION_PROGRAM_OPTIONS.map((o) => [o.code, o.label]),
) as Record<string, string>

/** Legacy interest codes from earlier registration forms. */
const LEGACY_LABELS: Record<string, string> = {
  WELFARE: 'Welfare & Bereavement Support',
  OUTPATIENT: 'Outpatient Hospital Support',
  BUILDING: 'Building Support',
  FARMING: 'Farming Support',
  EDUCATION: 'Education Support',
  BUSINESS: 'Business Support',
  SENIOR: 'Senior Citizen Support',
  OTHER: 'Other LUMA Welfare Program',
}

export function applicationProgramLabel(code: string): string {
  const key = code.trim()
  if (!key) return code
  return LABEL_BY_CODE[key.toLowerCase()] ?? LEGACY_LABELS[key.toUpperCase()] ?? key
}

export function formatApplicationProgramCodes(codes: readonly string[] | null | undefined): string {
  if (!codes?.length) return ''
  return codes.map(applicationProgramLabel).join(', ')
}

/** Member-facing status for DB enum `pending_approval` (official form: Pending Verification). */
export function memberStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case 'pending_approval':
      return 'Pending verification'
    case 'active':
      return 'Active'
    case 'suspended':
      return 'Suspended'
    case 'closed':
      return 'Closed'
    default:
      return status ? status.replace(/_/g, ' ') : '—'
  }
}
