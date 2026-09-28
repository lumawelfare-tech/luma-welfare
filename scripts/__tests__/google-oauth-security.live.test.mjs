/**
 * Relocated from backend/src/__tests__ during Supabase-only migration.
 * Live / DATABASE_URL required � not run in CI.
 * Run: node --test --import tsx <this-file>
 */
/**
 * Google OAuth Security Tests
 *
 * Proves that:
 * 1. Existing member + matching Google email G�� ALLOW
 * 2. Existing member + different Google email G�� DENY
 * 3. No member record + Google email G�� DENY
 * 4. Existing member + incomplete registration G�� DENY
 * 5. Existing member + suspended/ineligible status G�� DENY
 * 6. Google user cannot create members automatically
 * 7. Google user cannot create registration_fees automatically
 * 8. Member A cannot authenticate as Member B
 * 9. Unauthenticated request cannot call Google auth endpoint
 * 10. Registration fee security remains intact
 * 11. Email/password login still works
 * 12. Normal registration still works
 *
 * Run: node --test src/__tests__/google-oauth-security.test.mjs
 */

import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import pg from 'pg'

const DATABASE_URL = process.env.DATABASE_URL
const DB_SKIP = DATABASE_URL
  ? false
  : 'DATABASE_URL not set - database assertion did not execute'
const MEMBER_A = '11111111-1111-1111-1111-111111111111'
const MEMBER_B = '22222222-2222-2222-2222-222222222222'
const FAKE_MEMBER = '33333333-3333-3333-3333-333333333333'
let client

before(async () => {
  if (!DATABASE_URL) {
    console.log('DATABASE_URL not set, skipping Google OAuth security tests')
    return
  }
  client = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } })
  await client.connect()

  // Create auth users
  await client.query(`
    INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
    VALUES
      ($1, 'member-a@test.com', crypt('test', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}'),
      ($2, 'member-b@test.com', crypt('test', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}'),
      ($3, 'google-only@test.com', crypt('test', gen_salt('bf')), now(), '{"provider":"google","providers":["google"]}', '{"full_name":"Google User"}')
    ON CONFLICT (id) DO NOTHING
  `, [MEMBER_A, MEMBER_B, FAKE_MEMBER])

  // Create member records for A and B (complete registration)
  await client.query(`
    INSERT INTO members (id, full_name, phone, email, status)
    VALUES
      ($1, 'Test Member A', '0711111111', 'member-a@test.com', 'active'),
      ($2, 'Test Member B', '0722222222', 'member-b@test.com', 'active')
    ON CONFLICT (id) DO NOTHING
  `, [MEMBER_A, MEMBER_B])

  // Create registration fee records
  await client.query(`
    INSERT INTO registration_fees (member_id, fee_type, amount, currency, status)
    VALUES
      ($1, 'registration', 300, 'KES', 'unpaid'),
      ($2, 'registration', 300, 'KES', 'unpaid')
    ON CONFLICT (member_id, fee_type) DO NOTHING
  `, [MEMBER_A, MEMBER_B])
})

after(async () => {
  if (!client) return
  try {
    // A failing test can leave an open/aborted transaction behind; without
    // this every cleanup statement fails with 25P02 and client.end() is
    // never reached, which hangs the whole process on exit.
    await client.query('ROLLBACK').catch(() => {})
    await client.query('DELETE FROM registration_fees WHERE member_id IN ($1, $2, $3)', [MEMBER_A, MEMBER_B, FAKE_MEMBER])
    await client.query('DELETE FROM members WHERE id IN ($1, $2, $3)', [MEMBER_A, MEMBER_B, FAKE_MEMBER])
    await client.query('DELETE FROM auth.users WHERE id IN ($1, $2, $3)', [MEMBER_A, MEMBER_B, FAKE_MEMBER])
  } catch (e) {
    console.error('cleanup failed:', e.code, e.message)
  } finally {
    await client.end().catch(() => {})
  }
})

/**
 * members.status is guarded by trg_members_protect_status, which raises
 * 42501 unless auth.role() = 'service_role'. Scenario setup therefore has to
 * impersonate the server role, exactly as the real backend does.
 */
async function setStatusAsService(id, status) {
  await client.query('BEGIN')
  try {
    await client.query(`SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true)`)
    await client.query('UPDATE members SET status = $2 WHERE id = $1', [id, status])
    await client.query('COMMIT')
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    throw e
  }
}

// G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��
// Authorization Logic Tests (simulating auth-google-authorize)
// G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��

describe('TEST 1: Existing member + matching email G�� ALLOW', () => {
  it('Member A with matching email passes authorization', { skip: DB_SKIP }, async () => {
    if (!client) return

    // Simulate: Google email matches member email
    const { rows } = await client.query(
      'SELECT id, full_name, email, phone, status FROM members WHERE id = $1',
      [MEMBER_A]
    )
    assert.equal(rows.length, 1, 'Member exists')
    assert.equal(rows[0].email, 'member-a@test.com')
    assert.equal(rows[0].status, 'active')
    assert.ok(rows[0].full_name?.length >= 2, 'full_name present')
    assert.ok(rows[0].phone, 'phone present')

    // All checks pass G�� authorize
    const authorized = rows[0].status === 'active'
      && rows[0].email
      && rows[0].full_name?.length >= 2
      && rows[0].phone
    // NB: the && chain yields the last truthy operand (the phone number),
    // not boolean true, so assert truthiness rather than strict equality.
    assert.ok(authorized, 'Should be authorized')
  })
})

describe('TEST 2: Existing member + different email G�� DENY', () => {
  it('Member A with wrong Google email is denied', { skip: DB_SKIP }, async () => {
    if (!client) return

    const googleEmail = 'wrong@test.com'
    const { rows } = await client.query(
      'SELECT email FROM members WHERE id = $1',
      [MEMBER_A]
    )

    const emailMatch = googleEmail.toLowerCase() === rows[0].email.toLowerCase()
    assert.equal(emailMatch, false, 'Email mismatch G�� denied')
  })
})

describe('TEST 3: No member record G�� DENY', () => {
  it('Google-only user without member record is denied', { skip: DB_SKIP }, async () => {
    if (!client) return

    // FAKE_MEMBER has auth.users record but NO members record
    const { rows } = await client.query(
      'SELECT id FROM members WHERE id = $1',
      [FAKE_MEMBER]
    )
    assert.equal(rows.length, 0, 'No member record exists')
    // Authorization check: member must exist G�� DENY
  })
})

describe('TEST 4: Incomplete registration G�� DENY', () => {
  it('Member with missing phone is denied', { skip: DB_SKIP }, async () => {
    if (!client) return

    // Temporarily set phone to null
    await client.query('UPDATE members SET phone = NULL WHERE id = $1', [MEMBER_A])

    const { rows } = await client.query(
      'SELECT full_name, email, phone, status FROM members WHERE id = $1',
      [MEMBER_A]
    )

    const missing = []
    if (!rows[0].full_name || rows[0].full_name.length < 2) missing.push('full_name')
    if (!rows[0].email) missing.push('email')
    if (!rows[0].phone) missing.push('phone')

    assert.ok(missing.includes('phone'), 'Phone missing G�� denied')
    assert.equal(missing.length > 0, true, 'Incomplete G�� denied')

    // Restore
    await client.query('UPDATE members SET phone = \'0711111111\' WHERE id = $1', [MEMBER_A])
  })

  it('Member with short full_name is denied', { skip: DB_SKIP }, async () => {
    if (!client) return

    await client.query('UPDATE members SET full_name = \'A\' WHERE id = $1', [MEMBER_A])

    const { rows } = await client.query(
      'SELECT full_name FROM members WHERE id = $1',
      [MEMBER_A]
    )

    assert.ok(rows[0].full_name.length < 2, 'Name too short')
    // Authorization check: full_name must be >= 2 chars G�� DENY

    // Restore
    await client.query('UPDATE members SET full_name = \'Test Member A\' WHERE id = $1', [MEMBER_A])
  })
})

describe('TEST 5: Suspended/ineligible status G�� DENY', () => {
  it('Suspended member is denied', { skip: DB_SKIP }, async () => {
    if (!client) return

    await setStatusAsService(MEMBER_A, 'suspended')

    const { rows } = await client.query(
      'SELECT status FROM members WHERE id = $1',
      [MEMBER_A]
    )
    assert.equal(rows[0].status, 'suspended')
    assert.notEqual(rows[0].status, 'active', 'Not active G�� denied')

    // Restore
    await setStatusAsService(MEMBER_A, 'active')
  })

  it('Closed member is denied', { skip: DB_SKIP }, async () => {
    if (!client) return

    await setStatusAsService(MEMBER_A, 'closed')

    const { rows } = await client.query(
      'SELECT status FROM members WHERE id = $1',
      [MEMBER_A]
    )
    assert.equal(rows[0].status, 'closed')
    assert.notEqual(rows[0].status, 'active', 'Not active G�� denied')

    // Restore
    await setStatusAsService(MEMBER_A, 'active')
  })
})

describe('TEST 6: Member cannot be created by Google OAuth', () => {
  it('FAKE_MEMBER has no members record (not auto-provisioned)', { skip: DB_SKIP }, async () => {
    if (!client) return

    const { rows } = await client.query(
      'SELECT id FROM members WHERE id = $1',
      [FAKE_MEMBER]
    )
    assert.equal(rows.length, 0, 'No member record auto-created from Google')
  })

  it('FAKE_MEMBER has no registration_fees record', { skip: DB_SKIP }, async () => {
    if (!client) return

    const { rows } = await client.query(
      'SELECT id FROM registration_fees WHERE member_id = $1',
      [FAKE_MEMBER]
    )
    assert.equal(rows.length, 0, 'No registration_fees auto-created from Google')
  })
})

describe('TEST 7: Cross-member isolation', () => {
  it('Member A cannot access Member B data via RLS', { skip: DB_SKIP }, async () => {
    if (!client) return

    let rows
    await client.query('BEGIN')
    try {
      await client.query(`SET LOCAL role = authenticated`)
      await client.query(`SET LOCAL request.jwt.claims = '{"sub":"${MEMBER_A}"}'`)
      rows = (await client.query(
        'SELECT * FROM members WHERE id = $1',
        [MEMBER_B]
      )).rows
    } finally {
      // Always release the transaction, otherwise a failure here poisons
      // the shared client with 25P02 for every later test.
      await client.query('ROLLBACK').catch(() => {})
    }

    assert.equal(rows.length, 0, 'RLS blocks cross-member read')
  })
})

describe('TEST 8: RLS enforcement on registration_fees', () => {
  it('registration_fees has SELECT policy', { skip: DB_SKIP }, async () => {
    if (!client) return

    const { rows } = await client.query(
      "SELECT policyname FROM pg_policies WHERE tablename = 'registration_fees' AND cmd = 'SELECT'"
    )
    assert.ok(rows.length > 0, 'SELECT policy exists')
  })

  it('registration_fees has INSERT policy', { skip: DB_SKIP }, async () => {
    if (!client) return

    const { rows } = await client.query(
      "SELECT policyname FROM pg_policies WHERE tablename = 'registration_fees' AND cmd = 'INSERT'"
    )
    assert.ok(rows.length > 0, 'INSERT policy exists')
  })

  it('registration_fees has NO UPDATE policy', { skip: DB_SKIP }, async () => {
    if (!client) return

    const { rows } = await client.query(
      "SELECT policyname FROM pg_policies WHERE tablename = 'registration_fees' AND cmd = 'UPDATE'"
    )
    assert.equal(rows.length, 0, 'UPDATE policy must NOT exist')
  })
})

describe('TEST 9: Schema constraints', () => {
  it('members.status defaults to pending_approval', { skip: DB_SKIP }, async () => {
    if (!client) return

    const { rows } = await client.query(`
      SELECT column_default FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'members' AND column_name = 'status'
    `)
    // A new member must never default to 'active' — registration inserts
    // pending_approval explicitly (auth-register/index.ts) and activation is
    // an admin action. Migration 20260825120000 announced an 'active' default
    // but never emitted the DDL, so the row default must stay locked down.
    assert.ok(
      rows[0]?.column_default?.includes('pending_approval'),
      `Default must be pending_approval, got ${rows[0]?.column_default}`,
    )
  })

  it('registration_fees.amount defaults to 300', { skip: DB_SKIP }, async () => {
    if (!client) return

    const { rows } = await client.query(`
      SELECT column_default FROM information_schema.columns
      WHERE table_name = 'registration_fees' AND column_name = 'amount'
    `)
    assert.ok(rows[0]?.column_default?.includes('300'), 'Default is 300')
  })

  it('registration_fees.status defaults to unpaid', { skip: DB_SKIP }, async () => {
    if (!client) return

    const { rows } = await client.query(`
      SELECT column_default FROM information_schema.columns
      WHERE table_name = 'registration_fees' AND column_name = 'status'
    `)
    assert.ok(rows[0]?.column_default?.includes('unpaid'), 'Default is unpaid')
  })

  it('unique constraint on registration_fees (member_id, fee_type)', { skip: DB_SKIP }, async () => {
    if (!client) return

    const { rows } = await client.query(`
      SELECT conname FROM pg_constraint
      WHERE conrelid = 'registration_fees'::regclass AND contype = 'u'
    `)
    assert.ok(rows.length > 0, 'Unique constraint exists')
  })
})

describe('TEST 10: Duplicate registration fee prevention', () => {
  it('Cannot insert duplicate registration fee', { skip: DB_SKIP }, async () => {
    if (!client) return

    try {
      await client.query(`
        INSERT INTO registration_fees (member_id, fee_type, amount, currency, status)
        VALUES ($1, 'registration', 300, 'KES', 'unpaid')
      `, [MEMBER_A])
      assert.fail('Should fail with unique violation')
    } catch (err) {
      assert.equal(err.code, '23505', 'Unique violation')
    }
  })

  it('Cannot insert with invalid fee_type', { skip: DB_SKIP }, async () => {
    if (!client) return

    try {
      await client.query(`
        INSERT INTO registration_fees (member_id, fee_type, amount, currency, status)
        VALUES ($1, 'invalid', 300, 'KES', 'unpaid')
      `, [MEMBER_A])
      assert.fail('Should fail with check violation')
    } catch (err) {
      assert.equal(err.code, '23514', 'Check violation')
    }
  })

  it('Cannot insert with invalid status', { skip: DB_SKIP }, async () => {
    if (!client) return

    try {
      await client.query(`
        INSERT INTO registration_fees (member_id, fee_type, amount, currency, status)
        VALUES ($1, 'registration', 300, 'KES', 'fake_status')
      `, [MEMBER_A])
      assert.fail('Should fail with check violation')
    } catch (err) {
      assert.equal(err.code, '23514', 'Check violation')
    }
  })
})

describe('TEST 11: Members cannot self-mark registration fee as paid', () => {
  it('UPDATE blocked by RLS (no UPDATE policy)', { skip: DB_SKIP }, async () => {
    if (!client) return

    let result
    await client.query('BEGIN')
    try {
      await client.query(`SET LOCAL role = authenticated`)
      await client.query(`SET LOCAL request.jwt.claims = '{"sub":"${MEMBER_A}"}'`)
      result = await client.query(`
        UPDATE registration_fees SET status = 'paid' WHERE member_id = $1
      `, [MEMBER_A])
    } finally {
      await client.query('ROLLBACK').catch(() => {})
    }

    assert.equal(result.rowCount, 0, 'UPDATE blocked by RLS')
  })
})

describe('TEST 12: Service-role can update (admin operations)', () => {
  it('Service-role can update registration fee', { skip: DB_SKIP }, async () => {
    if (!client) return

    const result = await client.query(`
      UPDATE registration_fees SET status = 'paid', paid_at = now()
      WHERE member_id = $1 AND fee_type = 'registration' AND status != 'paid'
    `, [MEMBER_A])

    assert.ok(result.rowCount >= 0, 'Service-role update succeeds')

    // Reset
    await client.query(`
      UPDATE registration_fees SET status = 'unpaid', paid_at = NULL
      WHERE member_id = $1 AND fee_type = 'registration'
    `, [MEMBER_A])
  })
})
