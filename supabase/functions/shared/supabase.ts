import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { corsHeaders } from './cors.ts'
import { extractAdmin2faStepUpToken, verifyAdmin2faStepUpToken } from './admin-2fa-token.ts'

/**
 * Create a Supabase client with the user's JWT (RLS enforced).
 */
export function createUserClient(req: Request): SupabaseClient {
  const authHeader = req.headers.get('Authorization') ?? ''
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )
}

/**
 * Create a Supabase admin client (service-role, bypasses RLS).
 * Only use in trusted server-side operations.
 */
export function createAdminClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
}

/**
 * Extract the authenticated user from the request.
 * Returns null if not authenticated.
 */
export async function getAuthenticatedUser(req: Request): Promise<{ id: string; email?: string } | null> {
  const userClient = createUserClient(req)
  const { data: { user }, error } = await userClient.auth.getUser()
  if (error || !user) return null
  return { id: user.id, email: user.email }
}

export type AdminSession = {
  id: string
  display_name: string
  role_id: string
  role_name: string
  is_superadmin: boolean
  permissions: Set<string>
  two_factor_enabled: boolean
}

export type LoadAdminSessionResult =
  | { status: 'ok'; session: AdminSession }
  | { status: 'forbidden' }
  | { status: '2fa_required' }
  | { status: '2fa_setup_required' }

/**
 * Load the admin session for the authenticated user.
 * When two_factor_enabled and skip2faCheck is false, requires a valid
 * x-admin-2fa-token step-up header.
 */
export async function loadAdminSession(
  adminClient: SupabaseClient,
  userId: string,
  opts?: { req?: Request; skip2faCheck?: boolean },
): Promise<LoadAdminSessionResult> {
  const { data: admin, error } = await adminClient
    .from('admins')
    .select('id, display_name, role_id, is_superadmin, is_active, two_factor_enabled, roles(name)')
    .eq('id', userId)
    .eq('is_active', true)
    .single()

  if (error || !admin) return { status: 'forbidden' }

  const twoFactorEnabled = admin.two_factor_enabled === true
  if (!twoFactorEnabled && !opts?.skip2faCheck) {
    return { status: '2fa_setup_required' }
  }
  if (twoFactorEnabled && !opts?.skip2faCheck) {
    const token = opts?.req ? extractAdmin2faStepUpToken(opts.req) : null
    const ok = await verifyAdmin2faStepUpToken(userId, token)
    if (!ok) return { status: '2fa_required' }
  }

  const { data: perms } = await adminClient
    .from('permissions')
    .select('resource, action')
    .eq('role_id', admin.role_id)

  const permissions = new Set(
    (perms ?? []).map((p: { resource: string; action: string }) => `${p.resource}:${p.action}`),
  )

  return {
    status: 'ok',
    session: {
      id: admin.id,
      display_name: admin.display_name,
      role_id: admin.role_id,
      role_name: (admin.roles as unknown as { name: string })?.name ?? 'unknown',
      is_superadmin: admin.is_superadmin,
      permissions,
      two_factor_enabled: twoFactorEnabled,
    },
  }
}

/** Standard responses for loadAdminSession failures. */
export function adminSessionDeniedResponse(result: Exclude<LoadAdminSessionResult, { status: 'ok' }>): Response {
  if (result.status === '2fa_required') {
    return new Response(JSON.stringify({
      message: 'Two-factor authentication required',
      code: 'ADMIN_2FA_REQUIRED',
    }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  if (result.status === '2fa_setup_required') {
    return new Response(JSON.stringify({
      message: 'Two-factor authentication must be enabled for staff accounts',
      code: 'ADMIN_2FA_SETUP_REQUIRED',
    }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  return new Response(JSON.stringify({ message: 'No admin access', code: 'FORBIDDEN' }), {
    status: 403,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

/**
 * Check if the admin session has the required permission.
 */
export function requirePermission(
  session: { is_superadmin: boolean; permissions: Set<string> },
  resource: string,
  action: string,
): void {
  if (session.is_superadmin) return
  if (!session.permissions.has(`${resource}:${action}`)) {
    throw new Error(`FORBIDDEN: You do not have permission to ${action} ${resource}.`)
  }
}

/**
 * Map thrown admin errors to HTTP responses.
 * `FORBIDDEN:*` from requirePermission must be 403, never 500.
 */
export function handleAdminError(err: unknown, logLabel = 'admin'): Response {
  if (err instanceof Error && err.message.startsWith('FORBIDDEN:')) {
    return new Response(JSON.stringify({
      message: err.message.replace(/^FORBIDDEN:\s*/, '') || 'Insufficient permissions',
      code: 'FORBIDDEN',
    }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  console.error(`${logLabel} error:`, err)
  const message = err instanceof Error ? err.message : 'An unexpected error occurred.'
  if (/not found/i.test(message)) {
    return new Response(JSON.stringify({ message, code: 'NOT_FOUND' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  return new Response(JSON.stringify({
    message: 'An unexpected error occurred.',
    code: 'INTERNAL',
  }), {
    status: 500,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

/** Member / public 500s — never echo raw Error.message (schema, SQL, stack). */
export function handleUnexpectedError(err: unknown, logLabel: string): Response {
  console.error(`${logLabel} error:`, err instanceof Error ? err.name : 'unknown')
  return new Response(JSON.stringify({
    message: 'An unexpected error occurred.',
    code: 'INTERNAL',
  }), {
    status: 500,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

/**
 * Log an audit entry.
 */
export async function logAudit(
  adminClient: SupabaseClient,
  entry: {
    actor_id?: string | null
    actor_role?: string | null
    action: string
    resource: string
    resource_id?: string | null
    meta?: Record<string, unknown>
    ip?: string | null
  },
): Promise<void> {
  const { error } = await adminClient.from('audit_logs').insert({
    actor_id: entry.actor_id ?? null,
    actor_role: entry.actor_role ?? null,
    action: entry.action,
    resource: entry.resource,
    resource_id: entry.resource_id ?? null,
    meta: entry.meta ?? {},
    ip: entry.ip ?? null,
  })
  if (error) {
    console.error('audit_log insert failed:', error.message)
  }
}

/**
 * Validate input with a simple schema check.
 */
export function validateBody(body: unknown, schema: Record<string, string>): { valid: true; data: Record<string, unknown> } | { valid: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Send a JSON body.' }
  }
  const data = body as Record<string, unknown>
  for (const [key, type] of Object.entries(schema)) {
    if (type === 'required' && (data[key] === undefined || data[key] === null || data[key] === '')) {
      return { valid: false, error: `${key} is required.` }
    }
  }
  return { valid: true, data }
}
