import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY')
}

/**
 * Supabase client for the frontend.
 * Uses the publishable (anon) key — RLS enforces authorization.
 * Never use the service-role key in frontend code.
 */
export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
})

/**
 * Edge Function base URL.
 * In production this is the Supabase project's Edge Functions URL.
 * In development, use the local Supabase Edge Functions URL.
 */
export const edgeFunctionUrl = `${supabaseUrl}/functions/v1`
