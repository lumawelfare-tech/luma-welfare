import type { DbClient } from './supabase.js'
import { HttpError } from './http.js'
import type { AdminSession } from './context.js'
import { permissionKey } from './context.js'

export async function loadAdminSession(
  admin: DbClient,
  userId: string,
): Promise<AdminSession> {
  const { data, error } = await admin
    .from('admins')
    .select('id, display_name, role_id, is_superadmin, is_active, roles(name)')
    .eq('id', userId)
    .single()

  if (error || !data || !data.is_active) {
    throw new HttpError(403, 'No admin access for this account.', 'FORBIDDEN')
  }

  const { data: perms } = await admin
    .from('permissions')
    .select('resource, action')
    .eq('role_id', data.role_id)

  const permissions = new Set(
    (perms ?? []).map((p) => permissionKey(p.resource, p.action)),
  )

  return {
    id: data.id,
    display_name: data.display_name,
    role_id: data.role_id,
    role_name: (data.roles as unknown as { name: string }).name,
    is_superadmin: data.is_superadmin,
    permissions,
  }
}

export function requirePermission(
  session: AdminSession,
  resource: string,
  action: string,
): void {
  if (session.is_superadmin) return
  if (!session.permissions.has(permissionKey(resource, action))) {
    throw new HttpError(
      403,
      `You do not have permission to ${action} ${resource}.`,
      'FORBIDDEN',
    )
  }
}

export function isMemberActive(session: AdminSession): boolean {
  return session.is_superadmin
}