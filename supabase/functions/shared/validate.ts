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

export type RegisterInput = {
  email: string
  password: string
  fullName: string
  phone: string
  idNumber: string
  acceptedPrivacy: true
  acceptedTerms: true
  privacyPolicyVersion: string
  termsVersion: string
}

export function parseRegisterBody(input: unknown): RegisterInput {
  const body = asRecord(input)
  const email = requireString(body, 'email', 'Email').toLowerCase()
  const password = typeof body.password === 'string' ? body.password : ''
  const fullName = requireString(body, 'fullName', 'Full name')
  const phone = normalizeKenyanPhone(requireString(body, 'phone', 'Phone'))
  const idNumber = parseKenyanNationalId(body.idNumber)

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
  if (!KENYA_PHONE_RE.test(phone)) {
    throw new ValidationError('Enter a valid Kenyan phone number (e.g. 0712345678).')
  }
  if (body.acceptedPrivacy !== true) {
    throw new ValidationError('You must accept the Privacy Policy to create an account.')
  }
  if (body.acceptedTerms !== true) {
    throw new ValidationError('You must accept the Terms & Conditions to create an account.')
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
    acceptedPrivacy: true,
    acceptedTerms: true,
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
