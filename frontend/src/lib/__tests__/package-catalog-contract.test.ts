import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../../../../')

describe('package catalog foundation (migration contract)', () => {
  const sql = readFileSync(
    resolve(root, 'supabase/migrations/20260922220000_package_nesting_age_tiers.sql'),
    'utf-8',
  )

  it('seeds Mission of Mercy parent + three children at KES 500', () => {
    expect(sql).toContain("code = 'mission_of_mercy'")
    expect(sql).toContain("code = 'mission_children'")
    expect(sql).toContain("code = 'mission_widows'")
    expect(sql).toContain("code = 'mission_single_mothers'")
    expect(sql).toMatch(/500/)
  })

  it('converts Welfare Individual into age bands 0-79 / 80+', () => {
    expect(sql).toContain('Age 0-79')
    expect(sql).toContain('Age 80+')
    expect(sql).toContain('min_age = 0')
    expect(sql).toContain('max_age = 79')
    // Age 80+ INSERT lists min_age/max_age columns and seeds 80 / unbounded
    expect(sql).toContain('min_age, max_age, is_active')
    expect(sql).toContain('2, 80, NULL, true')
  })
})
