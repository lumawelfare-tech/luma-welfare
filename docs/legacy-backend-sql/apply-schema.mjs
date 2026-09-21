import pg from 'pg';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbDir = join(__dirname, '..', 'db');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const client = new pg.Client({ connectionString: DATABASE_URL });

async function main() {
  try {
    await client.connect();
    console.log('Connected to database');

    // Check existing tables
    console.log('\n=== CHECKING EXISTING TABLES ===');
    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    console.log('Existing tables:', tablesResult.rows.map(r => r.table_name).join(', '));

    // Check if schema already exists
    const expectedTables = [
      'packages', 'package_tiers', 'package_rules', 'members', 'family_members',
      'subscriptions', 'payments', 'contributions', 'qualifications', 'claims',
      'claim_documents', 'payouts', 'notifications', 'roles', 'permissions',
      'admins', 'audit_logs', 'news_events', 'gallery_items', 'platform_settings',
      'open_questions'
    ];
    
    const existingTables = tablesResult.rows.map(r => r.table_name);
    const missingTables = expectedTables.filter(t => !existingTables.includes(t));
    
    if (missingTables.length === 0) {
      console.log('\n✓ All expected tables exist');
    } else {
      console.log('\nMissing tables:', missingTables.join(', '));
    }

    // Check if enums exist
    console.log('\n=== CHECKING ENUMS ===');
    const enumsResult = await client.query(`
      SELECT typname, enumlabel 
      FROM pg_enum 
      JOIN pg_type ON pg_enum.enumtypid = pg_type.oid 
      ORDER BY typname, enumsortorder
    `);
    const enums = {};
    for (const row of enumsResult.rows) {
      if (!enums[row.typname]) enums[row.typname] = [];
      enums[row.typname].push(row.enumlabel);
    }
    console.log('Enums:', Object.keys(enums).join(', '));

    // Check RLS policies
    console.log('\n=== CHECKING RLS POLICIES ===');
    const rlsResult = await client.query(`
      SELECT tablename, policyname 
      FROM pg_policies 
      WHERE schemaname = 'public'
      ORDER BY tablename, policyname
    `);
    console.log('RLS policies:', rlsResult.rows.length);
    for (const row of rlsResult.rows) {
      console.log(`  ${row.tablename}: ${row.policyname}`);
    }

    // Check indexes
    console.log('\n=== CHECKING INDEXES ===');
    const indexesResult = await client.query(`
      SELECT indexname, tablename 
      FROM pg_indexes 
      WHERE schemaname = 'public' AND indexname LIKE 'idx_%'
      ORDER BY tablename, indexname
    `);
    console.log('Custom indexes:', indexesResult.rows.length);

    // Check triggers
    console.log('\n=== CHECKING TRIGGERS ===');
    const triggersResult = await client.query(`
      SELECT trigger_name, event_object_table 
      FROM information_schema.triggers 
      WHERE trigger_schema = 'public'
      ORDER BY event_object_table, trigger_name
    `);
    console.log('Triggers:', triggersResult.rows.length);

    // Check functions
    console.log('\n=== CHECKING FUNCTIONS ===');
    const functionsResult = await client.query(`
      SELECT routine_name 
      FROM information_schema.routines 
      WHERE routine_schema = 'public'
      ORDER BY routine_name
    `);
    console.log('Functions:', functionsResult.rows.map(r => r.routine_name).join(', '));

    // Check seed data
    console.log('\n=== CHECKING SEED DATA ===');
    const pkgCount = await client.query('SELECT COUNT(*) as count FROM packages');
    const tierCount = await client.query('SELECT COUNT(*) as count FROM package_tiers');
    const ruleCount = await client.query('SELECT COUNT(*) as count FROM package_rules');
    const roleCount = await client.query('SELECT COUNT(*) as count FROM roles');
    const permCount = await client.query('SELECT COUNT(*) as count FROM permissions');
    const settingsCount = await client.query('SELECT COUNT(*) as count FROM platform_settings');
    const questionsCount = await client.query('SELECT COUNT(*) as count FROM open_questions');

    console.log(`Packages: ${pkgCount.rows[0].count}`);
    console.log(`Package Tiers: ${tierCount.rows[0].count}`);
    console.log(`Package Rules: ${ruleCount.rows[0].count}`);
    console.log(`Roles: ${roleCount.rows[0].count}`);
    console.log(`Permissions: ${permCount.rows[0].count}`);
    console.log(`Platform Settings: ${settingsCount.rows[0].count}`);
    console.log(`Open Questions: ${questionsCount.rows[0].count}`);

    // Determine what needs to be applied
    console.log('\n=== ANALYSIS ===');
    const needsSchema = missingTables.length > 0;
    const needsSeed = pkgCount.rows[0].count === 0;
    
    console.log(`Schema needs application: ${needsSchema}`);
    console.log(`Seed data needs application: ${needsSeed}`);

    if (needsSchema) {
      console.log('\n=== APPLYING SCHEMA ===');
      const schemaSQL = readFileSync(join(dbDir, 'schema.sql'), 'utf8');
      await client.query(schemaSQL);
      console.log('✓ Schema applied successfully');
    }

    if (needsSeed) {
      console.log('\n=== APPLYING SEED DATA ===');
      const seedSQL = readFileSync(join(dbDir, 'seed.sql'), 'utf8');
      await client.query(seedSQL);
      console.log('✓ Seed data applied successfully');
    }

    // Final verification
    console.log('\n=== FINAL VERIFICATION ===');
    const finalPkgCount = await client.query('SELECT COUNT(*) as count FROM packages');
    const finalTierCount = await client.query('SELECT COUNT(*) as count FROM package_tiers');
    const finalRuleCount = await client.query('SELECT COUNT(*) as count FROM package_rules');
    const finalRoleCount = await client.query('SELECT COUNT(*) as count FROM roles');
    const finalPermCount = await client.query('SELECT COUNT(*) as count FROM permissions');
    const finalSettingsCount = await client.query('SELECT COUNT(*) as count FROM platform_settings');
    const finalQuestionsCount = await client.query('SELECT COUNT(*) as count FROM open_questions');

    console.log(`Packages: ${finalPkgCount.rows[0].count}`);
    console.log(`Package Tiers: ${finalTierCount.rows[0].count}`);
    console.log(`Package Rules: ${finalRuleCount.rows[0].count}`);
    console.log(`Roles: ${finalRoleCount.rows[0].count}`);
    console.log(`Permissions: ${finalPermCount.rows[0].count}`);
    console.log(`Platform Settings: ${finalSettingsCount.rows[0].count}`);
    console.log(`Open Questions: ${finalQuestionsCount.rows[0].count}`);

    console.log('\n✓ All checks completed successfully');

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
