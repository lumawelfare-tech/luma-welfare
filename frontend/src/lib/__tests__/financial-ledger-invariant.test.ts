/**
 * financial_ledger.transaction_id invariant (decision A3).
 *
 * `financial_ledger.transaction_id` is NOT NULL, but payments-callback writes
 * registration-fee rows that have no payments.id. The insert is guarded by
 * `if (paidAmount != null && feeRow)`, which narrows feeRow to non-null, and
 * paidAmount is derived solely from feeRow — so the amount, the row and the
 * `id` it selects (a non-nullable PK) are all the same object.
 *
 * Every link in that chain is pinned here so a refactor cannot silently break
 * it: dropping `id` from the select, deriving paidAmount from callback data,
 * moving the insert outside the guard, or relaxing the NOT NULL all fail.
 *
 * Offline only — reads source files, no DB and no Daraja credentials.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../../../../')

function read(rel: string): string {
  return readFileSync(resolve(root, rel), 'utf-8')
}

const CALLBACK = 'supabase/functions/payments-callback/index.ts'
const RESTORE_SQL = 'supabase/migrations/20260928000200_restore_phase6_phase7_financial_objects.sql'

const src = read(CALLBACK)
const sql = read(RESTORE_SQL)
/** sql with whole-line `--` comments removed, so prose cannot satisfy assertions. */
const sqlCode = sql
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n')

/** Pulls the real `const paidAmount = …` expression out of the shipped source. */
function paidAmountExpression(): string {
  const match = src.match(/const paidAmount = ([\s\S]*?)\n\s*const paidCurrency/)
  if (!match) throw new Error('paidAmount assignment not found in payments-callback')
  return match[1].trim()
}

/** Evaluates the shipped expression against a feeRow-shaped input. */
function derivePaidAmount(feeRow: unknown): number | null {
  // eslint-disable-next-line no-new-func -- exercises the exact expression the
  // Edge Function ships, rather than a hand-maintained copy of it.
  const fn = new Function('feeRow', `return (${paidAmountExpression()})`)
  return fn(feeRow) as number | null
}

describe('registration-fee ledger insert satisfies transaction_id NOT NULL', () => {
  it('reads id alongside amount and currency', () => {
    expect(src).toContain(".select('amount, currency, id')")
    expect(src).not.toContain(".select('amount, currency')")
  })

  it('supplies transaction_id from feeRow.id on every financial_ledger insert', () => {
    expect(src.split("from('financial_ledger')").length - 1).toBe(1)
    expect(src).toContain('transaction_id: feeRow.id')
  })

  it('keeps the insert inside the paidAmount guard', () => {
    const guard = 'if (paidAmount != null && feeRow)'
    const guardIdx = src.indexOf(guard)
    const insertIdx = src.indexOf("from('financial_ledger')")

    expect(guardIdx).toBeGreaterThan(-1)
    expect(insertIdx).toBeGreaterThan(guardIdx)
    // No block exit between the guard and the insert => same block.
    expect(src.slice(guardIdx + guard.length, insertIdx)).not.toContain('}')
  })

  it('derives paidAmount only from feeRow, never from callback-supplied data', () => {
    const expr = paidAmountExpression()
    expect(expr).toMatch(/^feeRow\?\.amount != null/)
    expect(expr).toContain('feeRow')
    expect(expr).not.toMatch(/\bmeta\b|\bResult\b|\bbody\b|\bAccountReference\b/)
  })

  it('paidAmount != null implies feeRow exists (so feeRow.id is reachable)', () => {
    const rows: unknown[] = [
      null,
      undefined,
      {},
      { id: 'a' },
      { amount: null, id: 'b' },
      { amount: 0, id: 'c' },
      { amount: -1, id: 'd' },
      { amount: 1, id: 'e' },
      { amount: 100, id: 'f' },
      { amount: 0.01, id: 'g' },
    ]
    for (const row of rows) {
      if (derivePaidAmount(row) !== null) {
        expect(row).not.toBeNull()
        expect(row).not.toBeUndefined()
      }
    }
  })

  it('paidAmount evaluates to the expected values', () => {
    expect(derivePaidAmount(null)).toBeNull()
    expect(derivePaidAmount(undefined)).toBeNull()
    expect(derivePaidAmount({})).toBeNull()
    expect(derivePaidAmount({ id: 'x' })).toBeNull()
    expect(derivePaidAmount({ amount: null, id: 'x' })).toBeNull()
    expect(derivePaidAmount({ amount: 0, id: 'x' })).toBeNull()
    expect(derivePaidAmount({ amount: -5, id: 'x' })).toBeNull()
    expect(derivePaidAmount({ amount: 100, id: 'x' })).toBe(100)
  })

  it('financial_ledger keeps id non-nullable and transaction_id NOT NULL', () => {
    const start = sql.indexOf('CREATE TABLE IF NOT EXISTS financial_ledger')
    const end = sql.indexOf('CREATE INDEX IF NOT EXISTS idx_financial_ledger_member')
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)

    const ledger = sql.slice(start, end)
    expect(ledger).toMatch(/id uuid PRIMARY KEY DEFAULT gen_random_uuid\(\)/)
    expect(ledger).toMatch(/transaction_id\s+uuid\s+NOT NULL/)
    expect(ledger).not.toMatch(/transaction_id\s+uuid(?! NOT NULL)/)
  })

  it('restore migration still denies member access to financial_ledger', () => {
    expect(sqlCode).not.toMatch(/CREATE\s+POLICY/i)
    expect(sqlCode).toContain('DROP POLICY IF EXISTS "ledger_read_own" ON financial_ledger;')
    expect(sqlCode).toContain('FORCE  ROW LEVEL SECURITY')
  })
})
