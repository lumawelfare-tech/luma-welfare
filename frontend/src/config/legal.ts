/**
 * Organization / legal document configuration.
 *
 * Fill every PLACEHOLDER_* value before setting draftPendingLegalReview to false.
 * Production builds fail when draft is false and placeholders remain
 * (see scripts/check-legal-config.ts).
 *
 * Keep privacyPolicyVersion / termsVersion in sync with
 * supabase/functions/shared/legal-versions.ts
 */

export const PLACEHOLDER_PREFIX = 'PLACEHOLDER_' as const

export type LegalConfig = {
  /** When true, public Privacy/Terms show a draft banner. */
  draftPendingLegalReview: boolean
  /** Bump when Privacy Policy text changes in a material way. */
  privacyPolicyVersion: string
  /** Bump when Terms text changes in a material way. */
  termsVersion: string
  /** Displayed effective date — leave placeholder until counsel confirms. */
  effectiveDateDisplay: string
  legalEntityName: string
  tradingName: string
  registrationNumber: string
  physicalAddress: string
  /** Data Protection Officer / privacy contact if different from ops email. */
  dpoContactEmail: string
  /** Operational privacy inbox shown when not a placeholder. */
  privacyContactEmail: string
  contactPhoneDisplay: string
  contactPhoneTel: string
  whatsappUrl: string
  odpcRegistrationNumber: string
  governingLaw: string
  disputeForum: string
}

export const legalConfig: LegalConfig = {
  draftPendingLegalReview: true,
  privacyPolicyVersion: '2026-09-23.1',
  termsVersion: '2026-09-23.1',
  effectiveDateDisplay: 'PLACEHOLDER_EFFECTIVE_DATE',
  legalEntityName: 'PLACEHOLDER_LEGAL_ENTITY_NAME',
  tradingName: 'Luma Welfare',
  registrationNumber: 'PLACEHOLDER_REGISTRATION_NUMBER',
  physicalAddress: 'PLACEHOLDER_PHYSICAL_ADDRESS',
  dpoContactEmail: 'PLACEHOLDER_DPO_CONTACT_EMAIL',
  privacyContactEmail: 'info@lumawelfare.or.ke',
  contactPhoneDisplay: '0798 635 024',
  contactPhoneTel: '0798635024',
  whatsappUrl: 'https://wa.me/254798635024',
  odpcRegistrationNumber: 'PLACEHOLDER_ODPC_REGISTRATION_NUMBER',
  governingLaw: 'the laws of Kenya',
  disputeForum: 'PLACEHOLDER_DISPUTE_FORUM',
}

/** Required fields that must not remain placeholders when draft is cleared. */
export const LEGAL_REQUIRED_KEYS = [
  'effectiveDateDisplay',
  'legalEntityName',
  'registrationNumber',
  'physicalAddress',
  'dpoContactEmail',
  'odpcRegistrationNumber',
  'disputeForum',
] as const satisfies ReadonlyArray<keyof LegalConfig>

export function isPlaceholder(value: string | null | undefined): boolean {
  if (value == null || value.trim() === '') return true
  return value.trim().startsWith(PLACEHOLDER_PREFIX)
}

export function displayLegalValue(value: string): string | null {
  return isPlaceholder(value) ? null : value
}

export function listUnresolvedLegalPlaceholders(cfg: LegalConfig = legalConfig): string[] {
  return LEGAL_REQUIRED_KEYS.filter((key) => isPlaceholder(String(cfg[key])))
}

export function assertLegalConfigReadyForRelease(cfg: LegalConfig = legalConfig): void {
  if (cfg.draftPendingLegalReview) return
  const unresolved = listUnresolvedLegalPlaceholders(cfg)
  if (unresolved.length > 0) {
    throw new Error(
      `Legal config still has placeholders (${unresolved.join(', ')}). Fill frontend/src/config/legal.ts or keep draftPendingLegalReview=true.`,
    )
  }
}
