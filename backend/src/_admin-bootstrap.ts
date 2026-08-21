#!/usr/bin/env tsx
/**
 * LUMA WELFARE — First Administrator Bootstrap
 *
 * This script provisions the first administrator using the Supabase Admin API.
 * It is idempotent — safe to run multiple times.
 *
 * Usage:
 *   npx tsx src/_admin-bootstrap.ts
 *
 * Environment variables required:
 *   SUPABASE_URL          — Supabase project URL
 *   SUPABASE_SECRET_KEY   — Supabase service role key (NEVER commit this)
 *
 * What it does:
 *   1. Creates or finds the Supabase Auth user for lumawelfare@gmail.com
 *   2. Checks whether an admins record exists
 *   3. If missing, creates the admins record linked to the Auth user
 *   4. Assigns the highest-privilege administrative role
 *   5. Logs an audit event
 *
 * Security:
 *   - Never prints, logs, or returns passwords
 *   - Never exposes the secret key
 *   - Uses Supabase Admin (service role) API only for this bootstrap
 */
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import pg from 'pg'

const ADMIN_EMAIL = 'lumawelfare@gmail.com'
const ADMIN_DISPLAY_NAME = 'Luma Administrator'
const BOOTSTRAP_PASSWORD = process.env.ADMIN_BOOTSTRAP_PASSWORD

function fail(msg: string): never {
  console.error(`FATAL: ${msg}`)
  process.exit(1)
}

async function main() {
  // ── Validate environment ──────────────────────────────────────────────
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SECRET_KEY
  if (!supabaseUrl) fail('SUPABASE_URL is not set')
  if (!supabaseKey) fail('SUPABASE_SECRET_KEY is not set')
  if (!BOOTSTRAP_PASSWORD) fail('ADMIN_BOOTSTRAP_PASSWORD is not set')

  const supabase = createClient(supabaseUrl, supabaseKey)

  console.log('Step 1: Checking for existing Auth user...')

  // ── Step 1: Find or create the Auth user ──────────────────────────────
  // List users to find by email (Supabase Auth admin API)
  const { data: users, error: listError } = await supabase.auth.admin.listUsers()
  if (listError) fail(`Failed to list users: ${listError.message}`)

  let authUser = users.users.find(
    (u) => u.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase(),
  )

  if (authUser) {
    console.log(`  Found existing Auth user: ${authUser.id}`)
  } else {
    console.log('  Creating new Auth user...')
    const { data: created, error: createError } =
      await supabase.auth.admin.createUser({
        email: ADMIN_EMAIL,
        password: BOOTSTRAP_PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: ADMIN_DISPLAY_NAME },
      })
    if (createError) fail(`Failed to create Auth user: ${createError.message}`)
    authUser = created.user
    console.log(`  Created Auth user: ${authUser.id}`)
  }

  const userId = authUser.id

  // ── Step 2: Check for existing admins record ──────────────────────────
  console.log('\nStep 2: Checking for existing admins record...')
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  })

  if (!process.env.DATABASE_URL) {
    fail('DATABASE_URL is not set')
  }

  await client.connect()

  try {
    const { rows: existingAdmin } = await client.query(
      'SELECT id, display_name, role_id, is_active, is_superadmin FROM admins WHERE id = $1',
      [userId],
    )

    if (existingAdmin.length > 0) {
      console.log(`  Admins record exists: ${existingAdmin[0].id}`)
      console.log(`  Display name: ${existingAdmin[0].display_name}`)
      console.log(`  Active: ${existingAdmin[0].is_active}`)
      console.log(`  Superadmin: ${existingAdmin[0].is_superadmin}`)
    } else {
      console.log('  No admins record found — creating one...')
    }

    // ── Step 3: Find the highest-privilege role ──────────────────────────
    console.log('\nStep 3: Finding administrative role...')
    const { rows: roles } = await client.query(
      'SELECT id, name FROM roles ORDER BY name',
    )

    if (roles.length === 0) {
      fail('No roles found in the roles table. Please run the database seed first.')
    }

    console.log('  Available roles:')
    for (const role of roles) {
      console.log(`    - ${role.name} (${role.id})`)
    }

    // Use the role named "Administrator" or "admin" or the first role
    const adminRole =
      roles.find((r) => r.name.toLowerCase() === 'administrator') ??
      roles.find((r) => r.name.toLowerCase() === 'admin') ??
      roles[0]

    console.log(`\n  Selected role: ${adminRole.name} (${adminRole.id})`)

    // ── Step 4: Upsert admins record ────────────────────────────────────
    console.log('\nStep 4: Upserting admins record...')

    if (existingAdmin.length === 0) {
      await client.query(
        `INSERT INTO admins (id, display_name, role_id, is_superadmin, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, true, true, now(), now())`,
        [userId, ADMIN_DISPLAY_NAME, adminRole.id],
      )
      console.log('  Admins record created.')
    } else {
      // Ensure active and has correct role
      await client.query(
        `UPDATE admins SET role_id = $2, is_active = true, is_superadmin = true, updated_at = now()
         WHERE id = $1 AND (role_id != $2 OR is_active != true OR is_superadmin != true)`,
        [userId, adminRole.id],
      )
      console.log('  Admins record verified and updated if needed.')
    }

    // ── Step 5: Verify permissions ──────────────────────────────────────
    console.log('\nStep 5: Verifying permissions...')
    const { rows: permissions } = await client.query(
      'SELECT resource, action FROM permissions WHERE role_id = $1 ORDER BY resource, action',
      [adminRole.id],
    )

    if (permissions.length === 0) {
      console.log('  WARNING: No permissions found for this role.')
    } else {
      console.log(`  Role has ${permissions.length} permissions:`)
      const grouped: Record<string, string[]> = {}
      for (const p of permissions) {
        if (!grouped[p.resource]) grouped[p.resource] = []
        grouped[p.resource].push(p.action)
      }
      for (const [resource, actions] of Object.entries(grouped)) {
        console.log(`    ${resource}: ${actions.join(', ')}`)
      }
    }

    // ── Step 6: Audit log ───────────────────────────────────────────────
    console.log('\nStep 6: Writing audit log...')
    await client.query(
      `INSERT INTO audit_logs (actor_id, actor_role, action, resource, resource_id, meta)
       VALUES ($1, $2, 'admin_bootstrapped', 'admin', $1, $3)`,
      [
        userId,
        adminRole.name,
        JSON.stringify({
          email: ADMIN_EMAIL,
          display_name: ADMIN_DISPLAY_NAME,
          role: adminRole.name,
          is_superadmin: true,
          note: 'First administrator bootstrap',
        }),
      ],
    )
    console.log('  Audit log entry created.')

    // ── Summary ─────────────────────────────────────────────────────────
    console.log('\n═══════════════════════════════════════════════')
    console.log('  ADMIN BOOTSTRAP COMPLETE')
    console.log('═══════════════════════════════════════════════')
    console.log(`  Email:    ${ADMIN_EMAIL}`)
    console.log(`  UUID:     ${userId}`)
    console.log(`  Role:     ${adminRole.name}`)
    console.log(`  Active:   true`)
    console.log(`  Super:    true`)
    console.log(`  Perms:    ${permissions.length}`)
    console.log('═══════════════════════════════════════════════')
    console.log('')
    console.log('Next steps:')
    console.log('  1. Change the bootstrap password before production')
    console.log('  2. Enable MFA for the administrator account')
    console.log('  3. Do NOT commit ADMIN_BOOTSTRAP_PASSWORD')
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err)
  process.exit(1)
})
