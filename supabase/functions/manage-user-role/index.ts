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
import {
  parseManageUserRoleBody,
  SUPERADMIN_GRANT_CONFIRM,
  ValidationError,
  type StaffRoleName,
} from '../shared/validate.ts'
import { sanitizeSearch, buildIlikeOrFilter } from '../shared/search.ts'
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

/**
 * Staff & Roles — superadmin-only admin assignment management.
 *
 * GET  ?action=list|search|roles|history
 * POST body: { action: grant|change_role|revoke, targetId, roleName?, reason?, confirmSuperadmin? }
 *
 * Writes: service-role only (no client RPCs).
 * Session invalidation: Auth Admin generateLink → verifyOtp → admin.signOut(jwt, 'global')
 * (SDK requires a JWT; there is no logout-by-user-id Admin API in the deployed GoTrue/auth-js.)
 */

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

type RoleRow = { id: string; name: string; description: string | null }

type AdminRow = {
  id: string
  display_name: string
  role_id: string
  is_superadmin: boolean
  is_active: boolean
  granted_by: string | null
  granted_at: string | null
  roles: { name: string } | { name: string }[] | null
}

function roleNameOf(admin: AdminRow): string {
  const r = admin.roles
  if (Array.isArray(r)) return r[0]?.name ?? 'unknown'
  return r?.name ?? 'unknown'
}

async function countActiveSuperadmins(adminClient: SupabaseClient): Promise<number> {
  const { count, error } = await adminClient
    .from('admins')
    .select('id', { count: 'exact', head: true })
    .eq('is_superadmin', true)
    .eq('is_active', true)
  if (error) throw new Error(`SUPERADMIN_COUNT_FAILED: ${error.message}`)
  return count ?? 0
}

async function loadRoleByName(
  adminClient: SupabaseClient,
  name: StaffRoleName,
): Promise<RoleRow> {
  const { data, error } = await adminClient
    .from('roles')
    .select('id, name, description')
    .eq('name', name)
    .maybeSingle()
  if (error || !data) {
    throw new ValidationError('Unknown role.')
  }
  return data as RoleRow
}

/**
 * Invalidate all Auth sessions for target via supported Admin API.
 * admin.signOut(jwt, 'global') requires a JWT; mint a throwaway magic-link
 * session (generateLink does not send email) then globally sign out.
 */
async function invalidateUserSessions(
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

/** One retry, then report incomplete — role write already committed. */
async function invalidateUserSessionsWithRetry(
  adminClient: SupabaseClient,
  userId: string,
): Promise<boolean> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await invalidateUserSessions(adminClient, userId)
      return true
    } catch (err) {
      console.error(`manage-user-role: session invalidate attempt ${attempt}`, err)
    }
  }
  return false
}

async function invalidateAfterRoleChange(
  adminClient: SupabaseClient,
  actor: { id: string; role_name: string },
  targetId: string,
  op: string,
): Promise<boolean> {
  const ok = await invalidateUserSessionsWithRetry(adminClient, targetId)
  if (!ok) {
    await logAudit(adminClient, {
      actor_id: actor.id,
      actor_role: actor.role_name,
      action: 'staff.session_invalidate_incomplete',
      resource: 'admin',
      resource_id: targetId,
      meta: { target_id: targetId, op },
    })
  }
  return ok
}

type EligibilityOk = {
  ok: true
  member: { id: string; full_name: string; email: string | null; status: string }
  authConfirmed: boolean
}
type EligibilityFail = { ok: false; status: number; code: string; message: string }

async function assertStaffEligible(
  adminClient: SupabaseClient,
  targetId: string,
): Promise<EligibilityOk | EligibilityFail> {
  const { data: authUser, error: authErr } = await adminClient.auth.admin.getUserById(targetId)
  if (authErr || !authUser.user) {
    return { ok: false, status: 404, code: 'TARGET_NOT_FOUND', message: 'Target user not found.' }
  }
  if (!authUser.user.email_confirmed_at) {
    return {
      ok: false,
      status: 403,
      code: 'TARGET_UNVERIFIED',
      message: 'Target email is not confirmed.',
    }
  }

  const { data: member, error: memErr } = await adminClient
    .from('members')
    .select('id, full_name, email, status, anonymized_at')
    .eq('id', targetId)
    .maybeSingle()

  if (memErr) {
    return { ok: false, status: 500, code: 'INTERNAL', message: 'Unable to verify membership.' }
  }
  if (!member) {
    return { ok: false, status: 404, code: 'NOT_MEMBER', message: 'Target is not a Luma member.' }
  }
  if (member.anonymized_at) {
    return {
      ok: false,
      status: 403,
      code: 'TARGET_INELIGIBLE',
      message: 'Target member record is anonymized.',
    }
  }
  if (member.status !== 'active') {
    return {
      ok: false,
      status: 403,
      code: 'TARGET_INELIGIBLE',
      message: 'Target member must be active.',
    }
  }

  return {
    ok: true,
    member: {
      id: member.id,
      full_name: member.full_name,
      email: member.email,
      status: member.status,
    },
    authConfirmed: true,
  }
}

async function loadAdminRow(
  adminClient: SupabaseClient,
  targetId: string,
): Promise<AdminRow | null> {
  const { data, error } = await adminClient
    .from('admins')
    .select('id, display_name, role_id, is_superadmin, is_active, granted_by, granted_at, roles(name)')
    .eq('id', targetId)
    .maybeSingle()
  if (error) throw new Error(`ADMIN_LOOKUP_FAILED: ${error.message}`)
  return (data as AdminRow | null) ?? null
}

function assertSuperadminInvariant(roleName: string, isSuperadmin: boolean): void {
  const shouldBe = roleName === 'superadmin'
  if (shouldBe !== isSuperadmin) {
    throw new Error('SUPERADMIN_INVARIANT: role name and is_superadmin flag disagree')
  }
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    if (req.method !== 'GET' && req.method !== 'POST') {
      return json({ message: 'Method not allowed', code: 'METHOD' }, 405)
    }

    const user = await getAuthenticatedUser(req)
    if (!user) {
      return json({ message: 'Not authenticated', code: 'UNAUTHORIZED' }, 401)
    }

    const adminClient = createAdminClient()
    const loaded = await loadAdminSession(adminClient, user.id, { req })
    if (loaded.status !== 'ok') {
      return adminSessionDeniedResponse(loaded)
    }
    const session = loaded.session

    if (!session.is_superadmin || session.role_name !== 'superadmin') {
      return json({
        message: 'Only superadmins can manage staff roles.',
        code: 'FORBIDDEN',
      }, 403)
    }

    const url = new URL(req.url)
    const actionParam = (url.searchParams.get('action') ?? '').toLowerCase()

    // ---------- GET companions ----------
    if (req.method === 'GET') {
      if (actionParam === 'roles') {
        const { data, error } = await adminClient
          .from('roles')
          .select('id, name, description')
          .order('name')
        if (error) throw new Error(error.message)
        return json({ roles: data ?? [] })
      }

      if (actionParam === 'list') {
        const includeInactive = url.searchParams.get('include_inactive') === 'true'
        let q = adminClient
          .from('admins')
          .select('id, display_name, role_id, is_superadmin, is_active, granted_by, granted_at, roles(name)')
          .order('display_name')
        if (!includeInactive) q = q.eq('is_active', true)
        const { data: admins, error } = await q
        if (error) throw new Error(error.message)

        const rows = (admins ?? []) as AdminRow[]
        const ids = rows.map((a) => a.id)
        const grantorIds = [...new Set(rows.map((a) => a.granted_by).filter(Boolean))] as string[]

        const { data: members } = ids.length
          ? await adminClient.from('members').select('id, email, full_name').in('id', ids)
          : { data: [] as Array<{ id: string; email: string | null; full_name: string }> }
        const memberMap = new Map((members ?? []).map((m) => [m.id, m]))

        const { data: grantors } = grantorIds.length
          ? await adminClient.from('admins').select('id, display_name').in('id', grantorIds)
          : { data: [] as Array<{ id: string; display_name: string }> }
        const grantorMap = new Map((grantors ?? []).map((g) => [g.id, g.display_name]))

        const staff = rows.map((a) => {
          const m = memberMap.get(a.id)
          return {
            id: a.id,
            display_name: a.display_name || m?.full_name || 'Staff',
            email: m?.email ?? null,
            role: roleNameOf(a),
            is_superadmin: a.is_superadmin === true,
            is_active: a.is_active === true,
            granted_by: a.granted_by,
            granted_by_name: a.granted_by ? (grantorMap.get(a.granted_by) ?? null) : null,
            granted_at: a.granted_at,
            is_self: a.id === session.id,
          }
        })
        return json({ staff })
      }

      if (actionParam === 'search') {
        const q = sanitizeSearch(url.searchParams.get('q') ?? '', 64)
        if (!q || q.length < 2) {
          return json({ results: [] })
        }
        const orFilter = buildIlikeOrFilter(['full_name', 'email', 'phone'], q, 64)
        if (!orFilter) return json({ results: [] })

        const { data: members, error } = await adminClient
          .from('members')
          .select('id, full_name, email, phone, status')
          .is('anonymized_at', null)
          .eq('status', 'active')
          .or(orFilter)
          .limit(20)
        if (error) throw new Error(error.message)

        const results = (members ?? []).map((m) => ({
          id: m.id,
          full_name: m.full_name,
          email: m.email,
          phone: m.phone,
        }))
        return json({ results })
      }

      if (actionParam === 'history') {
        const { data, error } = await adminClient
          .from('audit_logs')
          .select('id, actor_id, actor_role, action, resource, resource_id, meta, created_at')
          .like('action', 'staff.%')
          .order('created_at', { ascending: false })
          .limit(100)
        if (error) throw new Error(error.message)
        return json({ items: data ?? [] })
      }

      return json({ message: 'Unknown action. Use list, search, roles, or history.', code: 'VALIDATION' }, 400)
    }

    // ---------- POST mutations ----------
    const rl = await rateLimitAsync(req, 'manage-user-role', {
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
      return json({ message: 'Invalid JSON body.', code: 'VALIDATION' }, 400)
    }

    let parsed
    try {
      parsed = parseManageUserRoleBody(raw)
    } catch (e) {
      const message = e instanceof ValidationError ? e.message : 'Invalid request.'
      return json({ message, code: 'VALIDATION' }, 400)
    }

    if (parsed.targetId === session.id) {
      return json({
        message: 'You cannot change your own staff role.',
        code: 'SELF_OPERATION_BLOCKED',
      }, 403)
    }

    // ----- revoke -----
    if (parsed.action === 'revoke') {
      const existing = await loadAdminRow(adminClient, parsed.targetId)
      if (!existing || !existing.is_active) {
        return json({ message: 'Active staff assignment not found.', code: 'NOT_FOUND' }, 404)
      }

      if (existing.is_superadmin) {
        const n = await countActiveSuperadmins(adminClient)
        if (n <= 1) {
          return json({
            message: 'Cannot revoke the last active superadmin.',
            code: 'LAST_SUPERADMIN',
          }, 409)
        }
      }

      const previousRole = roleNameOf(existing)
      const { error: updErr } = await adminClient
        .from('admins')
        .update({
          is_active: false,
          is_superadmin: false,
          updated_at: new Date().toISOString(),
        })
        .eq('id', parsed.targetId)
        .eq('is_active', true)

      if (updErr) throw new Error(updErr.message)

      await logAudit(adminClient, {
        actor_id: session.id,
        actor_role: session.role_name,
        action: 'staff.revoked',
        resource: 'admin',
        resource_id: parsed.targetId,
        meta: {
          target_id: parsed.targetId,
          previous_role: previousRole,
          reason: parsed.reason ?? null,
        },
      })

      const sessionInvalidated = await invalidateAfterRoleChange(
        adminClient,
        session,
        parsed.targetId,
        'revoke',
      )

      return json({
        ok: true,
        action: 'revoke',
        target_id: parsed.targetId,
        previous_role: previousRole,
        session_invalidated: sessionInvalidated,
        ...(sessionInvalidated ? {} : { code: 'SESSION_INVALIDATE_INCOMPLETE' }),
      })
    }

    // ----- grant / change_role -----
    const roleName = parsed.roleName!
    const role = await loadRoleByName(adminClient, roleName)
    const wantSuper = roleName === 'superadmin'
    assertSuperadminInvariant(roleName, wantSuper)

    if (wantSuper && parsed.confirmSuperadmin !== SUPERADMIN_GRANT_CONFIRM) {
      return json({
        message: `Granting superadmin requires typing ${SUPERADMIN_GRANT_CONFIRM} exactly.`,
        code: 'VALIDATION',
      }, 400)
    }

    const eligible = await assertStaffEligible(adminClient, parsed.targetId)
    if (!eligible.ok) {
      return json({ message: eligible.message, code: eligible.code }, eligible.status)
    }

    const existing = await loadAdminRow(adminClient, parsed.targetId)

    // Idempotent: already active with same role
    if (
      existing &&
      existing.is_active &&
      existing.role_id === role.id &&
      existing.is_superadmin === wantSuper
    ) {
      return json({
        ok: true,
        action: 'noop',
        target_id: parsed.targetId,
        role: roleName,
        message: 'Staff already has this role.',
      })
    }

    // Demotion / change away from superadmin — last-superadmin guard
    if (existing?.is_active && existing.is_superadmin && !wantSuper) {
      const n = await countActiveSuperadmins(adminClient)
      if (n <= 1) {
        return json({
          message: 'Cannot demote the last active superadmin.',
          code: 'LAST_SUPERADMIN',
        }, 409)
      }
    }

    const now = new Date().toISOString()
    const previousRole = existing ? roleNameOf(existing) : null
    const wasInactive = existing ? !existing.is_active : false
    const isRoleChange = !!(existing && existing.is_active && existing.role_id !== role.id)
    const isReactivation = !!(existing && wasInactive)

    // Explicit change_role requires an active admin row
    if (parsed.action === 'change_role') {
      if (!existing || !existing.is_active) {
        return json({
          message: 'Active staff assignment not found. Use grant to assign.',
          code: 'NOT_FOUND',
        }, 404)
      }
    }

    const payload = {
      id: parsed.targetId,
      display_name: eligible.member.full_name || existing?.display_name || 'Staff',
      role_id: role.id,
      is_superadmin: wantSuper,
      is_active: true,
      granted_by: session.id,
      granted_at: now,
      updated_at: now,
    }

    if (existing) {
      const { error: updErr } = await adminClient
        .from('admins')
        .update({
          display_name: payload.display_name,
          role_id: payload.role_id,
          is_superadmin: payload.is_superadmin,
          is_active: true,
          granted_by: payload.granted_by,
          granted_at: payload.granted_at,
          updated_at: payload.updated_at,
        })
        .eq('id', parsed.targetId)
      if (updErr) throw new Error(updErr.message)
    } else {
      const { error: insErr } = await adminClient.from('admins').insert({
        ...payload,
        created_at: now,
        two_factor_enabled: false,
      })
      if (insErr) throw new Error(insErr.message)
    }

    const auditAction = isRoleChange && !isReactivation
      ? 'staff.role_changed'
      : 'staff.granted'

    await logAudit(adminClient, {
      actor_id: session.id,
      actor_role: session.role_name,
      action: auditAction,
      resource: 'admin',
      resource_id: parsed.targetId,
      meta: {
        target_id: parsed.targetId,
        previous_role: previousRole,
        new_role: roleName,
        reason: parsed.reason ?? null,
        reactivated: isReactivation,
      },
    })

    // Material change → invalidate sessions (skip pure no-op already returned)
    const material =
      isReactivation ||
      isRoleChange ||
      !existing ||
      (existing && existing.is_superadmin !== wantSuper)

    let sessionInvalidated = true
    if (material) {
      sessionInvalidated = await invalidateAfterRoleChange(
        adminClient,
        session,
        parsed.targetId,
        auditAction,
      )
    }

    return json({
      ok: true,
      action: isReactivation ? 'reactivate' : isRoleChange ? 'change_role' : 'grant',
      target_id: parsed.targetId,
      previous_role: previousRole,
      new_role: roleName,
      session_invalidated: sessionInvalidated,
      ...(sessionInvalidated ? {} : { code: 'SESSION_INVALIDATE_INCOMPLETE' }),
    })
  } catch (err) {
    if (err instanceof ValidationError) {
      return json({ message: err.message, code: 'VALIDATION' }, 400)
    }
    return handleAdminError(err, 'manage-user-role')
  }
})
