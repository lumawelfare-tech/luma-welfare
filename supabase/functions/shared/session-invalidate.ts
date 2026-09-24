/**
 * Global Auth session revoke. GoTrue admin.signOut requires a JWT, so we mint
 * a throwaway magic-link session (generateLink does not send email) then sign out.
 */
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

export async function invalidateUserSessions(
  adminClient: SupabaseClient,
  userId: string,
): Promise<void> {
  const { data: userData, error: getErr } = await adminClient.auth.admin.getUserById(userId)
  if (getErr || !userData.user) {
    throw new Error(`SESSION_INVALIDATE_LOOKUP: ${getErr?.message ?? 'missing user'}`)
  }
  const email = userData.user.email
  if (!email) {
    throw new Error('SESSION_INVALIDATE_NO_EMAIL')
  }

  const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
    type: 'magiclink',
    email,
  })
  const hashed = linkData?.properties?.hashed_token
  if (linkErr || !hashed) {
    throw new Error(`SESSION_INVALIDATE_LINK: ${linkErr?.message ?? 'no token'}`)
  }

  const { data: otpData, error: otpErr } = await adminClient.auth.verifyOtp({
    type: 'email',
    token_hash: hashed,
  })
  const jwt = otpData?.session?.access_token
  if (otpErr || !jwt) {
    throw new Error(`SESSION_INVALIDATE_OTP: ${otpErr?.message ?? 'no session'}`)
  }

  const { error: signOutErr } = await adminClient.auth.admin.signOut(jwt, 'global')
  if (signOutErr) {
    throw new Error(`SESSION_INVALIDATE_SIGNOUT: ${signOutErr.message}`)
  }
}

/** One retry. Caller already committed the status/role write. */
export async function invalidateUserSessionsWithRetry(
  adminClient: SupabaseClient,
  userId: string,
  logLabel = 'session-invalidate',
): Promise<boolean> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await invalidateUserSessions(adminClient, userId)
      return true
    } catch (err) {
      console.error(`${logLabel}: session invalidate attempt ${attempt}`, err instanceof Error ? err.name : 'unknown')
    }
  }
  return false
}
