/**
 * Scan production build output for leaked secret patterns.
 * Run after `npm run build` (or as part of CI build job).
 *
 * Usage: npx tsx scripts/scan-client-bundle.ts
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

const dist = resolve('frontend/dist')
const patterns: { name: string; re: RegExp }[] = [
  { name: 'service_role JWT-like', re: /service_role/i },
  { name: 'SUPABASE_SERVICE_ROLE', re: /SUPABASE_SERVICE_ROLE/ },
  { name: 'eyJ service payload hint', re: /eyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}.*role["']?\s*:\s*["']service_role/ },
  { name: 'MPESA consumer secret var', re: /MPESA_CONSUMER_SECRET|MPESA_PASSKEY/ },
  { name: 'CRON_SECRET literal assignment', re: /CRON_SECRET\s*[:=]\s*['"][^'"]+['"]/ },
]

function walk(dir: string, files: string[] = []): string[] {
  if (!existsSync(dir)) return files
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, files)
    else if (/\.(js|css|html|map)$/.test(name)) files.push(p)
  }
  return files
}

if (!existsSync(dist)) {
  console.error('frontend/dist missing — run npm run build first')
  process.exit(2)
}

const files = walk(dist)
let hits = 0
for (const file of files) {
  const text = readFileSync(file, 'utf8')
  for (const { name, re } of patterns) {
    if (re.test(text)) {
      console.error(`FAIL ${name} in ${file}`)
      hits++
    }
  }
}

if (hits > 0) {
  console.error(`Bundle scan failed: ${hits} hit(s)`)
  process.exit(1)
}

console.log(`Bundle scan OK (${files.length} files, no secret patterns)`)
