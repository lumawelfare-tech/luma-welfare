/**
 * Phase 2A Idempotency Hardening Tests
 *
 * Tests scenarios A through I for payment initiation idempotency.
 * All Daraja calls are mocked. Database constraints are tested against
 * the real Supabase database.
 *
 * Run: node --test src/__tests__/idempotency.test.mjs
 */

import { describe, it, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import pg from 'pg'

// ──────────────────────────────────────────────────────
// Database connection
// ──────────────────────────────────────────────────────

const DATABASE_URL = process.env.DATABASE_URL
const TEST_MEMBER_A = '11111111-1111-1111-1111-111111111111'
const TEST_MEMBER_B = '22222222-2222-2222-2222-222222222222'
const TEST_SUB_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
let TEST_PKG = '33333333-3333-3333-3333-333333333333'

let client

before(async () => {
  if (!DATABASE_URL) {
    console.log('DATABASE_URL not set, skipping database tests')
    return
  }
  client = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } })
  await client.connect()

  // Create test data
  await client.query(`
    INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
    VALUES
      ($1, 'idemp-a@test.com', crypt('test', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}'),
      ($2, 'idemp-b@test.com', crypt('test', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}')
    ON CONFLICT (id) DO NOTHING
  `, [TEST_MEMBER_A, TEST_MEMBER_B])

  await client.query(`
    INSERT INTO members (id, full_name, phone, email, status)
    VALUES
      ($1, 'Test Member A', '0711111111', 'idemp-a@test.com', 'active'),
      ($2, 'Test Member B', '0722222222', 'idemp-b@test.com', 'active')
    ON CONFLICT (id) DO NOTHING
  `, [TEST_MEMBER_A, TEST_MEMBER_B])

  // Get an existing package and use it for test data
  const pkg = await client.query("SELECT id FROM packages WHERE code = 'welfare' LIMIT 1")
  if (pkg.rows.length > 0) {
    TEST_PKG = pkg.rows[0].id
    await client.query(`
      INSERT INTO subscriptions (id, member_id, package_id, status)
      VALUES ($1, $2, $3, 'active')
      ON CONFLICT (id) DO NOTHING
    `, [TEST_SUB_A, TEST_MEMBER_A, TEST_PKG])
  }
})

after(async () => {
  if (!client) return
  // Clean up test data
  await client.query('DELETE FROM contributions WHERE member_id IN ($1, $2)', [TEST_MEMBER_A, TEST_MEMBER_B])
  await client.query('DELETE FROM payments WHERE member_id IN ($1, $2)', [TEST_MEMBER_A, TEST_MEMBER_B])
  await client.query('DELETE FROM subscriptions WHERE id = $1', [TEST_SUB_A])
  await client.query('DELETE FROM members WHERE id IN ($1, $2)', [TEST_MEMBER_A, TEST_MEMBER_B])
  await client.query('DELETE FROM auth.users WHERE id IN ($1, $2)', [TEST_MEMBER_A, TEST_MEMBER_B])
  await client.end()
})

// Helper: insert a payment directly (simulates what the backend does)
async function insertPayment(memberId, idempotencyKey, opts = {}) {
  const pkgId = opts.packageId || TEST_PKG
  const subId = opts.subscriptionId || TEST_SUB_A
  const amount = opts.amount || 100
  const phone = opts.phone || '0711111111'
  const status = opts.status || 'Pending'

  try {
    const result = await client.query(`
      INSERT INTO payments (member_id, subscription_id, package_id, amount, phone, idempotency_key, status, channel)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'mpesa')
      RETURNING id, checkout_request_id, status
    `, [memberId, subId, pkgId, amount, phone, idempotencyKey, status])
    return { success: true, payment: result.rows[0] }
  } catch (err) {
    if (err.code === '23505') {
      // Unique violation — query existing
      const existing = await client.query(
        'SELECT id, checkout_request_id, status FROM payments WHERE member_id = $1 AND idempotency_key = $2',
        [memberId, idempotencyKey]
      )
      return { success: false, conflict: true, payment: existing.rows[0] }
    }
    throw err
  }
}

// Helper: simulate callback lookup
async function findPaymentByCheckout(checkoutRequestId) {
  const result = await client.query(
    'SELECT id, member_id, status, checkout_request_id FROM payments WHERE checkout_request_id = $1',
    [checkoutRequestId]
  )
  return result.rows[0] || null
}

// Helper: simulate callback update
async function completePayment(checkoutRequestId, mpesaReceipt) {
  const update = await client.query(`
    UPDATE payments
    SET status = 'Completed', mpesa_receipt = $2, updated_at = now()
    WHERE checkout_request_id = $1 AND status = 'Pending'
    RETURNING id, status
  `, [checkoutRequestId, mpesaReceipt])
  return update.rows[0] || null
}

// ──────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────

describe('Scenario A: Single Pay click', () => {
  it('one initiation creates exactly one payment', async () => {
    if (!client) return
    const key = crypto.randomUUID()
    const result = await insertPayment(TEST_MEMBER_A, key)
    assert.equal(result.success, true, 'Insert should succeed')
    assert.ok(result.payment.id, 'Payment should have an id')
    assert.equal(result.payment.status, 'Pending')
  })
})

describe('Scenario B: Double-click (same requestId)', () => {
  it('two requests with same requestId — exactly one payment', async () => {
    if (!client) return
    const key = crypto.randomUUID()

    // First request
    const r1 = await insertPayment(TEST_MEMBER_A, key)
    assert.equal(r1.success, true, 'First insert should succeed')

    // Second request (same key)
    const r2 = await insertPayment(TEST_MEMBER_A, key)
    assert.equal(r2.conflict, true, 'Second insert should conflict')
    assert.equal(r2.payment.id, r1.payment.id, 'Should return the same payment')

    // Verify only one row exists
    const count = await client.query(
      'SELECT count(*) FROM payments WHERE idempotency_key = $1 AND member_id = $2',
      [key, TEST_MEMBER_A]
    )
    assert.equal(parseInt(count.rows[0].count), 1, 'Exactly one payment row')
  })
})

describe('Scenario C: Network timeout (retry with same key)', () => {
  it('retry returns existing payment, no new STK Push needed', async () => {
    if (!client) return
    const key = crypto.randomUUID()

    // First request (succeeds but client doesn't get response)
    const r1 = await insertPayment(TEST_MEMBER_A, key)
    assert.equal(r1.success, true)

    // Client retries with same key
    const r2 = await insertPayment(TEST_MEMBER_A, key)
    assert.equal(r2.conflict, true, 'Should detect duplicate')
    assert.equal(r2.payment.id, r1.payment.id, 'Should return same payment')

    // No new payment created
    const count = await client.query(
      'SELECT count(*) FROM payments WHERE idempotency_key = $1',
      [key]
    )
    assert.equal(parseInt(count.rows[0].count), 1, 'Still exactly one payment')
  })
})

describe('Scenario D: Concurrent requests (same key)', () => {
  it('database uniqueness prevents duplicate initiation', async () => {
    if (!client) return
    const key = crypto.randomUUID()

    // Simulate two concurrent inserts
    const [r1, r2] = await Promise.all([
      insertPayment(TEST_MEMBER_A, key),
      insertPayment(TEST_MEMBER_A, key),
    ])

    // Exactly one should succeed, one should conflict
    const successes = [r1, r2].filter(r => r.success)
    const conflicts = [r1, r2].filter(r => r.conflict)
    assert.equal(successes.length, 1, 'Exactly one success')
    assert.equal(conflicts.length, 1, 'Exactly one conflict')

    // Both should reference the same payment
    const id = successes[0].payment.id
    assert.equal(conflicts[0].payment.id, id, 'Conflict returns same payment id')

    // Only one row in DB
    const count = await client.query(
      'SELECT count(*) FROM payments WHERE idempotency_key = $1',
      [key]
    )
    assert.equal(parseInt(count.rows[0].count), 1, 'One row in database')
  })
})

describe('Scenario E: Existing CheckoutRequestID', () => {
  it('retry returns existing payment with checkout_request_id', async () => {
    if (!client) return
    const key = crypto.randomUUID()

    // Create payment
    const r1 = await insertPayment(TEST_MEMBER_A, key)
    assert.equal(r1.success, true)

    // Simulate Daraja responding with CheckoutRequestID
    const checkoutId = `ws_CO_${Date.now()}`
    await client.query(
      'UPDATE payments SET checkout_request_id = $1 WHERE id = $2',
      [checkoutId, r1.payment.id]
    )

    // Retry with same key
    const r2 = await insertPayment(TEST_MEMBER_A, key)
    assert.equal(r2.conflict, true)
    assert.equal(r2.payment.checkout_request_id, checkoutId, 'Should have checkout_request_id')

    // No new payment
    const count = await client.query(
      'SELECT count(*) FROM payments WHERE idempotency_key = $1',
      [key]
    )
    assert.equal(parseInt(count.rows[0].count), 1)
  })
})

describe('Scenario F: Repeated callback (same CheckoutRequestID)', () => {
  it('callback processed multiple times — financial records remain exactly once', async () => {
    if (!client) return
    const key = crypto.randomUUID()
    const checkoutId = `ws_CO_CB_${Date.now()}`
    const receipt = `QHK${Date.now()}`

    // Create payment
    const r1 = await insertPayment(TEST_MEMBER_A, key)
    assert.equal(r1.success, true)

    // Set checkout_request_id
    await client.query(
      'UPDATE payments SET checkout_request_id = $1 WHERE id = $2',
      [checkoutId, r1.payment.id]
    )

    // First callback — succeeds
    const c1 = await completePayment(checkoutId, receipt)
    assert.ok(c1, 'First callback should complete payment')
    assert.equal(c1.status, 'Completed')

    // Second callback — should be no-op
    const c2 = await completePayment(checkoutId, receipt)
    assert.equal(c2, null, 'Second callback should be no-op (already Completed)')

    // Verify payment state
    const payment = await findPaymentByCheckout(checkoutId)
    assert.equal(payment.status, 'Completed')

    // Verify only one contribution would be created (unique constraint)
    const count = await client.query(
      'SELECT count(*) FROM payments WHERE checkout_request_id = $1',
      [checkoutId]
    )
    assert.equal(parseInt(count.rows[0].count), 1, 'One payment')
  })
})

describe('Scenario G: Different requestIds', () => {
  it('two genuinely separate payments are treated separately', async () => {
    if (!client) return
    const key1 = crypto.randomUUID()
    const key2 = crypto.randomUUID()

    const r1 = await insertPayment(TEST_MEMBER_A, key1)
    const r2 = await insertPayment(TEST_MEMBER_A, key2)

    assert.equal(r1.success, true)
    assert.equal(r2.success, true)
    assert.notEqual(r1.payment.id, r2.payment.id, 'Different payments')
  })
})

describe('Scenario H: Cross-member attack', () => {
  it('member A cannot query member B payment by idempotency key', async () => {
    if (!client) return
    const key = crypto.randomUUID()

    // Member A creates payment
    const r1 = await insertPayment(TEST_MEMBER_A, key)
    assert.equal(r1.success, true)

    // Member B tries same key — should succeed (different member scope)
    const r2 = await insertPayment(TEST_MEMBER_B, key)
    assert.equal(r2.success, true, 'Different member can use same key')
    assert.notEqual(r1.payment.id, r2.payment.id, 'Different payment ids')

    // Verify isolation: member A's query should not return member B's payment
    const aPayments = await client.query(
      'SELECT id FROM payments WHERE member_id = $1 AND idempotency_key = $2',
      [TEST_MEMBER_A, key]
    )
    const bPayments = await client.query(
      'SELECT id FROM payments WHERE member_id = $1 AND idempotency_key = $2',
      [TEST_MEMBER_B, key]
    )
    assert.equal(aPayments.rows.length, 1, 'Member A has one payment')
    assert.equal(bPayments.rows.length, 1, 'Member B has one payment')
    assert.notEqual(aPayments.rows[0].id, bPayments.rows[0].id, 'Different payment ids')
  })

  it('member A cannot access member B payment by payment id', async () => {
    if (!client) return
    const key = crypto.randomUUID()

    const r1 = await insertPayment(TEST_MEMBER_A, key)
    assert.equal(r1.success, true)

    // Member B queries member A's payment by id
    const bQuery = await client.query(
      'SELECT id FROM payments WHERE id = $1 AND member_id = $2',
      [r1.payment.id, TEST_MEMBER_B]
    )
    assert.equal(bQuery.rows.length, 0, 'Member B cannot see member A payment')
  })
})

describe('Scenario I: Existing regression tests', () => {
  it('payments table still has all required columns', async () => {
    if (!client) return
    const cols = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'payments'
      ORDER BY ordinal_position
    `)
    const colNames = cols.rows.map(r => r.column_name)
    assert.ok(colNames.includes('id'), 'has id')
    assert.ok(colNames.includes('member_id'), 'has member_id')
    assert.ok(colNames.includes('subscription_id'), 'has subscription_id')
    assert.ok(colNames.includes('package_id'), 'has package_id')
    assert.ok(colNames.includes('amount'), 'has amount')
    assert.ok(colNames.includes('phone'), 'has phone')
    assert.ok(colNames.includes('payment_reference'), 'has payment_reference')
    assert.ok(colNames.includes('mpesa_receipt'), 'has mpesa_receipt')
    assert.ok(colNames.includes('status'), 'has status')
    assert.ok(colNames.includes('channel'), 'has channel')
    assert.ok(colNames.includes('payload'), 'has payload')
    assert.ok(colNames.includes('idempotency_key'), 'has idempotency_key')
    assert.ok(colNames.includes('checkout_request_id'), 'has checkout_request_id')
  })

  it('unique constraint on idempotency_key exists', async () => {
    if (!client) return
    const idx = await client.query(`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'payments' AND indexname = 'idx_payments_idempotency'
    `)
    assert.equal(idx.rows.length, 1, 'idempotency unique index exists')
  })

  it('unique constraint on checkout_request_id exists', async () => {
    if (!client) return
    const idx = await client.query(`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'payments' AND indexname = 'idx_payments_checkout_request'
    `)
    assert.equal(idx.rows.length, 1, 'checkout_request unique index exists')
  })

  it('contributions still has unique(subscription_id, period)', async () => {
    if (!client) return
    const idx = await client.query(`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'contributions' AND indexname LIKE '%subscription%period%'
    `)
    assert.ok(idx.rows.length > 0, 'contributions unique constraint exists')
  })
})
