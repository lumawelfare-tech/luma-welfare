/**
 * Fail production builds when legal draft is cleared but placeholders remain,
 * and keep Edge/frontend policy versions in sync.
 *
 * Usage: npx tsx scripts/check-legal-config.ts
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  legalConfig,
  listUnresolvedLegalPlaceholders,
  assertLegalConfigReadyForRelease,
} from '../frontend/src/config/legal.ts'

const ROOT = resolve(import.meta.dirname, '..')

function extractExport(source: string, name: string): string | null {
  const re = new RegExp(`export const ${name}\\s*=\\s*['"]([^'"]+)['"]`)
  const m = source.match(re)
  return m?.[1] ?? null
}

function main() {
  const edgeSrc = readFileSync(
    resolve(ROOT, 'supabase/functions/shared/legal-versions.ts'),
    'utf8',
  )
  const edgePrivacy = extractExport(edgeSrc, 'PRIVACY_POLICY_VERSION')
  const edgeTerms = extractExport(edgeSrc, 'TERMS_VERSION')
  const edgeConstitution = extractExport(edgeSrc, 'CONSTITUTION_VERSION')

  let failures = 0

  if (edgePrivacy !== legalConfig.privacyPolicyVersion) {
    console.error(
      `FAIL privacy version mismatch: frontend=${legalConfig.privacyPolicyVersion} edge=${edgePrivacy}`,
    )
    failures++
  }
  if (edgeTerms !== legalConfig.termsVersion) {
    console.error(
      `FAIL terms version mismatch: frontend=${legalConfig.termsVersion} edge=${edgeTerms}`,
    )
    failures++
  }
  if (edgeConstitution !== legalConfig.constitutionVersion) {
    console.error(
      `FAIL constitution version mismatch: frontend=${legalConfig.constitutionVersion} edge=${edgeConstitution}`,
    )
    failures++
  }

  const unresolved = listUnresolvedLegalPlaceholders()
  if (legalConfig.draftPendingLegalReview) {
    console.log(
      `Legal config DRAFT (banner on). Unresolved placeholders: ${unresolved.length ? unresolved.join(', ') : 'none'}`,
    )
  } else {
    try {
      assertLegalConfigReadyForRelease()
      console.log('Legal config ready for release (no placeholders).')
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err))
      failures++
    }
  }

  // Always fail CI/production if draft is false — already handled above.
  // When VITE/NODE production and draft false, also enforced.
  const isProd = process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production'
  if (isProd && legalConfig.draftPendingLegalReview === false && unresolved.length > 0) {
    failures++
  }

  if (failures > 0) {
    console.error(`Legal config check failed: ${failures} issue(s)`)
    process.exit(1)
  }

  console.log(
    `Legal config OK (privacy=${legalConfig.privacyPolicyVersion}, terms=${legalConfig.termsVersion}, constitution=${legalConfig.constitutionVersion}, draft=${legalConfig.draftPendingLegalReview})`,
  )
}

main()
