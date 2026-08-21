import type { SupabaseContext } from '@supabase/server'
import type { Context } from 'hono'

declare module 'hono' {
  interface ContextVariableMap {
    supabaseContext: SupabaseContext
  }
}

export type AppContext = Context<{ Variables: { supabaseContext: SupabaseContext } }>

export type AdminSession = {
  id: string
  display_name: string
  role_id: string
  role_name: string
  is_superadmin: boolean
  permissions: Set<string>
}

export function permissionKey(resource: string, action: string): string {
  return `${resource}:${action}`
}