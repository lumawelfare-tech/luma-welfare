/**
 * Member account status gates for Edge Functions.
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { corsHeaders } from './cors.ts'

export type MemberStatus = 'pending_approval' | 'active' | 'suspended' | 'closed'

/**
 * Returns null when the member is active; otherwise a 403 Response.
 * Missing member row is treated as not found (404) for mutating member flows.
 */
export async function assertMemberActive(
  adminClient: SupabaseClient,
  userId: string,
  opts: { allowMissing?: boolean } = {},
): Promise<Response | null> {
  const { data: member, error } = await adminClient
    .from('members')
    .select('status')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    return new Response(JSON.stringify({ message: 'Unable to verify membership status', code: 'INTERNAL' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  if (!member) {
    if (opts.allowMissing) return null
    return new Response(JSON.stringify({ message: 'Member profile not found', code: 'NOT_FOUND' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const status = member.status as MemberStatus
  if (status === 'active') return null

  if (status === 'pending_approval') {
    return new Response(JSON.stringify({
      message: 'Your account is pending approval. Please verify your email or wait for admin approval.',
      code: 'PENDING_APPROVAL',
    }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({
    message: 'Your account is suspended or closed. Contact Luma Welfare support for help.',
    code: 'ACCOUNT_INACTIVE',
  }), {
    status: 403,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
