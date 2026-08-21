export interface DarajaConfig {
  env: 'sandbox' | 'production'
  consumerKey: string
  consumerSecret: string
  shortcode: string
  passkey: string
  callbackUrl: string
  initiatorName: string
  initiatorPassword: string
  securityCredential: string
}

export function loadDarajaConfig(): DarajaConfig {
  const required = (key: string): string => {
    const val = process.env[key]
    if (!val) throw new Error(`Missing required env var: ${key}`)
    return val
  }

  return {
    env: (process.env.DARAJA_ENV as DarajaConfig['env']) || 'sandbox',
    consumerKey: required('DARAJA_CONSUMER_KEY'),
    consumerSecret: required('DARAJA_CONSUMER_SECRET'),
    shortcode: required('DARAJA_SHORTCODE'),
    passkey: required('DARAJA_PASSKEY'),
    callbackUrl: required('DARAJA_CALLBACK_URL'),
    initiatorName: required('DARAJA_INITIATOR_NAME'),
    initiatorPassword: required('DARAJA_INITIATOR_PASSWORD'),
    securityCredential: required('DARAJA_SECURITY_CREDENTIAL'),
  }
}

export function darajaBaseUrl(env: 'sandbox' | 'production'): string {
  return env === 'production'
    ? 'https://api.safaricom.co.ke'
    : 'https://sandbox.safaricom.co.ke'
}
