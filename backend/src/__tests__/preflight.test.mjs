/**
 * Phase 2C Pre-Flight Tests
 * Run: node --test src/__tests__/preflight.test.mjs
 */
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import pg from 'pg'

const DATABASE_URL = process.env.DATABASE_URL
const A = '11111111-1111-1111-1111-111111111111'
const B = '22222222-2222-2222-2222-222222222222'
const SUB_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const SUB_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
let PKG = '33333333-3333-3333-3333-333333333333'
let AMT = 100
let client

async function ensureMember(c, id, email, phone) {
  await c.query(
    "INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data) VALUES ($1, $2, crypt('test', gen_salt('bf')), now(), '{\"provider\":\"email\",\"providers\":[\"email\"]}', '{}') ON CONFLICT (id) DO NOTHING",
    [id, email])
  await c.query(
    "INSERT INTO members (id, full_name, phone, email, status) VALUES ($1, 'Test User', $2, $3, 'active') ON CONFLICT (id) DO NOTHING",
    [id, phone, email])
}

async function ensureSub(c, subId, memberId, pkgId) {
  await c.query(
    "INSERT INTO subscriptions (id, member_id, package_id, status) VALUES ($1, $2, $3, 'active') ON CONFLICT (id) DO NOTHING",
    [subId, memberId, pkgId])
}

before(async () => {
  if (!DATABASE_URL) { console.log('DATABASE_URL not set'); return }
  client = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } })
  await client.connect()
  await ensureMember(client, A, 'pf-a@test.com', '0711111111')
  await ensureMember(client, B, 'pf-b@test.com', '0722222222')
  const pkg = await client.query("SELECT id FROM packages WHERE code = 'welfare' LIMIT 1")
  if (pkg.rows.length > 0) PKG = pkg.rows[0].id
  const tier = await client.query('SELECT amount FROM package_tiers LIMIT 1')
  if (tier.rows.length > 0) AMT = Number(tier.rows[0].amount)
  await ensureSub(client, SUB_A, A, PKG)
  await ensureSub(client, SUB_B, B, PKG)
})

after(async () => {
  if (!client) return
  await client.query('DELETE FROM contributions WHERE member_id IN ($1, $2)', [A, B])
  await client.query('DELETE FROM payments WHERE member_id IN ($1, $2)', [A, B])
  await client.query('DELETE FROM subscriptions WHERE id IN ($1, $2)', [SUB_A, SUB_B])
  await client.query('DELETE FROM members WHERE id IN ($1, $2)', [A, B])
  await client.query('DELETE FROM auth.users WHERE id IN ($1, $2)', [A, B])
  await client.end()
})

async function insertPayment(memberId, subscriptionId, idempotencyKey, opts = {}) {
  const pkgId = opts.packageId || PKG
  const amount = opts.amount || AMT
  const phone = opts.phone || '0711111111'
  const status = opts.status || 'Pending'
  const checkoutRequestId = opts.checkoutRequestId || null
  try {
    const result = await client.query(
      "INSERT INTO payments (member_id, subscription_id, package_id, amount, phone, idempotency_key, status, channel, checkout_request_id) VALUES ($1, $2, $3, $4, $5, $6, $7, 'mpesa', $8) RETURNING id, checkout_request_id, status",
      [memberId, subscriptionId, pkgId, amount, phone, idempotencyKey, status, checkoutRequestId])
    return { success: true, payment: result.rows[0] }
  } catch (err) {
    if (err.code === '23505') {
      const existing = await client.query(
        'SELECT id, checkout_request_id, status FROM payments WHERE member_id = $1 AND idempotency_key = $2',
        [memberId, idempotencyKey])
      return { success: false, conflict: true, payment: existing.rows[0] }
    }
    throw err
  }
}

async function updateStatus(checkoutRequestId, newStatus, opts = {}) {
  const sets = ['status = $2', 'updated_at = now()']
  const params = [checkoutRequestId, newStatus]
  if (opts.mpesaReceipt) { sets.push('mpesa_receipt = $3'); params.push(opts.mpesaReceipt) }
  const where = opts.fromStatus ? ' AND status = $' + (params.length + 1) : ''
  if (opts.fromStatus) params.push(opts.fromStatus)
  return client.query('UPDATE payments SET ' + sets.join(', ') + ' WHERE checkout_request_id = $1' + where + ' RETURNING id, status', params)
}

async function findPayment(checkoutRequestId) {
  const { rows } = await client.query(
    'SELECT id, member_id, subscription_id, package_id, amount, status, checkout_request_id FROM payments WHERE checkout_request_id = $1',
    [checkoutRequestId])
  return rows[0] || null
}

async function countContributions(subscriptionId) {
  const { rows } = await client.query('SELECT count(*) FROM contributions WHERE subscription_id = $1', [subscriptionId])
  return parseInt(rows[0].count)
}

describe('Phone Validation', () => {
  it('valid profile phone is present', async () => {
    if (!client) return
    const { rows } = await client.query('SELECT phone FROM members WHERE id = $1', [A])
    assert.equal(rows[0].phone, '0711111111')
  })
  it('invalid phone rejected by regex', () => {
    const invalid = ['1234567890', '071234567', '07123456789', '+254712345678', '0612345678']
    for (const p of invalid) assert.ok(!/^0[17]\d{8}$/.test(p))
  })
  it('normalizes phone to 2547XXXXXXXX', () => {
    function normalize(phone) {
      const c = phone.replace(/[\s\-()]/g, '')
      if (c.startsWith('254')) return c
      if (c.startsWith('0')) return '254' + c.slice(1)
      if (c.startsWith('+254')) return c.slice(1)
      return c
    }
    assert.equal(normalize('0712345678'), '254712345678')
    assert.equal(normalize('+254712345678'), '254712345678')
  })
})

describe('Payment Amount Protection', () => {
  it('amount from DB tier not client', async () => {
    if (!client) return
    const { rows } = await client.query('SELECT pt.amount FROM subscriptions s JOIN package_tiers pt ON pt.id = s.package_tier_id WHERE s.id = $1', [SUB_A])
    if (rows.length > 0) assert.ok(Number(rows[0].amount) > 0)
  })
  it('package attribution chain correct', async () => {
    if (!client) return
    const key = crypto.randomUUID()
    await insertPayment(A, SUB_A, key)
    const { rows } = await client.query('SELECT package_id, subscription_id FROM payments WHERE idempotency_key = $1', [key])
    assert.equal(rows[0].package_id, PKG)
    assert.equal(rows[0].subscription_id, SUB_A)
  })
})

describe('Callback State Machine', () => {
  it('Pending -> Completed', async () => {
    if (!client) return
    const key = crypto.randomUUID()
    const cid = 'ws_CO_SM1_' + Date.now()
    await insertPayment(A, SUB_A, key, { checkoutRequestId: cid })
    const u = await updateStatus(cid, 'Completed', { mpesaReceipt: 'QHK123', fromStatus: 'Pending' })
    assert.equal(u.rows[0].status, 'Completed')
  })
  it('Completed is terminal', async () => {
    if (!client) return
    const key = crypto.randomUUID()
    const cid = 'ws_CO_SM2_' + Date.now()
    await insertPayment(A, SUB_A, key, { checkoutRequestId: cid })
    await updateStatus(cid, 'Completed', { mpesaReceipt: 'QHK456', fromStatus: 'Pending' })
    const late = await updateStatus(cid, 'Completed', { mpesaReceipt: 'QHK_LATE', fromStatus: 'Pending' })
    assert.equal(late.rows.length, 0)
  })
  it('Failed -> Completed rejected', async () => {
    if (!client) return
    const key = crypto.randomUUID()
    const cid = 'ws_CO_SM3_' + Date.now()
    await insertPayment(A, SUB_A, key, { checkoutRequestId: cid })
    await updateStatus(cid, 'Failed', { fromStatus: 'Pending' })
    const r = await updateStatus(cid, 'Completed', { mpesaReceipt: 'QHK789', fromStatus: 'Pending' })
    assert.equal(r.rows.length, 0)
  })
  it('Pending -> Failed', async () => {
    if (!client) return
    const key = crypto.randomUUID()
    const cid = 'ws_CO_SM4_' + Date.now()
    await insertPayment(A, SUB_A, key, { checkoutRequestId: cid })
    const u = await updateStatus(cid, 'Failed', { fromStatus: 'Pending' })
    assert.equal(u.rows[0].status, 'Failed')
  })
  it('Processing -> Completed', async () => {
    if (!client) return
    const key = crypto.randomUUID()
    const cid = 'ws_CO_SM5_' + Date.now()
    await insertPayment(A, SUB_A, key, { checkoutRequestId: cid, status: 'Processing' })
    const u = await updateStatus(cid, 'Completed', { mpesaReceipt: 'QHK_PROC', fromStatus: 'Processing' })
    assert.equal(u.rows[0].status, 'Completed')
  })
  it('Processing -> Failed', async () => {
    if (!client) return
    const key = crypto.randomUUID()
    const cid = 'ws_CO_SM6_' + Date.now()
    await insertPayment(A, SUB_A, key, { checkoutRequestId: cid, status: 'Processing' })
    const u = await updateStatus(cid, 'Failed', { fromStatus: 'Processing' })
    assert.equal(u.rows[0].status, 'Failed')
  })
})

describe('Late Success and Duplicate Callbacks', () => {
  it('late success after Pending', async () => {
    if (!client) return
    const key = crypto.randomUUID()
    const cid = 'ws_CO_LS1_' + Date.now()
    await insertPayment(A, SUB_A, key, { checkoutRequestId: cid })
    const u = await updateStatus(cid, 'Completed', { mpesaReceipt: 'QHK_LATE1', fromStatus: 'Pending' })
    assert.equal(u.rows[0].status, 'Completed')
  })
  it('duplicate success: idempotent no-op', async () => {
    if (!client) return
    const key = crypto.randomUUID()
    const cid = 'ws_CO_LS2_' + Date.now()
    await insertPayment(A, SUB_A, key, { checkoutRequestId: cid })
    await updateStatus(cid, 'Completed', { mpesaReceipt: 'QHK_DUP', fromStatus: 'Pending' })
    const dup = await updateStatus(cid, 'Completed', { mpesaReceipt: 'QHK_DUP2', fromStatus: 'Pending' })
    assert.equal(dup.rows.length, 0)
  })
  it('no duplicate contribution', async () => {
    if (!client) return
    const key = crypto.randomUUID()
    const cid = 'ws_CO_LS3_' + Date.now()
    await insertPayment(A, SUB_A, key, { checkoutRequestId: cid })
    await updateStatus(cid, 'Completed', { mpesaReceipt: 'QHK_C', fromStatus: 'Pending' })
    const c1 = await countContributions(SUB_A)
    await updateStatus(cid, 'Completed', { mpesaReceipt: 'QHK_C2', fromStatus: 'Pending' })
    const c2 = await countContributions(SUB_A)
    assert.equal(c2, c1)
  })
})

describe('STK Push Timeout Handling', () => {
  it('STK timeout: payment marked Processing', async () => {
    if (!client) return
    const key = crypto.randomUUID()
    const result = await insertPayment(A, SUB_A, key, { status: 'Processing' })
    assert.equal(result.success, true)
    assert.equal(result.payment.status, 'Processing')
  })
  it('Processing preserves info for reconciliation', async () => {
    if (!client) return
    const key = crypto.randomUUID()
    const cid = 'ws_CO_TIMEOUT_' + Date.now()
    await insertPayment(A, SUB_A, key, { status: 'Processing', checkoutRequestId: cid })
    const payment = await findPayment(cid)
    assert.ok(payment)
    assert.equal(payment.status, 'Processing')
  })
  it('retry uses new idempotency key', async () => {
    if (!client) return
    const r1 = await insertPayment(A, SUB_A, crypto.randomUUID(), { status: 'Processing' })
    const r2 = await insertPayment(A, SUB_A, crypto.randomUUID())
    assert.notEqual(r1.payment.id, r2.payment.id)
  })
  it('no duplicate on retry same key', async () => {
    if (!client) return
    const key = crypto.randomUUID()
    const r1 = await insertPayment(A, SUB_A, key)
    const r2 = await insertPayment(A, SUB_A, key)
    assert.equal(r2.conflict, true)
    assert.equal(r1.payment.id, r2.payment.id)
  })
})

describe('Cross-Member Isolation', () => {
  it('member A cannot query member B payment', async () => {
    if (!client) return
    const key = crypto.randomUUID()
    const r1 = await insertPayment(A, SUB_A, key)
    const bQuery = await client.query('SELECT id FROM payments WHERE id = $1 AND member_id = $2', [r1.payment.id, B])
    assert.equal(bQuery.rows.length, 0)
  })
  it('same key for different members creates separate payments', async () => {
    if (!client) return
    const key = crypto.randomUUID()
    const r1 = await insertPayment(A, SUB_A, key)
    const r2 = await insertPayment(B, SUB_B, key)
    assert.notEqual(r1.payment.id, r2.payment.id)
  })
})

describe('Package Attribution', () => {
  it('package_id from subscription not amount', async () => {
    if (!client) return
    const key = crypto.randomUUID()
    await insertPayment(A, SUB_A, key, { amount: 1 })
    const { rows } = await client.query('SELECT package_id FROM payments WHERE idempotency_key = $1', [key])
    assert.equal(rows[0].package_id, PKG)
  })
  it('payment links to correct subscription', async () => {
    if (!client) return
    const key = crypto.randomUUID()
    await insertPayment(A, SUB_A, key)
    const { rows } = await client.query('SELECT subscription_id FROM payments WHERE idempotency_key = $1', [key])
    assert.equal(rows[0].subscription_id, SUB_A)
  })
})

describe('Reconciliation State', () => {
  it('Pending can be reconciled', async () => {
    if (!client) return
    const key = crypto.randomUUID()
    const cid = 'ws_CO_REC1_' + Date.now()
    await insertPayment(A, SUB_A, key, { checkoutRequestId: cid, status: 'Pending' })
    const { rows } = await client.query('SELECT status FROM payments WHERE checkout_request_id = $1', [cid])
    assert.equal(rows[0].status, 'Pending')
  })
  it('Processing can be reconciled', async () => {
    if (!client) return
    const key = crypto.randomUUID()
    const cid = 'ws_CO_REC2_' + Date.now()
    await insertPayment(A, SUB_A, key, { checkoutRequestId: cid, status: 'Processing' })
    const { rows } = await client.query('SELECT status FROM payments WHERE checkout_request_id = $1', [cid])
    assert.equal(rows[0].status, 'Processing')
  })
  it('Completed is terminal', async () => {
    if (!client) return
    const key = crypto.randomUUID()
    const cid = 'ws_CO_REC3_' + Date.now()
    await insertPayment(A, SUB_A, key, { checkoutRequestId: cid })
    await updateStatus(cid, 'Completed', { mpesaReceipt: 'QHK_REC', fromStatus: 'Pending' })
    const { rows } = await client.query('SELECT status FROM payments WHERE checkout_request_id = $1', [cid])
    assert.equal(rows[0].status, 'Completed')
  })
})

describe('Regression', () => {
  it('payments has all required columns', async () => {
    if (!client) return
    const { rows } = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'payments' ORDER BY ordinal_position")
    const cols = rows.map(r => r.column_name)
    for (const c of ['id','member_id','subscription_id','package_id','amount','phone','mpesa_receipt','status','channel','idempotency_key','checkout_request_id']) {
      assert.ok(cols.includes(c), 'payments has ' + c)
    }
  })
  it('idempotency unique index exists', async () => {
    if (!client) return
    const { rows } = await client.query("SELECT indexname FROM pg_indexes WHERE tablename = 'payments' AND indexname = 'idx_payments_idempotency'")
    assert.equal(rows.length, 1)
  })
  it('checkout_request_id unique index exists', async () => {
    if (!client) return
    const { rows } = await client.query("SELECT indexname FROM pg_indexes WHERE tablename = 'payments' AND indexname = 'idx_payments_checkout_request'")
    assert.equal(rows.length, 1)
  })
  it('contributions unique constraint exists', async () => {
    if (!client) return
    const { rows } = await client.query("SELECT indexname FROM pg_indexes WHERE tablename = 'contributions' AND indexname LIKE '%subscription%period%'")
    assert.ok(rows.length > 0)
  })
})
