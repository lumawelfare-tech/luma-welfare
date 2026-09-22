/**
 * Authoritative registration / activation fee from platform_settings.
 * Fail closed — never silently default to a hardcoded amount.
 */

export const REGISTRATION_FEE_SETTING_KEY = 'registration_fee'

export type RegistrationFeeConfig = {
  amount: number
  currency: 'KES'
}

export class RegistrationFeeConfigError extends Error {
  readonly code = 'REGISTRATION_FEE_CONFIG'

  constructor(message: string) {
    super(message)
    this.name = 'RegistrationFeeConfigError'
  }
}

/** Minimal client surface — avoid coupling to generated Supabase generics. */
export type RegistrationFeeSettingsClient = {
  // deno-lint-ignore no-explicit-any
  from: (table: string) => any
}

/** Parse and validate platform_settings.value for key `registration_fee`. */
export function parseRegistrationFeeSetting(value: unknown): RegistrationFeeConfig {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    throw new RegistrationFeeConfigError('Registration fee setting is missing or malformed.')
  }
  const record = value as Record<string, unknown>
  const amountRaw = record.amount
  const currencyRaw = record.currency

  const amount = typeof amountRaw === 'number'
    ? amountRaw
    : typeof amountRaw === 'string' && amountRaw.trim()
      ? Number(amountRaw)
      : NaN

  if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount <= 0 || amount > 1_000_000) {
    throw new RegistrationFeeConfigError('Registration fee amount must be a positive whole number (KES).')
  }

  const currency = typeof currencyRaw === 'string' ? currencyRaw.trim().toUpperCase() : ''
  if (currency !== 'KES') {
    throw new RegistrationFeeConfigError('Registration fee currency must be KES.')
  }

  return { amount, currency: 'KES' }
}

/** Load registration fee from platform_settings (service-role or privileged client). */
export async function loadRegistrationFeeConfig(
  client: RegistrationFeeSettingsClient,
): Promise<RegistrationFeeConfig> {
  const { data, error } = await client
    .from('platform_settings')
    .select('value')
    .eq('key', REGISTRATION_FEE_SETTING_KEY)
    .maybeSingle()

  if (error) {
    throw new RegistrationFeeConfigError('Could not load registration fee configuration.')
  }
  if (!data) {
    throw new RegistrationFeeConfigError('Registration fee is not configured.')
  }
  return parseRegistrationFeeSetting(data.value)
}
