/**
 * Server-side request body schemas for auth Edge Functions.
 * Pure TypeScript (no Zod) so the same module works in Deno Edge and Vitest.
 * User input must never be trusted beyond these parsers.
 */

export class ValidationError extends Error {
  readonly code = 'VALIDATION'
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const KENYA_PHONE_RE = /^0[17]\d{8}$/
/** Kenyan National ID: 7–8 digits (no letters). */
const KENYA_NATIONAL_ID_RE = /^\d{7,8}$/
const OTP_CODE_RE = /^\d{6}$/
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** Normalize common Kenyan phone inputs to canonical `0[17]XXXXXXXX`. */
export function normalizeKenyanPhone(raw: string): string {
  const digits = String(raw ?? '').replace(/\D/g, '')
  if (digits.startsWith('254') && digits.length >= 12) {
    return `0${digits.slice(3, 12)}`
  }
  if (digits.length === 9 && /^[17]/.test(digits)) {
    return `0${digits}`
  }
  if (digits.length === 10 && /^0[17]/.test(digits)) {
    return digits
  }
  return String(raw ?? '').trim()
}

export function parseKenyanNationalId(raw: unknown, label = 'ID number'): string {
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new ValidationError(`${label} is required.`)
  }
  const digits = raw.replace(/\D/g, '')
  if (!KENYA_NATIONAL_ID_RE.test(digits)) {
    throw new ValidationError('Enter a valid Kenyan National ID (7–8 digits).')
  }
  return digits
}

function asRecord(input: unknown): Record<string, unknown> {
  if (input == null || typeof input !== 'object' || Array.isArray(input)) {
    throw new ValidationError('Invalid request body.')
  }
  return input as Record<string, unknown>
}

function requireString(obj: Record<string, unknown>, key: string, label: string): string {
  const v = obj[key]
  if (typeof v !== 'string' || !v.trim()) {
    throw new ValidationError(`${label} is required.`)
  }
  return v.trim()
}

export type LoginInput = { email: string; password: string }

export function parseLoginBody(input: unknown): LoginInput {
  const body = asRecord(input)
  const email = requireString(body, 'email', 'Email').toLowerCase()
  const password = typeof body.password === 'string' ? body.password : ''
  if (!EMAIL_RE.test(email)) {
    throw new ValidationError('Enter a valid email address.')
  }
  if (!password) {
    throw new ValidationError('Email and password are required.')
  }
  if (password.length > 256) {
    throw new ValidationError('Invalid credentials payload.')
  }
  return { email, password }
}

const RESET_REDIRECT_PATH = '/reset-password'
const RESET_REDIRECT_ORIGINS = new Set([
  'https://luma-welfare.vercel.app',
  'http://localhost:5173',
  'http://localhost:4173',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:4173',
])

export type ForgotPasswordInput = { email: string; redirectTo: string }

/** Neutral password-reset request. Never used to reveal whether the email exists. */
export function parseForgotPasswordBody(input: unknown): ForgotPasswordInput {
  const body = asRecord(input)
  const email = requireString(body, 'email', 'Email').toLowerCase()
  if (!EMAIL_RE.test(email)) {
    throw new ValidationError('Enter a valid email address.')
  }
  const rawRedirect = typeof body.redirectTo === 'string' ? body.redirectTo.trim() : ''
  let parsed: URL
  try {
    parsed = new URL(rawRedirect)
  } catch {
    throw new ValidationError('Invalid reset redirect.')
  }
  if (parsed.pathname !== RESET_REDIRECT_PATH || parsed.hash || parsed.username || parsed.password) {
    throw new ValidationError('Invalid reset redirect.')
  }
  if (!RESET_REDIRECT_ORIGINS.has(parsed.origin)) {
    throw new ValidationError('Invalid reset redirect.')
  }
  return { email, redirectTo: `${parsed.origin}${RESET_REDIRECT_PATH}` }
}

export type RegisterInput = {
  email: string
  password: string
  fullName: string
  phone: string
  idNumber: string
  dateOfBirth: string
  gender: 'male' | 'female' | 'prefer_not_to_say'
  maritalStatus: 'single' | 'married' | 'other'
  county: string
  location: string
  residentialAddress: string
  whatsappPhone: string
  altPhone: string | null
  emergencyContactName: string
  emergencyContactRelationship: string
  emergencyContactPhone: string
  emergencyContactAltPhone: string | null
  familyCoverage: 'individual' | 'nuclear' | 'extended' | null
  applicationProgramCodes: string[]
  acceptedPrivacy: true
  acceptedTerms: true
  acceptedConstitution: true
  confirmSelfSubmission: true
  privacyPolicyVersion: string
  termsVersion: string
}

const GENDERS = new Set(['male', 'female', 'prefer_not_to_say'])
const MARITAL = new Set(['single', 'married', 'other'])
const COVERAGE = new Set(['individual', 'nuclear', 'extended'])

/**
 * Canonical joinable package codes accepted as registration interests.
 * Keep in sync with frontend/src/lib/applicationPrograms.ts.
 */
export const APPLICATION_PROGRAM_CODES = [
  'welfare',
  'hospital',
  'education',
  'business',
  'building',
  'land',
  'farming',
  'wedding',
  'dowry',
  'disaster',
  'youth',
  'senior',
  'mission_of_mercy',
] as const

const APPLICATION_PROGRAM_CODE_SET = new Set<string>(APPLICATION_PROGRAM_CODES)

/** Map older uppercase interest codes → package codes. Vague OTHER is rejected. */
const LEGACY_PROGRAM_CODE_MAP: Record<string, string> = {
  WELFARE: 'welfare',
  OUTPATIENT: 'hospital',
  HOSPITAL: 'hospital',
  EDUCATION: 'education',
  BUSINESS: 'business',
  BUILDING: 'building',
  LAND: 'land',
  FARMING: 'farming',
  SENIOR: 'senior',
  WEDDING: 'wedding',
  DOWRY: 'dowry',
  DISASTER: 'disaster',
  YOUTH: 'youth',
  MISSION: 'mission_of_mercy',
  MISSION_OF_MERCY: 'mission_of_mercy',
}

function normalizeApplicationProgramCode(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed || trimmed.length > 40) return null
  const legacy = LEGACY_PROGRAM_CODE_MAP[trimmed.toUpperCase()]
  if (legacy) return legacy
  const lower = trimmed.toLowerCase()
  if (APPLICATION_PROGRAM_CODE_SET.has(lower)) return lower
  return null
}

function parseIsoDate(raw: unknown, label: string): string {
  const s = typeof raw === 'string' ? raw.trim() : ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    throw new ValidationError(`Enter a valid ${label} (YYYY-MM-DD).`)
  }
  const d = new Date(`${s}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) {
    throw new ValidationError(`Enter a valid ${label}.`)
  }
  const min = new Date('1920-01-01T00:00:00Z')
  const max = new Date()
  max.setUTCFullYear(max.getUTCFullYear() - 16)
  if (d < min || d > max) {
    throw new ValidationError('Applicant must be at least 16 years old.')
  }
  return s
}

export function parseRegisterBody(input: unknown): RegisterInput {
  const body = asRecord(input)
  const email = requireString(body, 'email', 'Email').toLowerCase()
  const password = typeof body.password === 'string' ? body.password : ''
  const fullName = requireString(body, 'fullName', 'Full name')
  const phone = normalizeKenyanPhone(requireString(body, 'phone', 'Phone'))
  const idNumber = parseKenyanNationalId(body.idNumber)
  const dateOfBirth = parseIsoDate(body.dateOfBirth, 'date of birth')
  const genderRaw = requireString(body, 'gender', 'Gender').toLowerCase()
  if (!GENDERS.has(genderRaw)) {
    throw new ValidationError('Select a valid gender option.')
  }
  const maritalRaw = requireString(body, 'maritalStatus', 'Marital status').toLowerCase()
  if (!MARITAL.has(maritalRaw)) {
    throw new ValidationError('Select a valid marital status.')
  }
  const county = requireString(body, 'county', 'County')
  const location = requireString(body, 'location', 'Town / area')
  const residentialAddress = requireString(body, 'residentialAddress', 'Residential address')
  const whatsappRaw = typeof body.whatsappPhone === 'string' && body.whatsappPhone.trim()
    ? body.whatsappPhone
    : phone
  const whatsappPhone = normalizeKenyanPhone(whatsappRaw)
  const altPhone = typeof body.altPhone === 'string' && body.altPhone.trim()
    ? normalizeKenyanPhone(body.altPhone)
    : null
  const emergencyContactName = requireString(body, 'emergencyContactName', 'Emergency contact name')
  const emergencyContactRelationship = requireString(body, 'emergencyContactRelationship', 'Emergency contact relationship')
  const emergencyContactPhone = normalizeKenyanPhone(
    requireString(body, 'emergencyContactPhone', 'Emergency contact phone'),
  )
  const emergencyContactAltPhone = typeof body.emergencyContactAltPhone === 'string' && body.emergencyContactAltPhone.trim()
    ? normalizeKenyanPhone(body.emergencyContactAltPhone)
    : null

  let familyCoverage: RegisterInput['familyCoverage'] = null
  if (typeof body.familyCoverage === 'string' && body.familyCoverage.trim()) {
    const fc = body.familyCoverage.trim().toLowerCase()
    if (!COVERAGE.has(fc)) {
      throw new ValidationError('Select a valid family coverage option.')
    }
    familyCoverage = fc as RegisterInput['familyCoverage']
  }

  const programCodesRaw = body.applicationProgramCodes ?? body.programCodes
  const applicationProgramCodes: string[] = []
  if (Array.isArray(programCodesRaw)) {
    for (const c of programCodesRaw) {
      if (typeof c !== 'string') continue
      const normalized = normalizeApplicationProgramCode(c)
      if (!normalized) {
        if (c.trim()) {
          throw new ValidationError(
            'Select valid programs of interest (each must match a LUMA package).',
          )
        }
        continue
      }
      if (!applicationProgramCodes.includes(normalized)) {
        applicationProgramCodes.push(normalized)
      }
    }
  }

  if (!EMAIL_RE.test(email)) {
    throw new ValidationError('Enter a valid email address.')
  }
  if (password.length < 8) {
    throw new ValidationError('Password must be at least 8 characters.')
  }
  if (password.length > 256) {
    throw new ValidationError('Password is too long.')
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    throw new ValidationError('Password must contain at least one letter and one number.')
  }
  if (fullName.length > 120) {
    throw new ValidationError('Full name is too long.')
  }
  if (county.length > 80 || location.length > 120 || residentialAddress.length > 300) {
    throw new ValidationError('Address fields are too long.')
  }
  if (!KENYA_PHONE_RE.test(phone) || !KENYA_PHONE_RE.test(whatsappPhone) || !KENYA_PHONE_RE.test(emergencyContactPhone)) {
    throw new ValidationError('Enter a valid Kenyan phone number (e.g. 0712345678).')
  }
  if (altPhone && !KENYA_PHONE_RE.test(altPhone)) {
    throw new ValidationError('Enter a valid alternative phone number.')
  }
  if (emergencyContactAltPhone && !KENYA_PHONE_RE.test(emergencyContactAltPhone)) {
    throw new ValidationError('Enter a valid emergency alternative phone.')
  }
  if (body.acceptedPrivacy !== true) {
    throw new ValidationError('You must accept the Privacy Policy to create an account.')
  }
  if (body.acceptedTerms !== true) {
    throw new ValidationError('You must accept the Terms & Conditions to create an account.')
  }
  if (body.acceptedConstitution !== true) {
    throw new ValidationError('You must agree to the LUMA Welfare Constitution and Membership Terms.')
  }
  if (body.confirmSelfSubmission !== true) {
    throw new ValidationError('Confirm that you are submitting this application yourself.')
  }
  const privacyPolicyVersion = requireString(body, 'privacyPolicyVersion', 'Privacy Policy version')
  const termsVersion = requireString(body, 'termsVersion', 'Terms version')
  if (privacyPolicyVersion.length > 64 || termsVersion.length > 64) {
    throw new ValidationError('Invalid legal document version.')
  }

  return {
    email,
    password,
    fullName,
    phone,
    idNumber,
    dateOfBirth,
    gender: genderRaw as RegisterInput['gender'],
    maritalStatus: maritalRaw as RegisterInput['maritalStatus'],
    county,
    location,
    residentialAddress,
    whatsappPhone,
    altPhone,
    emergencyContactName,
    emergencyContactRelationship,
    emergencyContactPhone,
    emergencyContactAltPhone,
    familyCoverage,
    applicationProgramCodes,
    acceptedPrivacy: true,
    acceptedTerms: true,
    acceptedConstitution: true,
    confirmSelfSubmission: true,
    privacyPolicyVersion,
    termsVersion,
  }
}

export type RevealMemberIdInput = { memberId: string }

/** Parse reveal-member-id body and/or query (pure TS — no Zod in Edge). */
export function parseRevealMemberIdInput(
  body: unknown,
  memberIdFromQuery: string | null | undefined,
): RevealMemberIdInput {
  const fromQuery = typeof memberIdFromQuery === 'string' ? memberIdFromQuery.trim() : ''
  if (fromQuery && UUID_RE.test(fromQuery)) {
    return { memberId: fromQuery }
  }
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    const rec = body as Record<string, unknown>
    const id = rec.memberId ?? rec.member_id
    if (typeof id === 'string' && UUID_RE.test(id.trim())) {
      return { memberId: id.trim() }
    }
  }
  throw new ValidationError('Valid member_id is required.')
}

export type MemberProfilePatchInput = {
  fullName: string
  phone: string
  idNumber: string
  altPhone: string | null
  dateOfBirth?: string | null
  county?: string | null
  location?: string | null
  occupation?: string | null
  photoUrl?: string | null
  kraPin?: string | null
}

export function parseMemberProfilePatchBody(input: unknown): MemberProfilePatchInput {
  const body = asRecord(input)
  const fullName = requireString(body, 'fullName', 'Full name')
  if (fullName.length > 120) {
    throw new ValidationError('Full name is too long.')
  }
  const phone = normalizeKenyanPhone(requireString(body, 'phone', 'Phone'))
  if (!KENYA_PHONE_RE.test(phone)) {
    throw new ValidationError('Enter a valid Kenyan phone number (e.g. 0712345678).')
  }
  const idNumber = parseKenyanNationalId(body.idNumber)

  let altPhone: string | null = null
  const altRaw = body.altPhone
  if (altRaw != null && altRaw !== '') {
    if (typeof altRaw !== 'string') {
      throw new ValidationError('Alternate phone must be a string.')
    }
    const normalized = normalizeKenyanPhone(altRaw)
    if (normalized && !KENYA_PHONE_RE.test(normalized)) {
      throw new ValidationError('Enter a valid alternate Kenyan phone number.')
    }
    altPhone = normalized || null
  }

  const opt = (key: string): string | null => {
    const v = body[key]
    if (v == null || v === '') return null
    if (typeof v !== 'string') throw new ValidationError(`${key} must be a string.`)
    return v.trim().slice(0, 200) || null
  }

  return {
    fullName,
    phone,
    idNumber,
    altPhone,
    dateOfBirth: opt('dateOfBirth'),
    county: opt('county'),
    location: opt('location'),
    occupation: opt('occupation'),
    photoUrl: opt('photoUrl'),
    kraPin: ('kraPin' in body || 'kra_pin' in body)
      ? (parseOptionalKraPin(body.kraPin ?? body.kra_pin) ?? undefined)
      : undefined,
  }
}

export type DeleteMemberInput = { memberIds: string[] }

/** Parse single or bulk permanent-delete payload (max 25). */
export function parseDeleteMemberBody(input: unknown): DeleteMemberInput {
  const body = asRecord(input)
  const ids: string[] = []

  const single = body.memberId ?? body.member_id
  if (typeof single === 'string' && UUID_RE.test(single.trim())) {
    ids.push(single.trim())
  }

  const list = body.memberIds ?? body.member_ids
  if (Array.isArray(list)) {
    for (const item of list) {
      if (typeof item !== 'string' || !UUID_RE.test(item.trim())) {
        throw new ValidationError('Each member id must be a valid UUID.')
      }
      ids.push(item.trim())
    }
  }

  const unique = [...new Set(ids)]
  if (unique.length === 0) {
    throw new ValidationError('At least one member_id is required.')
  }
  if (unique.length > 25) {
    throw new ValidationError('Maximum 25 members per delete request.')
  }
  return { memberIds: unique }
}

export type VerifyEmailInput =
  | { action: 'verify'; email: string; code: string }
  | { action: 'resend'; email: string }

export function parseVerifyEmailBody(
  input: unknown,
  actionFromQuery: string | null,
): VerifyEmailInput {
  const body = asRecord(input)
  let action = (typeof body.action === 'string' && body.action
    ? body.action
    : actionFromQuery ?? 'verify'
  ).toLowerCase()

  if (action !== 'verify' && action !== 'resend') {
    throw new ValidationError('Invalid action.')
  }

  const email = requireString(body, 'email', 'Email').toLowerCase()
  if (!EMAIL_RE.test(email)) {
    throw new ValidationError('A valid email address is required.')
  }

  if (action === 'resend') {
    return { action: 'resend', email }
  }

  const codeRaw = typeof body.code === 'string' ? body.code.replace(/\s/g, '') : ''
  if (!OTP_CODE_RE.test(codeRaw)) {
    throw new ValidationError('Enter the 6-digit verification code.')
  }
  return { action: 'verify', email, code: codeRaw }
}

/** Roles managed via Staff & Roles (admins.role_id → roles.name). */
export const STAFF_ROLE_NAMES = [
  'superadmin',
  'admin',
  'finance',
  'claims_reviewer',
  'support',
] as const

export type StaffRoleName = (typeof STAFF_ROLE_NAMES)[number]

/** Exact confirmation string required when granting/promoting to superadmin. */
export const SUPERADMIN_GRANT_CONFIRM = 'GRANT SUPERADMIN'

export type ManageUserRoleAction = 'grant' | 'change_role' | 'revoke'

export type ManageUserRoleInput = {
  action: ManageUserRoleAction
  targetId: string
  roleName?: StaffRoleName
  reason?: string
  confirmSuperadmin?: string
}

export function parseUuid(raw: unknown, label = 'id'): string {
  if (typeof raw !== 'string' || !UUID_RE.test(raw.trim())) {
    throw new ValidationError(`A valid ${label} is required.`)
  }
  return raw.trim()
}

export function parseStaffRoleName(raw: unknown): StaffRoleName {
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new ValidationError('Role is required.')
  }
  const name = raw.trim().toLowerCase()
  if (!(STAFF_ROLE_NAMES as readonly string[]).includes(name)) {
    throw new ValidationError('Invalid role.')
  }
  return name as StaffRoleName
}

/**
 * Parse Staff & Roles mutation body.
 * Accepts snake_case or camelCase keys.
 */
export function parseManageUserRoleBody(input: unknown): ManageUserRoleInput {
  const body = asRecord(input)
  const actionRaw = typeof body.action === 'string' ? body.action.trim().toLowerCase() : ''
  if (actionRaw !== 'grant' && actionRaw !== 'change_role' && actionRaw !== 'revoke') {
    throw new ValidationError('Invalid action. Use grant, change_role, or revoke.')
  }
  const action = actionRaw as ManageUserRoleAction

  const targetRaw = body.targetId ?? body.target_id ?? body.userId ?? body.user_id
  const targetId = parseUuid(targetRaw, 'target user id')

  let reason: string | undefined
  if (body.reason !== undefined && body.reason !== null) {
    if (typeof body.reason !== 'string') {
      throw new ValidationError('Reason must be a string.')
    }
    reason = body.reason.trim().slice(0, 500) || undefined
  }

  if (action === 'revoke') {
    return { action, targetId, reason }
  }

  const roleName = parseStaffRoleName(body.roleName ?? body.role_name ?? body.role)

  let confirmSuperadmin: string | undefined
  const confirmRaw = body.confirmSuperadmin ?? body.confirm_superadmin
  if (confirmRaw !== undefined && confirmRaw !== null) {
    if (typeof confirmRaw !== 'string') {
      throw new ValidationError('Superadmin confirmation must be a string.')
    }
    confirmSuperadmin = confirmRaw.trim()
  }

  if (roleName === 'superadmin') {
    if (confirmSuperadmin !== SUPERADMIN_GRANT_CONFIRM) {
      throw new ValidationError(
        `Granting superadmin requires typing ${SUPERADMIN_GRANT_CONFIRM} exactly.`,
      )
    }
  }

  return { action, targetId, roleName, reason, confirmSuperadmin }
}

export type ImportMemberRowInput = {
  email: string
  fullName: string
  phone: string
  idNumber: string | null
}

/** Validate one CSV-import member row (strict field types + Kenya formats). */
export function parseImportMemberRow(input: unknown, rowLabel = 'Row'): ImportMemberRowInput {
  if (input == null || typeof input !== 'object' || Array.isArray(input)) {
    throw new ValidationError(`${rowLabel}: invalid row object.`)
  }
  const row = input as Record<string, unknown>
  const emailRaw = row.email
  const fullNameRaw = row.full_name ?? row.fullName
  const phoneRaw = row.phone
  const idRaw = row.id_number ?? row.idNumber

  if (typeof emailRaw !== 'string' || !emailRaw.trim()) {
    throw new ValidationError(`${rowLabel}: email is required.`)
  }
  const email = emailRaw.trim().toLowerCase()
  if (!EMAIL_RE.test(email) || email.length > 254) {
    throw new ValidationError(`${rowLabel}: enter a valid email address.`)
  }

  if (typeof fullNameRaw !== 'string' || !fullNameRaw.trim()) {
    throw new ValidationError(`${rowLabel}: full name is required.`)
  }
  const fullName = fullNameRaw.trim()
  if (fullName.length > 120) {
    throw new ValidationError(`${rowLabel}: full name is too long.`)
  }

  if (typeof phoneRaw !== 'string' || !phoneRaw.trim()) {
    throw new ValidationError(`${rowLabel}: phone is required.`)
  }
  const phone = normalizeKenyanPhone(phoneRaw)
  if (!KENYA_PHONE_RE.test(phone)) {
    throw new ValidationError(`${rowLabel}: enter a valid Kenyan phone number.`)
  }

  let idNumber: string | null = null
  if (idRaw != null && idRaw !== '') {
    if (typeof idRaw !== 'string') {
      throw new ValidationError(`${rowLabel}: ID number must be a string.`)
    }
    idNumber = parseKenyanNationalId(idRaw, `${rowLabel}: ID number`)
  }

  return { email, fullName, phone, idNumber }
}

/** Upper bound for claim / payout amounts (KES). Prevents overflow and absurd client values. */
export const MAX_MONEY_AMOUNT_KES = 10_000_000
const MONEY_STRING_RE = /^\d+(\.\d{1,2})?$/

function assertMoneyRange(n: number, label: string): number {
  if (!Number.isFinite(n)) {
    throw new ValidationError(`Enter a valid ${label}.`)
  }
  const rounded = Math.round(n * 100) / 100
  if (rounded <= 0) {
    throw new ValidationError(`${label} must be greater than zero.`)
  }
  if (rounded > MAX_MONEY_AMOUNT_KES) {
    throw new ValidationError(
      `${label} exceeds the maximum of ${MAX_MONEY_AMOUNT_KES.toLocaleString('en-KE')}.`,
    )
  }
  return rounded
}

/**
 * Optional money field. `null` / `undefined` / `''` → `null`.
 * Rejects non-finite values, scientific notation strings, negatives, and amounts above the cap.
 */
export function parseOptionalMoneyAmount(raw: unknown, label = 'amount'): number | null {
  if (raw == null || raw === '') return null
  if (typeof raw === 'number') return assertMoneyRange(raw, label)
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (!trimmed) return null
    if (!MONEY_STRING_RE.test(trimmed)) {
      throw new ValidationError(`Enter a valid ${label}.`)
    }
    return assertMoneyRange(Number(trimmed), label)
  }
  throw new ValidationError(`${label} must be a number.`)
}

export function parseRequiredMoneyAmount(raw: unknown, label = 'amount'): number {
  const parsed = parseOptionalMoneyAmount(raw, label)
  if (parsed == null) {
    throw new ValidationError(`${label} is required.`)
  }
  return parsed
}

const KRA_PIN_RE = /^[A-Z]\d{9}[A-Z]$/
const FAMILY_RELATIONSHIPS = ['spouse', 'child', 'parent', 'sibling', 'other'] as const
const FAMILY_TIERS = ['nuclear', 'extended'] as const
const BENEFICIARY_STATUSES = ['pending', 'active', 'inactive', 'rejected'] as const
export const IDENTITY_DOCUMENT_TYPES = [
  'national_id',
  'kra_certificate',
  'beneficiary_id',
  'beneficiary_kra',
  'other',
] as const
export type IdentityDocumentType = (typeof IDENTITY_DOCUMENT_TYPES)[number]

export function parseOptionalKraPin(raw: unknown): string | null {
  if (raw == null || raw === '') return null
  if (typeof raw !== 'string') throw new ValidationError('KRA PIN must be a string.')
  const pin = raw.trim().toUpperCase().replace(/\s+/g, '')
  if (!pin) return null
  if (!KRA_PIN_RE.test(pin)) {
    throw new ValidationError('Enter a valid KRA PIN (e.g. A123456789X).')
  }
  return pin
}

export type FamilyMemberInput = {
  fullName: string
  relationship: (typeof FAMILY_RELATIONSHIPS)[number]
  tier: (typeof FAMILY_TIERS)[number]
  idNumber: string | null
  dateOfBirth: string | null
  phone: string | null
  beneficiaryStatus: (typeof BENEFICIARY_STATUSES)[number]
}

export function parseFamilyMemberBody(input: unknown): FamilyMemberInput {
  if (input == null || typeof input !== 'object' || Array.isArray(input)) {
    throw new ValidationError('Invalid family member.')
  }
  const body = input as Record<string, unknown>
  const fullRaw = body.fullName ?? body.full_name
  if (typeof fullRaw !== 'string' || !fullRaw.trim()) {
    throw new ValidationError('Full name is required.')
  }
  const fullName = fullRaw.trim().slice(0, 120)
  const relRaw = String(body.relationship ?? '').trim().toLowerCase()
  if (!FAMILY_RELATIONSHIPS.includes(relRaw as (typeof FAMILY_RELATIONSHIPS)[number])) {
    throw new ValidationError('Relationship must be spouse, child, parent, sibling, or other.')
  }
  const tierRaw = String(body.tier ?? 'nuclear').trim().toLowerCase()
  if (!FAMILY_TIERS.includes(tierRaw as (typeof FAMILY_TIERS)[number])) {
    throw new ValidationError('Cover tier must be nuclear or extended.')
  }
  const statusRaw = String(body.beneficiaryStatus ?? body.beneficiary_status ?? 'active')
    .trim()
    .toLowerCase()
  if (!BENEFICIARY_STATUSES.includes(statusRaw as (typeof BENEFICIARY_STATUSES)[number])) {
    throw new ValidationError('Invalid beneficiary status.')
  }
  let idNumber: string | null = null
  const idRaw = body.idNumber ?? body.id_number
  if (idRaw != null && idRaw !== '') {
    idNumber = parseKenyanNationalId(idRaw, 'ID number')
  }
  let phone: string | null = null
  const phoneRaw = body.phone
  if (typeof phoneRaw === 'string' && phoneRaw.trim()) {
    const normalized = normalizeKenyanPhone(phoneRaw)
    if (!KENYA_PHONE_RE.test(normalized)) {
      throw new ValidationError('Enter a valid Kenyan phone number.')
    }
    phone = normalized
  }
  const dobRaw = body.dateOfBirth ?? body.date_of_birth
  let dateOfBirth: string | null = null
  if (typeof dobRaw === 'string' && dobRaw.trim()) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dobRaw.trim())) {
      throw new ValidationError('Date of birth must be YYYY-MM-DD.')
    }
    dateOfBirth = dobRaw.trim()
  }
  return {
    fullName,
    relationship: relRaw as FamilyMemberInput['relationship'],
    tier: tierRaw as FamilyMemberInput['tier'],
    idNumber,
    dateOfBirth,
    phone,
    beneficiaryStatus: statusRaw as FamilyMemberInput['beneficiaryStatus'],
  }
}

export function parseIdentityDocumentType(raw: unknown): IdentityDocumentType {
  if (typeof raw !== 'string' || !IDENTITY_DOCUMENT_TYPES.includes(raw as IdentityDocumentType)) {
    throw new ValidationError('Invalid document type.')
  }
  return raw as IdentityDocumentType
}

