import type { SupabaseClient } from '@supabase/supabase-js'
import type { SupabaseContext } from '@supabase/server'
import { withSupabase as withSupabaseRaw } from '@supabase/server/adapters/hono'
import type { WithSupabaseConfig, AuthModeWithKey } from '@supabase/server'
import type { Database } from '../types/database.js'
import type { MiddlewareHandler } from 'hono'

// The Database type is used for documentation and generated types. At runtime
// the Supabase client from @supabase/server doesn't propagate the generic
// through its middleware chain, so we cast to `any` for query builder typing.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DbClient = SupabaseClient<any>

/** Typed withSupabase that always binds our Database type. */
export function withSupabase(
  config?: Omit<WithSupabaseConfig, 'cors'> & { auth?: AuthModeWithKey | AuthModeWithKey[] },
): MiddlewareHandler<{
  Variables: {
    supabaseContext: SupabaseContext<Database>
  }
}> {
  return withSupabaseRaw<Database>(config) as MiddlewareHandler<{
    Variables: {
      supabaseContext: SupabaseContext<Database>
    }
  }>
}

export function typedDb(
  ctx: SupabaseContext<Database>,
): {
  supabase: DbClient
  supabaseAdmin: DbClient
  userClaims: SupabaseContext['userClaims']
} {
  return {
    supabase: ctx.supabase as unknown as DbClient,
    supabaseAdmin: ctx.supabaseAdmin as unknown as DbClient,
    userClaims: ctx.userClaims,
  }
}