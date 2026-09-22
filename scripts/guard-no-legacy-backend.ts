/**
 * CI guard: fail if the frontend still references a non-Supabase application backend.
 *
 * Allowed network targets for app data:
 *   - VITE_SUPABASE_URL / *.supabase.co (Auth, Edge Functions, Storage, Realtime)
 *   - Same-origin static assets and Vercel cron (/api/cron/*)
 *   - Third-party SDKs already allowlisted below (Sentry ingest, OAuth hosts)
 *
 * Forbidden leftovers from the removed Hono/Node API:
 *   - hono / @hono imports
 *   - VITE_API_URL
 *   - localhost:3001 (legacy Node port)
 *   - Absolute URLs to non-Supabase API hosts used as the app backend
 *
 * Usage: npx tsx scripts/guard-no-legacy-backend.ts
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const FRONTEND_SRC = resolve(ROOT, 'frontend/src')
const FUNCTIONS_DIR = resolve(ROOT, 'supabase/functions')

const FORBIDDEN_PATTERNS: { name: string; re: RegExp }[] = [
  { name: 'hono import', re: /from\s+['"]hono(?:\/[^'"]*)?['"]|require\(['"]hono/ },
  { name: '@hono package', re: /@hono\// },
  { name: 'VITE_API_URL', re: /VITE_API_URL/ },
  { name: 'legacy localhost:3001', re: /localhost:3001|127\.0\.0\.1:3001/ },
  {
    name: 'legacy /api app backend (not Vercel cron)',
    // Match fetch('/api/...') or "`/api/..." excluding /api/cron
    re: /(?:fetch|axios)\(\s*[`'"]\/api\/(?!cron\/)/,
  },
]

/** Absolute hosts that look like a private app API (not webhooks / SaaS docs). */
const FORBIDDEN_HOST_RE =
  /https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\/(?:api|v1|graphql)\b/i

/** Explicit leftover backend base URLs (excluding Supabase). */
const FORBIDDEN_BACKEND_BASE_RE =
  /https?:\/\/(?!(?:[\w.-]+\.)?supabase\.co)[\w.-]+(?::\d+)?\/(?:api\/v1|backend|hono)\b/i

function walk(dir: string, files: string[] = []): string[] {
  if (!existsSync(dir)) return files
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === 'dist') continue
      walk(p, files)
    } else if (/\.(ts|tsx|js|jsx)$/.test(name)) {
      files.push(p)
    }
  }
  return files
}

function listEdgeFunctions(): Set<string> {
  const names = new Set<string>()
  if (!existsSync(FUNCTIONS_DIR)) return names
  for (const name of readdirSync(FUNCTIONS_DIR)) {
    if (name === 'shared') continue
    const index = join(FUNCTIONS_DIR, name, 'index.ts')
    if (existsSync(index)) names.add(name)
  }
  return names
}

/** Paths exercised by the SPA — must map to an existing Edge Function. */
const REQUIRED_MAPPINGS: { path: string; fn: string }[] = [
  { path: 'auth/register', fn: 'auth-register' },
  { path: 'auth/login', fn: 'auth-login' },
  { path: 'auth/verify-email', fn: 'auth-verify-email' },
  { path: 'auth/me', fn: 'auth-me' },
  { path: 'auth/oauth-provision', fn: 'auth-oauth-provision' },
  { path: 'auth/google-authorize', fn: 'auth-google-authorize' },
  { path: 'member/dashboard', fn: 'member-dashboard' },
  { path: 'member/profile', fn: 'member-profile' },
  { path: 'member/family', fn: 'member-family' },
  { path: 'member/subscriptions', fn: 'member-subscriptions' },
  { path: 'member/registration-fee', fn: 'member-registration-fee' },
  { path: 'member/claims', fn: 'member-claims' },
  { path: 'member/complaints', fn: 'member-complaints' },
  { path: 'member/documents', fn: 'member-documents' },
  { path: 'member/assistant', fn: 'member-assistant' },
  { path: 'member/receipts', fn: 'member-receipts' },
  { path: 'member/notifications', fn: 'member-notifications' },
  { path: 'member/notification-prefs', fn: 'member-notification-prefs' },
  { path: 'member/push-subscriptions', fn: 'member-push-subscriptions' },
  { path: 'contributions', fn: 'member-contributions' },
  { path: 'admin/dashboard', fn: 'admin-dashboard' },
  { path: 'admin/members', fn: 'admin-members' },
  { path: 'admin/packages', fn: 'admin-packages' },
  { path: 'admin/claims', fn: 'admin-claims' },
  { path: 'admin/complaints', fn: 'admin-complaints' },
  { path: 'admin/community', fn: 'admin-community' },
  { path: 'admin/documents', fn: 'admin-documents' },
  { path: 'admin/kb-ingest', fn: 'admin-kb-ingest' },
  { path: 'admin/contributions', fn: 'admin-contributions' },
  { path: 'admin/subscriptions', fn: 'admin-subscriptions' },
  { path: 'admin/registration-fee', fn: 'admin-registration-fee' },
  { path: 'admin/2fa', fn: 'admin-2fa' },
  { path: 'admin/settings', fn: 'admin-settings' },
  { path: 'admin/reports', fn: 'admin-reports' },
  { path: 'admin/scheduled-reports', fn: 'admin-scheduled-reports' },
  { path: 'admin/notifications', fn: 'admin-notifications' },
  { path: 'admin/exports', fn: 'admin-exports' },
  { path: 'admin/reconciliation', fn: 'admin-reconciliation' },
  { path: 'admin/monitoring', fn: 'admin-monitoring' },
  { path: 'admin/gallery', fn: 'admin-gallery' },
  { path: 'admin/news', fn: 'admin-news' },
  { path: 'admin/media', fn: 'admin-media' },
  { path: 'packages', fn: 'public-data' },
  { path: 'settings', fn: 'public-data' },
  { path: 'news', fn: 'public-data' },
  { path: 'gallery', fn: 'public-data' },
  { path: 'media', fn: 'public-data' },
  { path: 'contact', fn: 'contact' },
  { path: 'payments/initiate', fn: 'payments-initiate' },
  { path: 'payments', fn: 'payments-list' },
]

async function main() {
  let failures = 0

  const files = walk(FRONTEND_SRC)
  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    const rel = relative(ROOT, file)
    for (const { name, re } of FORBIDDEN_PATTERNS) {
      if (re.test(text)) {
        console.error(`FAIL [${name}] ${rel}`)
        failures++
      }
    }
    if (FORBIDDEN_HOST_RE.test(text) || FORBIDDEN_BACKEND_BASE_RE.test(text)) {
      console.error(`FAIL [non-Supabase API host] ${rel}`)
      failures++
    }
  }

  // Dynamically import path mapper (no Vite/env deps)
  const { pathToFunctionName } = await import('../frontend/src/lib/api-routes.ts')
  const edgeFns = listEdgeFunctions()

  for (const { path, fn } of REQUIRED_MAPPINGS) {
    const mapped = pathToFunctionName(path)
    if (mapped !== fn) {
      console.error(`FAIL [path map] "${path}" → expected "${fn}", got "${mapped}"`)
      failures++
    }
    if (!edgeFns.has(fn)) {
      console.error(`FAIL [missing function source] supabase/functions/${fn}/index.ts`)
      failures++
    }
  }

  if (failures > 0) {
    console.error(`\nLegacy-backend guard failed: ${failures} issue(s)`)
    process.exit(1)
  }

  console.log(
    `Legacy-backend guard OK (${files.length} frontend files, ${REQUIRED_MAPPINGS.length} path mappings, ${edgeFns.size} edge functions)`,
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
