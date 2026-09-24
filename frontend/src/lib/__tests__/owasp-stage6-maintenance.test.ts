/**
 * Stage 6 — maintenance playbook exists and keeps the standing rules.
 * Do not delete this (or the doc) to hide failures.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../../../../')
const docPath = 'docs/SECURITY_MAINTENANCE.md'

function read(rel: string): string {
  return readFileSync(resolve(root, rel), 'utf-8')
}

describe('Stage 6 — security maintenance playbook', () => {
  it('exists and is the monthly cannot-skip gate', () => {
    expect(existsSync(resolve(root, docPath))).toBe(true)
    const doc = read(docPath)
    expect(doc).toContain('Monthly (cannot skip)')
    expect(doc).toContain('Standing rules (do not weaken)')
    expect(doc).toContain('PAYMENTS_ENABLED')
    expect(doc).toContain('ENFORCE_LIVE_SECRETS')
    expect(doc).toContain('handleUnexpectedError')
    expect(doc).toContain('parseOptionalMoneyAmount')
    expect(doc).toContain('Do not delete')
  })

  it('audit and verification docs point at the playbook', () => {
    expect(read('docs/SECURITY_AUDIT.md')).toContain('docs/SECURITY_MAINTENANCE.md')
    expect(read('docs/SECURITY_VERIFICATION.md')).toContain('docs/SECURITY_MAINTENANCE.md')
  })
})
