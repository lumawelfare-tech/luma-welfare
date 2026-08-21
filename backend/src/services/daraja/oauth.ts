import { darajaBaseUrl, type DarajaConfig } from './config.js'
import type { DarajaResult, DarajaTokenResponse } from './types.js'

// ──────────────────────────────────────────────────────
// OAuth token cache (in-memory, single-process)
// ──────────────────────────────────────────────────────
let cachedToken: string | null = null
let tokenExpiresAt = 0

/**
 * Get a valid OAuth access token for Daraja API calls.
 * Caches the token until 60 seconds before expiry.
 */
export async function getAccessToken(
  config: DarajaConfig,
): Promise<DarajaResult<string>> {
  const now = Date.now()
  if (cachedToken && now < tokenExpiresAt) {
    return { success: true, data: cachedToken }
  }

  const base = darajaBaseUrl(config.env)
  const credentials = Buffer.from(
    `${config.consumerKey}:${config.consumerSecret}`,
  ).toString('base64')

  try {
    const resp = await fetch(
      `${base}/oauth/v1/generate?grant_type=client_credentials`,
      {
        method: 'GET',
        headers: { Authorization: `Basic ${credentials}` },
      },
    )

    if (!resp.ok) {
      const text = await resp.text()
      return {
        success: false,
        error: `OAuth token request failed: ${resp.status}`,
        errorCode: 'OAUTH_ERROR',
      }
    }

    const data = (await resp.json()) as DarajaTokenResponse
    cachedToken = data.access_token
    // Expire 60s early to avoid edge-case failures
    tokenExpiresAt = now + parseInt(data.expires_in, 10) * 1000 - 60_000

    return { success: true, data: cachedToken }
  } catch (err) {
    return {
      success: false,
      error: `OAuth request exception: ${err instanceof Error ? err.message : 'unknown'}`,
      errorCode: 'OAUTH_EXCEPTION',
    }
  }
}

/** Clear cached token (for testing or forced refresh). */
export function clearTokenCache(): void {
  cachedToken = null
  tokenExpiresAt = 0
}
