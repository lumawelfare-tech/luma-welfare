/**
 * Phase 8 local smoke checklist — typecheck → lint → unit → qualify → build → migration tip.
 * Does not enable M-Pesa. Live RLS/E2E remain optional when secrets are present.
 *
 * Usage: npm run verify:phase8
 */
import { execSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')

function run(cmd: string) {
  console.log(`\n→ ${cmd}`)
  execSync(cmd, { cwd: root, stdio: 'inherit', env: process.env })
}

function latestMigration(): string {
  const dir = resolve(root, 'supabase/migrations')
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
  return files[files.length - 1] ?? '(none)'
}

console.log('Phase 8 smoke checklist')
console.log(`Latest migration: ${latestMigration()}`)

run('npm run typecheck')
run('npm run lint')
run('npm test')
run('npm run test:qualify')
run('npm run build')
run('npm run scan:bundle')
run('npm run guard:backend')

console.log('\n✅ Phase 8 smoke checklist passed (local, no live secrets required).')
console.log('Optional with secrets: npm run test:rls && npm run test:e2e')
console.log('Operator: set ENFORCE_LIVE_SECRETS=true after CI secrets are populated (docs/BRANCH_PROTECTION.md).')
console.log('Keep PAYMENTS_ENABLED and AI_ASSISTANT_ENABLED false until dedicated go-live.')
