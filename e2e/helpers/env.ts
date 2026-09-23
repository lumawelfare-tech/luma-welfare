/**
 * E2E credential / environment helpers.
 * Authenticated suites skip when secrets are absent (CI without E2E accounts).
 */

export const BASE_URL = (process.env.BASE_URL || 'https://luma-welfare.vercel.app').replace(/\/+$/, '')

export const SUPABASE_URL = (
  process.env.SUPABASE_URL
  || process.env.VITE_SUPABASE_URL
  || ''
).replace(/\/+$/, '')

export const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY
  || process.env.VITE_SUPABASE_PUBLISHABLE_KEY
  || process.env.SUPABASE_PUBLISHABLE_KEY
  || ''

export const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY
  || process.env.SUPABASE_SECRET_KEY
  || ''

export const E2E_MEMBER = {
  email: process.env.E2E_MEMBER_EMAIL || '',
  password: process.env.E2E_MEMBER_PASSWORD || '',
}

export const E2E_ADMIN = {
  email: process.env.E2E_ADMIN_EMAIL || '',
  password: process.env.E2E_ADMIN_PASSWORD || '',
  totpSecret: (process.env.E2E_ADMIN_TOTP_SECRET || '').replace(/\s+/g, ''),
}

export const hasMemberCreds = Boolean(E2E_MEMBER.email && E2E_MEMBER.password && SUPABASE_URL && SUPABASE_ANON_KEY)
export const hasAdminCreds = Boolean(E2E_ADMIN.email && E2E_ADMIN.password && SUPABASE_URL && SUPABASE_ANON_KEY)
/** Staff 2FA is required — admin API/UI happy paths need the enrolled TOTP secret. */
export const hasAdminTotp = Boolean(hasAdminCreds && E2E_ADMIN.totpSecret)
export const canSeed = Boolean(hasMemberCreds && SUPABASE_SERVICE_ROLE_KEY)
