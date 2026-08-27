import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

/**
 * Load the admin session for the authenticated user.
 * Uses a single query with join to load admin + permissions in one round-trip.
 */
export async function loadAdminSession(
  adminClient: SupabaseClient,
  userId: string,
): Promise<{
  id: string
  display_name: string
  role_id: string
  role_name: string
  is_superadmin: boolean
  permissions: Set<string>
} | null> {
  // Query 1: Load admin profile with role name (uses existing idx)
  const { data: admin, error } = await adminClient
    .from('admins')
    .select('id, display_name, role_id, is_superadmin, is_active, roles(name)')
    .eq('id', userId)
    .eq('is_active', true)
    .single()

  if (error || !admin) return null

  // Query 2: Load permissions for this role (small table, fast)
  const { data: perms } = await adminClient
    .from('permissions')
    .select('resource, action')
    .eq('role_id', admin.role_id)

  const permissions = new Set(
    (perms ?? []).map((p: { resource: string; action: string }) => `${p.resource}:${p.action}`),
  )

  return {
    id: admin.id,
    display_name: admin.display_name,
    role_id: admin.role_id,
    role_name: (admin.roles as unknown as { name: string })?.name ?? 'unknown',
    is_superadmin: admin.is_superadmin,
    permissions,
  }
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
