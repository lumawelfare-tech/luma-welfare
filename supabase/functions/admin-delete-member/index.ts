import { handleCors, corsHeaders } from '../shared/cors.ts'
import {
  getAuthenticatedUser,
  createAdminClient,
  loadAdminSession,
  adminSessionDeniedResponse,
  handleAdminError,
  logAudit,
} from '../shared/supabase.ts'
import { rateLimitAsync } from '../shared/rate-limit.ts'
import { parseDeleteMemberBody, ValidationError } from '../shared/validate.ts'

/**
 * Superadmin permanent purge of closed members.
 * POST /admin-delete-member  body: { memberId } | { memberIds: string[] }
 *
 * DB work is transactional via admin_purge_closed_member RPC.
 * Auth: hard_delete → deleteUser; anonymize → ban + anonymize email
 *   (cannot delete auth.users while retaining financial FKs — CASCADE to members).
 */

type PurgeResult = {
  path: 'hard_delete' | 'anonymize'
  member_id: string
  reference?: string
  photo_url?: string | null
  claim_document_paths?: string[]
  member_document_paths?: string[]
  auth_action: 'delete_user' | 'ban_user'
}

function mapRpcError(message: string): { status: number; code: string; message: string } {
  const m = message.toLowerCase()
  if (m.includes('self_delete_blocked')) {
    return { status: 403, code: 'SELF_DELETE_BLOCKED', message: 'You cannot delete your own account.' }
  }
  if (m.includes('admin_delete_blocked')) {
    return { status: 403, code: 'ADMIN_DELETE_BLOCKED', message: 'Cannot delete an administrator account.' }
  }
  if (m.includes('member_not_closed')) {
    return { status: 409, code: 'MEMBER_NOT_CLOSED', message: 'Only closed members can be permanently deleted.' }
  }
  if (m.includes('member_not_found') || m.includes('p0002')) {
    return { status: 404, code: 'NOT_FOUND', message: 'Member not found.' }
  }
  if (m.includes('invalid_input')) {
    return { status: 400, code: 'VALIDATION', message: 'Invalid member id.' }
  }
  return { status: 500, code: 'PURGE_FAILED', message: 'Could not delete member. No changes were applied.' }
}

async function removeStorageArtifacts(
  adminClient: ReturnType<typeof createAdminClient>,
  memberId: string,
  photoUrl: string | null | undefined,
  claimPaths: string[],
  identityPaths: string[] = [],
): Promise<void> {
  try {
    const { data: files } = await adminClient.storage.from('avatars').list(memberId)
    if (files && files.length > 0) {
      await adminClient.storage.from('avatars').remove(files.map((f) => `${memberId}/${f.name}`))
    }
  } catch {
    /* non-fatal */
  }

  if (photoUrl && photoUrl.includes('/avatars/')) {
    const marker = '/avatars/'
    const idx = photoUrl.indexOf(marker)
    if (idx >= 0) {
      const path = photoUrl.slice(idx + marker.length).split('?')[0]
      if (path) {
        try {
          await adminClient.storage.from('avatars').remove([path])
        } catch {
          /* non-fatal */
        }
      }
    }
  }

  const claimKeys = claimPaths
    .map((p) => {
      if (!p || p === 'purged') return null
      const marker = '/claim-documents/'
      const i = p.indexOf(marker)
      if (i >= 0) return p.slice(i + marker.length).split('?')[0]
      if (!p.startsWith('http')) return p
      return null
    })
    .filter((x): x is string => !!x)

  if (claimKeys.length > 0) {
    try {
      await adminClient.storage.from('claim-documents').remove(claimKeys)
    } catch {
      /* non-fatal */
    }
  }

  const identityKeys = identityPaths
    .map((p) => (typeof p === 'string' && p && !p.startsWith('http') ? p : null))
    .filter((x): x is string => !!x)
  if (identityKeys.length > 0) {
    try {
      await adminClient.storage.from('member-documents').remove(identityKeys)
    } catch {
      /* non-fatal */
    }
  }

  try {
    const folders = ['identity', 'tax', 'family']
    for (const folder of folders) {
      const { data: files } = await adminClient.storage.from('member-documents').list(`${memberId}/${folder}`)
      if (files && files.length > 0) {
        await adminClient.storage.from('member-documents').remove(
          files.map((f) => `${memberId}/${folder}/${f.name}`),
        )
      }
    }
  } catch {
    /* non-fatal */
  }
}

async function applyAuthAction(
  adminClient: ReturnType<typeof createAdminClient>,
  memberId: string,
  action: 'delete_user' | 'ban_user',
): Promise<void> {
  if (action === 'delete_user') {
    const { error } = await adminClient.auth.admin.deleteUser(memberId)
    if (error) throw new Error(`AUTH_DELETE_FAILED: ${error.message}`)
    return
  }

  const anonEmail = `deleted-${memberId.replace(/-/g, '').slice(0, 12)}@purged.invalid`
  const { error } = await adminClient.auth.admin.updateUserById(memberId, {
    email: anonEmail,
    ban_duration: '876600h',
    user_metadata: { purged: true, display: 'Deleted member' },
  })
  if (error) throw new Error(`AUTH_BAN_FAILED: ${error.message}`)
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ message: 'Method not allowed', code: 'METHOD' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const user = await getAuthenticatedUser(req)
    if (!user) {
      return new Response(JSON.stringify({ message: 'Not authenticated', code: 'UNAUTHORIZED' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const adminClient = createAdminClient()
    const loaded = await loadAdminSession(adminClient, user.id, { req })
    if (loaded.status !== 'ok') {
      return adminSessionDeniedResponse(loaded)
    }
    const session = loaded.session

    if (!session.is_superadmin) {
      return new Response(JSON.stringify({
        message: 'Only superadmins can permanently delete members.',
        code: 'FORBIDDEN',
      }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const rl = await rateLimitAsync(req, 'admin-delete-member', {
      userId: session.id,
      adminClient,
      max: 20,
      windowMs: 60_000,
    })
    if (!rl.ok) return rl.response!

    let raw: unknown
    try {
      raw = await req.json()
    } catch {
      return new Response(JSON.stringify({ message: 'Invalid JSON body.', code: 'VALIDATION' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let memberIds: string[]
    try {
      memberIds = parseDeleteMemberBody(raw).memberIds
    } catch (e) {
      const message = e instanceof ValidationError ? e.message : 'Invalid request.'
      return new Response(JSON.stringify({ message, code: 'VALIDATION' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const results: Array<{
      member_id: string
      success: boolean
      path?: string
      reference?: string
      error?: string
      code?: string
    }> = []

    for (const memberId of memberIds) {
      try {
        const { data, error } = await adminClient.rpc('admin_purge_closed_member', {
          p_member_id: memberId,
          p_actor_id: session.id,
        })

        if (error) {
          const mapped = mapRpcError(error.message ?? '')
          results.push({
            member_id: memberId,
            success: false,
            error: mapped.message,
            code: mapped.code,
          })
          continue
        }

        const purge = data as PurgeResult
        await removeStorageArtifacts(
          adminClient,
          memberId,
          purge.photo_url,
          Array.isArray(purge.claim_document_paths) ? purge.claim_document_paths : [],
          Array.isArray(purge.member_document_paths) ? purge.member_document_paths : [],
        )

        try {
          await applyAuthAction(adminClient, memberId, purge.auth_action)
        } catch (authErr) {
          // DB already committed — report auth failure clearly (cannot roll back Auth from here)
          const msg = authErr instanceof Error ? authErr.message : 'Auth cleanup failed'
          await logAudit(adminClient, {
            actor_id: session.id,
            actor_role: session.role_name,
            action: 'member.purge_auth_incomplete',
            resource: 'member',
            resource_id: memberId,
            meta: { path: purge.path, auth_error: msg.slice(0, 120) },
          })
          results.push({
            member_id: memberId,
            success: false,
            path: purge.path,
            error: 'Member data purged but auth cleanup failed. Contact support.',
            code: 'AUTH_CLEANUP_FAILED',
          })
          continue
        }

        await logAudit(adminClient, {
          actor_id: session.id,
          actor_role: session.role_name,
          action: 'member.purged',
          resource: 'member',
          resource_id: memberId,
          meta: {
            path: purge.path,
            auth_action: purge.auth_action,
            reference: purge.reference ?? null,
            // never include name/phone/id_number/email
          },
        })

        results.push({
          member_id: memberId,
          success: true,
          path: purge.path,
          reference: purge.reference,
        })
      } catch (err) {
        const mapped = mapRpcError(err instanceof Error ? err.message : '')
        results.push({
          member_id: memberId,
          success: false,
          error: mapped.message,
          code: mapped.code,
        })
      }
    }

    const success = results.filter((r) => r.success).length
    const failed = results.length - success
    const status = failed === 0 ? 200 : success === 0 ? 400 : 207

    return new Response(JSON.stringify({
      results,
      summary: { total: results.length, success, failed },
    }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return handleAdminError(err, 'admin-delete-member')
  }
})
