/**
 * Qualification Engine — Unit Tests
 *
 * Tests the server-side rule evaluation for member claims eligibility.
 * Covers: waiting periods, current-contribution rules, minimums,
 * arrears thresholds, at_risk, and revoked states.
 *
 * Run: node --test src/lib/__tests__/qualify.test.ts
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { evaluateQualification } from '../qualify.ts'

function makeContrib(status, count, startPeriod = '2025-01') {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(`${startPeriod}-01`)
    d.setMonth(d.getMonth() + i)
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '01')
    return { status, period: `${year}-${month}` }
  })
}

function activeInput(startedAt = '2024-01-01') {
  return {
    memberStatus: 'active',
    subscriptionStatus: 'active',
    startedAt,
    now: new Date('2025-07-01'),
  }
}

describe('Qualification Engine', () => {

  // ── Waiting Period: 12 months (Standard package) ──────────────────────────

  it('eligible after 12 paid contributions (standard package)', () => {
    const rules = { waiting_period_months: 12 }
    const input = activeInput('2024-01-01')
    const contribs = makeContrib('Paid', 12, '2024-01')
    const result = evaluateQualification(rules, input, contribs)
    assert.strictEqual(result.status, 'eligible')
    assert.strictEqual(result.eligibleFrom, '2024-12-31')
  })

  it('not_eligible with only 11 of 12 required contributions', () => {
    const rules = { waiting_period_months: 12 }
    const input = activeInput('2024-01-01')
    const contribs = makeContrib('Paid', 11, '2024-01')
    const result = evaluateQualification(rules, input, contribs)
    assert.strictEqual(result.status, 'not_eligible')
    assert.strictEqual(result.criteriaMet.waiting_period.met, false)
  })

  it('eligible when paid contributions exceed waiting period requirement', () => {
    const rules = { waiting_period_months: 6 }
    const input = activeInput('2024-01-01')
    const contribs = makeContrib('Paid', 12, '2024-01')
    const result = evaluateQualification(rules, input, contribs)
    assert.strictEqual(result.status, 'eligible')
    assert.strictEqual(result.criteriaMet.waiting_period.required_months, 6)
  })

  // ── Waiting Period: 6 months (Education package) ───────────────────────

  it('eligible after 6 paid contributions (Education, 6-month wait)', () => {
    const rules = { waiting_period_months: 6 }
    const input = activeInput('2024-07-01')
    const contribs = makeContrib('Paid', 6, '2024-07')
    const result = evaluateQualification(rules, input, contribs)
    assert.strictEqual(result.status, 'eligible')
    assert.strictEqual(result.eligibleFrom, '2024-12-31')
  })

  it('not_eligible at 5 of 6 required (Education)', () => {
    const rules = { waiting_period_months: 6 }
    const input = activeInput('2024-07-01')
    const contribs = makeContrib('Paid', 5, '2024-07')
    const result = evaluateQualification(rules, input, contribs)
    assert.strictEqual(result.status, 'not_eligible')
  })

  // ── No waiting period: current-contribution rule (Welfare) ───────────────

  it('eligible with no waiting period when contributions are current', () => {
    const rules = {
      waiting_period_months: 0,
      requires_current_contributions: true,
      arrears_allowed_months: 0,
      max_arrears_months: 1,
    }
    const input = activeInput('2025-01-01')
    const contribs = makeContrib('Paid', 6, '2025-01')
    const result = evaluateQualification(rules, input, contribs)
    assert.strictEqual(result.status, 'eligible')
    assert.strictEqual(result.criteriaMet.waiting_period.rule, 'contributions current')
  })

  it('at_risk when 1 month in arrears but max_arrears allows it', () => {
    const rules = {
      waiting_period_months: 0,
      requires_current_contributions: true,
      arrears_allowed_months: 0,
      max_arrears_months: 1,
    }
    const input = activeInput('2025-01-01')
    const contribs = makeContrib('Paid', 5, '2025-01')
    const result = evaluateQualification(rules, input, contribs)
    assert.strictEqual(result.status, 'at_risk')
    assert.strictEqual(result.criteriaMet.arrears.months, 1)
  })

  it('revoked when 2 months in arrears (exceeds max)', () => {
    const rules = {
      waiting_period_months: 0,
      requires_current_contributions: true,
      arrears_allowed_months: 0,
      max_arrears_months: 1,
    }
    const input = activeInput('2025-01-01')
    const contribs = makeContrib('Paid', 4, '2025-01')
    const result = evaluateQualification(rules, input, contribs)
    assert.strictEqual(result.status, 'revoked')
  })

  // ── Arrears tolerance ─────────────────────────────────────────────────────

  it('eligible when within arrears tolerance', () => {
    const rules = {
      waiting_period_months: 0,
      requires_current_contributions: true,
      arrears_allowed_months: 2,
      max_arrears_months: 3,
    }
    const input = activeInput('2025-01-01')
    const contribs = makeContrib('Paid', 4, '2025-01')
    const result = evaluateQualification(rules, input, contribs)
    assert.strictEqual(result.status, 'eligible')
    assert.strictEqual(result.criteriaMet.arrears.months, 2)
    assert.strictEqual(result.criteriaMet.arrears.allowed, 2)
  })

  // ── Minimum contributions ────────────────────────────────────────────────

  it('not_eligible when below min_contributions threshold', () => {
    const rules = {
      waiting_period_months: 0,
      requires_current_contributions: false,
      min_contributions: 3,
    }
    const input = activeInput('2025-01-01')
    const contribs = makeContrib('Paid', 2, '2025-01')
    const result = evaluateQualification(rules, input, contribs)
    assert.strictEqual(result.status, 'not_eligible')
    assert.strictEqual(result.criteriaMet.min_contributions.met, false)
  })

  // ── Account / subscription status ─────────────────────────────────────────

  it('revoked when member status is suspended', () => {
    const rules = { waiting_period_months: 12 }
    const input = { ...activeInput(), memberStatus: 'suspended' }
    const contribs = makeContrib('Paid', 12)
    const result = evaluateQualification(rules, input, contribs)
    assert.strictEqual(result.status, 'revoked')
    assert.strictEqual(result.criteriaMet.account_active, false)
  })

  it('revoked when subscription is not active', () => {
    const rules = { waiting_period_months: 12 }
    const input = { ...activeInput(), subscriptionStatus: 'expired' }
    const contribs = makeContrib('Paid', 12)
    const result = evaluateQualification(rules, input, contribs)
    assert.strictEqual(result.status, 'revoked')
    assert.strictEqual(result.criteriaMet.subscription_active, false)
  })

  // ── Pending approval ─────────────────────────────────────────────────────

  it('revoked when member status is pending_approval', () => {
    const rules = { waiting_period_months: 12 }
    const input = { ...activeInput(), memberStatus: 'pending_approval' }
    const contribs = makeContrib('Paid', 12)
    const result = evaluateQualification(rules, input, contribs)
    assert.strictEqual(result.status, 'revoked')
  })

  // ── Paid status types (Paid, Verified, Late all count) ─────────────────────

  it('Verified status counts toward waiting period', () => {
    const rules = { waiting_period_months: 3 }
    const input = activeInput('2025-01-01')
    const contribs = makeContrib('Verified', 3, '2025-01')
    const result = evaluateQualification(rules, input, contribs)
    assert.strictEqual(result.status, 'eligible')
  })

  it('Late status counts toward waiting period', () => {
    const rules = { waiting_period_months: 3 }
    const input = activeInput('2025-01-01')
    const contribs = makeContrib('Late', 3, '2025-01')
    const result = evaluateQualification(rules, input, contribs)
    assert.strictEqual(result.status, 'eligible')
  })

  it('Failed status does NOT count toward waiting period', () => {
    const rules = { waiting_period_months: 3 }
    const input = activeInput('2025-01-01')
    const contribs = makeContrib('Failed', 3, '2025-01')
    const result = evaluateQualification(rules, input, contribs)
    assert.strictEqual(result.status, 'not_eligible')
    assert.strictEqual(result.criteriaMet.waiting_period.met, false)
  })

  it('mixed qualifying statuses (Paid+Verified+Late) all count toward waiting period', () => {
    const rules = { waiting_period_months: 3 }
    const input = activeInput('2025-01-01')
    const contribs = [
      { status: 'Paid', period: '2025-01' },
      { status: 'Verified', period: '2025-02' },
      { status: 'Late', period: '2025-03' },
    ]
    const result = evaluateQualification(rules, input, contribs)
    assert.strictEqual(result.status, 'eligible')
  })

  // ── eligibleFrom calculation ──────────────────────────────────────────────

  it('eligibleFrom uses startedAt when waiting_period is 0', () => {
    const rules = { waiting_period_months: 0 }
    const input = activeInput('2025-01-01')
    const contribs = makeContrib('Paid', 6, '2025-01')
    const result = evaluateQualification(rules, input, contribs)
    assert.strictEqual(result.eligibleFrom, '2025-01-01')
  })

  it('eligibleFrom is null when no start date', () => {
    const rules = { waiting_period_months: 12 }
    const input = {
      memberStatus: 'active',
      subscriptionStatus: 'active',
      startedAt: null,
      now: new Date('2025-07-01'),
    }
    const result = evaluateQualification(rules, input, [])
    assert.strictEqual(result.eligibleFrom, null)
  })

  // ── Edge: zero elapsed time ───────────────────────────────────────────────

  it('eligible immediately when no waiting period and no arrears', () => {
    const rules = {
      waiting_period_months: 0,
      requires_current_contributions: true,
      arrears_allowed_months: 0,
      max_arrears_months: 1,
    }
    const input = {
      memberStatus: 'active',
      subscriptionStatus: 'active',
      startedAt: '2025-07-01',
      now: new Date('2025-07-01'),
    }
    const contribs = []
    const result = evaluateQualification(rules, input, contribs)
    assert.strictEqual(result.status, 'eligible')
  })
})
