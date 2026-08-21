import type { DbClient } from './supabase.js'

export type AuditEntry = {
  actor_id?: string | null
  actor_role?: string | null
  action: string
  resource: string
  resource_id?: string | null
  meta?: Record<string, unknown>
  ip?: string | null
}

export async function logAudit(
  admin: DbClient,
  entry: AuditEntry,
): Promise<void> {
  const { error } = await admin.from('audit_logs').insert({
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