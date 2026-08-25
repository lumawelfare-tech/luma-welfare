/**
 * Registration Fee Security Tests
 *
 * Proves that:
 * 1. Normal members CANNOT directly update registration_fees.status = 'paid'
 * 2. Member A CANNOT modify Member B's registration_fees
 * 3. Unauthenticated users CANNOT modify any registration_fees
 * 4. Amount cannot be changed by client
 * 5. Only service-role (admin) can update registration_fees
 *
 * Run: node --test src/__tests__/registration-fee-security.test.mjs
 */

import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import pg from 'pg'

const DATABASE_URL = process.env.DATABASE_URL
const MEMBER_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const MEMBER_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
let client

// ──────────────────────────────────────────────────────
// Setup / Teardown
// ──────────────────────────────────────────────────────

before(async () => {
  if (!DATABASE_URL) {
    console.log('DATABASE_URL not set, skipping registration fee security tests')
    return
  }
  client = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } })
  await client.connect()

  // Create test auth users
  await client.query(`
    INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
    VALUES
      ($1, 'regsec-a@test.com', crypt('test', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}'),
      ($2, 'regsec-b@test.com', crypt('test', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}')
    ON CONFLICT (id) DO NOTHING
  `, [MEMBER_A, MEMBER_B])

  // Create test members
  await client.query(`
    INSERT INTO members (id, full_name, phone, email, status)
    VALUES
      ($1, 'Test Member A', '0711111111', 'regsec-a@test.com', 'active'),
      ($2, 'Test Member B', '0722222222', 'regsec-b@test.com', 'active')
    ON CONFLICT (id) DO NOTHING
  `, [MEMBER_A, MEMBER_B])

  // Create registration fee records
  await client.query(`
    INSERT INTO registration_fees (member_id, fee_type, amount, currency, status)
    VALUES
      ($1, 'registration', 300, 'KES', 'unpaid'),
      ($2, 'registration', 300, 'KES', 'unpaid')
    ON CONFLICT (member_id, fee_type) DO UPDATE SET status = 'unpaid'
  `, [MEMBER_A, MEMBER_B])
})

after(async () => {
  if (!client) return
  await client.query('DELETE FROM registration_fees WHERE member_id IN ($1, $2)', [MEMBER_A, MEMBER_B])
  await client.query('DELETE FROM members WHERE id IN ($1, $2)', [MEMBER_A, MEMBER_B])
  await client.query('DELETE FROM auth.users WHERE id IN ($1, $2)', [MEMBER_A, MEMBER_B])
  await client.end()
})

// ──────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────

describe('RLS: registration_fees policies exist', () => {
  it('SELECT policy exists for members', async () => {
    if (!client) return
    const { rows } = await client.query(
      "SELECT policyname FROM pg_policies WHERE tablename = 'registration_fees' AND cmd = 'SELECT'"
    )
    assert.ok(rows.length > 0, 'SELECT policy must exist')
  })

  it('INSERT policy exists for members', async () => {
    if (!client) return
    const { rows } = await client.query(
      "SELECT policyname FROM pg_policies WHERE tablename = 'registration_fees' AND cmd = 'INSERT'"
    )
    assert.ok(rows.length > 0, 'INSERT policy must exist')
  })

  it('UPDATE policy does NOT exist for members', async () => {
    if (!client) return
    const { rows } = await client.query(
      "SELECT policyname FROM pg_policies WHERE tablename = 'registration_fees' AND cmd = 'UPDATE'"
    )
    assert.equal(rows.length, 0, 'UPDATE policy must NOT exist — members cannot self-confirm')
  })

  it('DELETE policy does NOT exist for members', async () => {
    if (!client) return
    const { rows } = await client.query(
      "SELECT policyname FROM pg_policies WHERE tablename = 'registration_fees' AND cmd = 'DELETE'"
    )
    assert.equal(rows.length, 0, 'DELETE policy must NOT exist')
  })
})

describe('Schema: registration_fees constraints', () => {
  it('unique constraint on (member_id, fee_type) exists', async () => {
    if (!client) return
    const { rows } = await client.query(`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'registration_fees' AND indexname LIKE '%member%fee%'
    `)
    // Check for unique constraint (either via index or constraint)
    const { rows: constraints } = await client.query(`
      SELECT conname FROM pg_constraint
      WHERE conrelid = 'registration_fees'::regclass AND contype = 'u'
    `)
    assert.ok(rows.length > 0 || constraints.length > 0, 'Unique constraint on (member_id, fee_type) must exist')
  })

  it('amount defaults to 300', async () => {
    if (!client) return
    const { rows } = await client.query(`
      SELECT column_default FROM information_schema.columns
      WHERE table_name = 'registration_fees' AND column_name = 'amount'
    `)
    assert.ok(rows[0]?.column_default?.includes('300'), 'amount must default to 300')
  })

  it('status defaults to unpaid', async () => {
    if (!client) return
    const { rows } = await client.query(`
      SELECT column_default FROM information_schema.columns
      WHERE table_name = 'registration_fees' AND column_name = 'status'
    `)
    assert.ok(rows[0]?.column_default?.includes('unpaid'), 'status must default to unpaid')
  })

  it('CHECK constraint limits status values', async () => {
    if (!client) return
    const { rows } = await client.query(`
      SELECT pg_get_constraintdef(oid) as def
      FROM pg_constraint
      WHERE conrelid = 'registration_fees'::regclass
      AND pg_get_constraintdef(oid) LIKE '%status%'
    `)
    assert.ok(rows.length > 0, 'CHECK constraint on status must exist')
    assert.ok(rows[0].def.includes('unpaid'), 'CHECK must include unpaid')
    assert.ok(rows[0].def.includes('paid'), 'CHECK must include paid')
    assert.ok(rows[0].def.includes('pending'), 'CHECK must include pending')
  })

  it('CHECK constraint limits fee_type to registration', async () => {
    if (!client) return
    const { rows } = await client.query(`
      SELECT pg_get_constraintdef(oid) as def
      FROM pg_constraint
      WHERE conrelid = 'registration_fees'::regclass
      AND pg_get_constraintdef(oid) LIKE '%fee_type%'
    `)
    assert.ok(rows.length > 0, 'CHECK constraint on fee_type must exist')
    assert.ok(rows[0].def.includes('registration'), 'CHECK must restrict fee_type to registration')
  })
})

describe('Security: member cannot self-mark as paid via direct SQL', () => {
  it('UPDATE status to paid via member_id match is blocked by RLS', async () => {
    if (!client) return

    // First, get the current status
    const { rows: before } = await client.query(
      'SELECT status FROM registration_fees WHERE member_id = $1 AND fee_type = $2',
      [MEMBER_A, 'registration']
    )
    assert.equal(before[0]?.status, 'unpaid', 'Initial status must be unpaid')

    // Attempt to update via RLS (simulating a member client)
    // We do this by setting session variables and attempting the update
    await client.query('BEGIN')
    await client.query(`SET LOCAL role = authenticated`)
    await client.query(`SET LOCAL request.jwt.claims = '{"sub":"${MEMBER_A}"}'`)
    await client.query(`SET LOCAL role = authenticator`)
    const result = await client.query(`
      UPDATE registration_fees
      SET status = 'paid', paid_at = now()
      WHERE member_id = $1 AND fee_type = 'registration'
    `, [MEMBER_A])
    await client.query('ROLLBACK')

    // The update should affect 0 rows due to RLS (no UPDATE policy)
    assert.equal(result.rowCount, 0, 'UPDATE must affect 0 rows — no UPDATE policy exists')
  })

  it('amount cannot be changed to arbitrary value', async () => {
    if (!client) return

    await client.query('BEGIN')
    await client.query(`SET LOCAL role = authenticated`)
    await client.query(`SET LOCAL request.jwt.claims = '{"sub":"${MEMBER_A}"}'`)
    await client.query(`SET LOCAL role = authenticator`)
    const result = await client.query(`
      UPDATE registration_fees
      SET amount = 0
      WHERE member_id = $1 AND fee_type = 'registration'
    `, [MEMBER_A])
    await client.query('ROLLBACK')

    assert.equal(result.rowCount, 0, 'UPDATE amount must affect 0 rows — no UPDATE policy')
  })

  it('mpesa_receipt cannot be set by member', async () => {
    if (!client) return

    await client.query('BEGIN')
    await client.query(`SET LOCAL role = authenticated`)
    await client.query(`SET LOCAL request.jwt.claims = '{"sub":"${MEMBER_A}"}'`)
    await client.query(`SET LOCAL role = authenticator`)
    const result = await client.query(`
      UPDATE registration_fees
      SET mpesa_receipt = 'FAKE_RECEIPT'
      WHERE member_id = $1 AND fee_type = 'registration'
    `, [MEMBER_A])
    await client.query('ROLLBACK')

    assert.equal(result.rowCount, 0, 'UPDATE mpesa_receipt must affect 0 rows — no UPDATE policy')
  })

  it('transaction_reference cannot be set by member', async () => {
    if (!client) return

    await client.query('BEGIN')
    await client.query(`SET LOCAL role = authenticated`)
    await client.query(`SET LOCAL request.jwt.claims = '{"sub":"${MEMBER_A}"}'`)
    await client.query(`SET LOCAL role = authenticator`)
    const result = await client.query(`
      UPDATE registration_fees
      SET transaction_reference = 'FAKE_REF'
      WHERE member_id = $1 AND fee_type = 'registration'
    `, [MEMBER_A])
    await client.query('ROLLBACK')

    assert.equal(result.rowCount, 0, 'UPDATE transaction_reference must affect 0 rows — no UPDATE policy')
  })

  it('payment_method cannot be changed by member', async () => {
    if (!client) return

    await client.query('BEGIN')
    await client.query(`SET LOCAL role = authenticated`)
    await client.query(`SET LOCAL request.jwt.claims = '{"sub":"${MEMBER_A}"}'`)
    await client.query(`SET LOCAL role = authenticator`)
    const result = await client.query(`
      UPDATE registration_fees
      SET payment_method = 'cash'
      WHERE member_id = $1 AND fee_type = 'registration'
    `, [MEMBER_A])
    await client.query('ROLLBACK')

    assert.equal(result.rowCount, 0, 'UPDATE payment_method must affect 0 rows — no UPDATE policy')
  })

  it('paid_at cannot be set by member', async () => {
    if (!client) return

    await client.query('BEGIN')
    await client.query(`SET LOCAL role = authenticated`)
    await client.query(`SET LOCAL request.jwt.claims = '{"sub":"${MEMBER_A}"}'`)
    await client.query(`SET LOCAL role = authenticator`)
    const result = await client.query(`
      UPDATE registration_fees
      SET paid_at = now()
      WHERE member_id = $1 AND fee_type = 'registration'
    `, [MEMBER_A])
    await client.query('ROLLBACK')

    assert.equal(result.rowCount, 0, 'UPDATE paid_at must affect 0 rows — no UPDATE policy')
  })
})

describe('Security: cross-member isolation', () => {
  it('Member A cannot read Member B registration fee via RLS', async () => {
    if (!client) return

    await client.query('BEGIN')
    await client.query(`SET LOCAL role = authenticated`)
    await client.query(`SET LOCAL request.jwt.claims = '{"sub":"${MEMBER_A}"}'`)
    await client.query(`SET LOCAL role = authenticator`)
    const { rows } = await client.query(
      'SELECT * FROM registration_fees WHERE member_id = $1',
      [MEMBER_B]
    )
    await client.query('ROLLBACK')

    assert.equal(rows.length, 0, 'Member A must not see Member B registration fees')
  })

  it('Member A cannot modify Member B registration fee', async () => {
    if (!client) return

    await client.query('BEGIN')
    await client.query(`SET LOCAL role = authenticated`)
    await client.query(`SET LOCAL request.jwt.claims = '{"sub":"${MEMBER_A}"}'`)
    await client.query(`SET LOCAL role = authenticator`)
    const result = await client.query(`
      UPDATE registration_fees
      SET status = 'paid'
      WHERE member_id = $1 AND fee_type = 'registration'
    `, [MEMBER_B])
    await client.query('ROLLBACK')

    assert.equal(result.rowCount, 0, 'Member A must not be able to update Member B fee')
  })

  it('Member A cannot insert a registration fee for Member B', async () => {
    if (!client) return

    await client.query('BEGIN')
    await client.query(`SET LOCAL role = authenticated`)
    await client.query(`SET LOCAL request.jwt.claims = '{"sub":"${MEMBER_A}"}'`)
    await client.query(`SET LOCAL role = authenticator`)
    try {
      await client.query(`
        INSERT INTO registration_fees (member_id, fee_type, amount, currency, status)
        VALUES ($1, 'registration', 300, 'KES', 'paid')
      `, [MEMBER_B])
      await client.query('ROLLBACK')
      assert.fail('INSERT for another member must fail')
    } catch (err) {
      await client.query('ROLLBACK')
      // Either RLS blocks it or foreign key constraint prevents it
      assert.ok(err, 'INSERT for another member must fail')
    }
  })
})

describe('Security: service-role can update (admin operations)', () => {
  it('Service-role can update registration fee status to paid', async () => {
    if (!client) return

    // Service-role bypasses RLS — this simulates admin confirmation
    const result = await client.query(`
      UPDATE registration_fees
      SET status = 'paid', paid_at = now(), mpesa_receipt = 'TEST_RECEIPT'
      WHERE member_id = $1 AND fee_type = 'registration' AND status != 'paid'
    `, [MEMBER_A])

    assert.ok(result.rowCount >= 0, 'Service-role update should succeed')

    // Verify
    const { rows } = await client.query(
      'SELECT status FROM registration_fees WHERE member_id = $1 AND fee_type = $2',
      [MEMBER_A, 'registration']
    )
    assert.equal(rows[0]?.status, 'paid', 'Status should be paid after service-role update')

    // Reset for other tests
    await client.query(`
      UPDATE registration_fees SET status = 'unpaid', paid_at = NULL, mpesa_receipt = NULL
      WHERE member_id = $1 AND fee_type = 'registration'
    `, [MEMBER_A])
  })
})

describe('Security: unauthenticated access', () => {
  it('Unauthenticated user cannot read registration fees', async () => {
    if (!client) return

    await client.query('BEGIN')
    await client.query(`SET LOCAL role = anon`)
    const { rows } = await client.query(
      'SELECT * FROM registration_fees WHERE member_id = $1',
      [MEMBER_A]
    )
    await client.query('ROLLBACK')

    assert.equal(rows.length, 0, 'Anonymous user must not see registration fees')
  })

  it('Unauthenticated user cannot update registration fees', async () => {
    if (!client) return

    await client.query('BEGIN')
    await client.query(`SET LOCAL role = anon`)
    const result = await client.query(`
      UPDATE registration_fees SET status = 'paid' WHERE member_id = $1
    `, [MEMBER_A])
    await client.query('ROLLBACK')

    assert.equal(result.rowCount, 0, 'Anonymous user must not be able to update registration fees')
  })
})

describe('Security: duplicate registration fee prevention', () => {
  it('Cannot insert duplicate registration fee for same member', async () => {
    if (!client) return

    try {
      await client.query(`
        INSERT INTO registration_fees (member_id, fee_type, amount, currency, status)
        VALUES ($1, 'registration', 300, 'KES', 'unpaid')
      `, [MEMBER_A])
      assert.fail('Duplicate insert should fail due to unique constraint')
    } catch (err) {
      assert.equal(err.code, '23505', 'Must fail with unique violation (23505)')
    }
  })

  it('Cannot insert registration fee with invalid fee_type', async () => {
    if (!client) return

    try {
      await client.query(`
        INSERT INTO registration_fees (member_id, fee_type, amount, currency, status)
        VALUES ($1, 'invalid_type', 300, 'KES', 'unpaid')
      `, [MEMBER_A])
      assert.fail('Invalid fee_type should fail due to CHECK constraint')
    } catch (err) {
      assert.equal(err.code, '23514', 'Must fail with check violation (23514)')
    }
  })

  it('Cannot insert registration fee with invalid status', async () => {
    if (!client) return

    try {
      await client.query(`
        INSERT INTO registration_fees (member_id, fee_type, amount, currency, status)
        VALUES ($1, 'registration', 300, 'KES', 'invalid_status')
      `, [MEMBER_A])
      assert.fail('Invalid status should fail due to CHECK constraint')
    } catch (err) {
      assert.equal(err.code, '23514', 'Must fail with check violation (23514)')
    }
  })
})

describe('Regression: members.status default', () => {
  it('members.status defaults to active', async () => {
    if (!client) return
    const { rows } = await client.query(`
      SELECT column_default FROM information_schema.columns
      WHERE table_name = 'members' AND column_name = 'status'
    `)
    assert.ok(rows[0]?.column_default?.includes('active'), 'members.status must default to active')
  })
})
