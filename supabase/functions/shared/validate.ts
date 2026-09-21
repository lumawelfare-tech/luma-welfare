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
const OTP_CODE_RE = /^\d{6}$/

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
  idNumber: string | null
  acceptedPrivacy: true
  acceptedTerms: true
}

export function parseRegisterBody(input: unknown): RegisterInput {
  const body = asRecord(input)
  const email = requireString(body, 'email', 'Email').toLowerCase()
  const password = typeof body.password === 'string' ? body.password : ''
  const fullName = requireString(body, 'fullName', 'Full name')
  const phone = requireString(body, 'phone', 'Phone')
  const idRaw = body.idNumber

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
    throw new ValidationError('Enter a valid Kenyan phone number.')
  }
  if (body.acceptedPrivacy !== true) {
    throw new ValidationError('You must accept the Privacy Policy to create an account.')
  }
  if (body.acceptedTerms !== true) {
    throw new ValidationError('You must accept the Terms & Conditions to create an account.')
  }
  let idNumber: string | null = null
  if (idRaw != null && idRaw !== '') {
    if (typeof idRaw !== 'string') {
      throw new ValidationError('ID number must be a string.')
    }
    idNumber = idRaw.trim().slice(0, 32) || null
  }

  return {
    email,
    password,
    fullName,
    phone,
    idNumber,
    acceptedPrivacy: true,
    acceptedTerms: true,
  }
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
