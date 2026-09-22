/**
 * Logical SPA API paths → Supabase Edge Function names.
 * Kept free of env/supabase imports so CI can verify mappings without Vite.
 */

/** Split a path string into pathname and query string. */
export function splitPath(path: string): { pathname: string; search: string } {
  const clean = path.replace(/^\/+/, '')
  const qi = clean.indexOf('?')
  if (qi === -1) return { pathname: clean, search: '' }
  return { pathname: clean.slice(0, qi), search: clean.slice(qi) }
}

/**
 * Map API paths to Edge Function names.
 */
export function pathToFunctionName(path: string): string | null {
  const cleanPath = path

  // Auth routes
  if (cleanPath === 'auth/register') return 'auth-register'
  if (cleanPath === 'auth/login') return 'auth-login'
  if (cleanPath === 'auth/verify-email') return 'auth-verify-email'
  if (cleanPath === 'auth/me') return 'auth-me'
  if (cleanPath === 'auth/oauth-provision') return 'auth-oauth-provision'
  if (cleanPath === 'auth/google-authorize') return 'auth-google-authorize'

  // Member routes
  if (cleanPath === 'member/dashboard') return 'member-dashboard'
  if (cleanPath === 'member/profile') return 'member-profile'
  if (cleanPath.startsWith('member/family')) return 'member-family'
  if (cleanPath.startsWith('member/subscriptions')) return 'member-subscriptions'
  if (cleanPath.startsWith('member/registration-fee')) return 'member-registration-fee'
  if (cleanPath === 'contributions') return 'member-contributions'

  // Admin routes
  if (cleanPath === 'admin/dashboard') return 'admin-dashboard'
  if (cleanPath.startsWith('admin/monitoring') || cleanPath.startsWith('admin/health')) return 'admin-monitoring'
  if (cleanPath.startsWith('admin/reports')) return 'admin-reports'
  if (cleanPath.startsWith('admin/delete-member')) return 'admin-delete-member'
  if (cleanPath.startsWith('admin/manage-user-role')) return 'manage-user-role'
  if (cleanPath.startsWith('admin/members')) return 'admin-members'
  if (cleanPath.startsWith('admin/reveal-member-id')) return 'admin-reveal-member-id'
  if (cleanPath.startsWith('admin/packages')) return 'admin-packages'
  if (cleanPath.startsWith('admin/media')) return 'admin-media'
  if (cleanPath.startsWith('admin/contributions')) return 'admin-contributions'
  if (cleanPath.startsWith('admin/claims')) return 'admin-claims'
  if (cleanPath.startsWith('admin/complaints')) return 'admin-complaints'
  if (cleanPath.startsWith('admin/community')) return 'admin-community'
  if (cleanPath.startsWith('admin/documents')) return 'admin-documents'
  if (cleanPath.startsWith('admin/kb-ingest')) return 'admin-kb-ingest'
  if (cleanPath.startsWith('admin/subscriptions')) return 'admin-subscriptions'
  if (cleanPath.startsWith('admin/registration-fee')) return 'admin-registration-fee'
  if (cleanPath.startsWith('admin/2fa')) return 'admin-2fa'
  if (cleanPath.startsWith('admin/scheduled-reports')) return 'admin-scheduled-reports'
  if (cleanPath.startsWith('admin/notifications')) return 'admin-notifications'
  if (cleanPath.startsWith('admin/exports')) return 'admin-exports'
  if (cleanPath.startsWith('admin/reconciliation')) return 'admin-reconciliation'
  if (cleanPath.startsWith('admin/open-questions') || cleanPath.startsWith('admin/audit-logs') || cleanPath === 'admin/settings') {
    return 'admin-settings'
  }

  // Member routes (extended)
  if (cleanPath.startsWith('member/claims')) return 'member-claims'
  if (cleanPath.startsWith('member/complaints')) return 'member-complaints'
  if (cleanPath.startsWith('member/documents')) return 'member-documents'
  if (cleanPath.startsWith('member/assistant')) return 'member-assistant'
  if (cleanPath.startsWith('member/receipts')) return 'member-receipts'
  if (cleanPath.startsWith('member/notification-prefs')) return 'member-notification-prefs'
  if (cleanPath.startsWith('member/notifications')) return 'member-notifications'
  if (cleanPath.startsWith('member/push-subscriptions')) return 'member-push-subscriptions'

  // Payment routes (PAYMENTS_ENABLED may still gate handlers)
  if (cleanPath === 'payments/initiate') return 'payments-initiate'
  if (cleanPath.startsWith('payments') && !cleanPath.includes('callback')) return 'payments-list'

  // Content management routes
  if (cleanPath.startsWith('admin/gallery')) return 'admin-gallery'
  if (cleanPath.startsWith('admin/news')) return 'admin-news'

  // Public routes
  if (cleanPath === 'packages') return 'public-data'
  if (cleanPath === 'settings') return 'public-data'
  if (cleanPath === 'news') return 'public-data'
  if (cleanPath === 'gallery') return 'public-data'
  if (cleanPath === 'media') return 'public-data'
  if (cleanPath === 'contact') return 'contact'

  return null
}
