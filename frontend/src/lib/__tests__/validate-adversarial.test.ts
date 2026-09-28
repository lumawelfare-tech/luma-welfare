/**
 * Adversarial input tests for the shared Edge Function body parsers.
 *
 * Covers invalid / missing / malformed input, duplicate records, privilege
 * escalation, IDOR-shaped payloads, and the numeric bounds that back DB
 * constraints (length caps, UUID shape, money range, national ID shape).
 */
import { describe, it, expect } from 'vitest'
import {
  ValidationError,
  parseUuid,
  parseStaffRoleName,
  parseManageUserRoleBody,
  parseDeleteMemberBody,
  parseImportMemberRow,
  parseRevealMemberIdInput,
  parseVerifyEmailBody,
  parseFamilyMemberBody,
  parseMemberProfilePatchBody,
  parseOptionalMoneyAmount,
  parseRequiredMoneyAmount,
  parseOptionalKraPin,
  parseKenyanNationalId,
  normalizeKenyanPhone,
  SUPERADMIN_GRANT_CONFIRM,
  MAX_MONEY_AMOUNT_KES,
} from '../../../../supabase/functions/shared/validate.ts'

const UUID_A = '3f1d2a4c-9b87-4e21-8c65-1a2b3c4d5e6f'
const UUID_B = '7c9e6679-7425-40de-944b-e07fc1f90ae7'
const VALID_PHONE = '0712345678'

function expectValidationError(fn: () => unknown, matcher?: RegExp) {
  let thrown: unknown
  try {
    fn()
  } catch (e) {
    thrown = e
  }
  expect(thrown, 'expected a ValidationError to be thrown').toBeInstanceOf(ValidationError)
  if (matcher) expect((thrown as Error).message).toMatch(matcher)
}

// ─── Malformed request bodies ────────────────────────────────

describe('malformed request bodies', () => {
  const rejectors: Array<[string, (v: unknown) => unknown]> = [
    ['parseManageUserRoleBody', parseManageUserRoleBody],
    ['parseDeleteMemberBody', parseDeleteMemberBody],
    ['parseMemberProfilePatchBody', parseMemberProfilePatchBody],
    ['parseVerifyEmailBody', (v) => parseVerifyEmailBody(v, null)],
  ]

  for (const [name, fn] of rejectors) {
    it(`${name} rejects null, arrays, primitives and missing bodies`, () => {
      expectValidationError(() => fn(null), /Invalid request body/)
      expectValidationError(() => fn(undefined), /Invalid request body/)
      expectValidationError(() => fn([]), /Invalid request body/)
      expectValidationError(() => fn([1, 2, 3]), /Invalid request body/)
      expectValidationError(() => fn('a string'), /Invalid request body/)
      expectValidationError(() => fn(42), /Invalid request body/)
      expectValidationError(() => fn(true), /Invalid request body/)
    })
  }
})

// ─── parseUuid ───────────────────────────────────────────────

describe('parseUuid', () => {
  it('accepts a canonical UUID and trims whitespace', () => {
    expect(parseUuid(`  ${UUID_A}  `)).toBe(UUID_A)
    expect(parseUuid(UUID_A.toUpperCase())).toBe(UUID_A.toUpperCase())
  })

  it('rejects missing / non-string input', () => {
    expectValidationError(() => parseUuid(undefined), /valid id is required/)
    expectValidationError(() => parseUuid(null), /valid id is required/)
    expectValidationError(() => parseUuid(''), /valid id is required/)
    expectValidationError(() => parseUuid('   '), /valid id is required/)
    expectValidationError(() => parseUuid(12345), /valid id is required/)
    expectValidationError(() => parseUuid({}), /valid id is required/)
  })

  it('rejects malformed and hostile identifiers', () => {
    const bad = [
      'not-a-uuid',
      '3f1d2a4c9b874e218c651a2b3c4d5e6f',
      '3f1d2a4c-9b87-4e21-8c65-1a2b3c4d5e6f-extra',
      "' OR '1'='1",
      '../../etc/passwd',
      '<script>alert(1)</script>',
      '00000000-0000-0000-0000-000000000000',
    ]
    for (const v of bad) {
      expectValidationError(() => parseUuid(v), undefined)
    }
  })

  it('rejects an invalid RFC-4122 variant nibble', () => {
    expectValidationError(() => parseUuid('00000000-0000-4000-4000-000000000000'))
  })
})

// ─── parseStaffRoleName ──────────────────────────────────────

describe('parseStaffRoleName', () => {
  it('accepts every documented staff role, case-insensitively', () => {
    for (const role of ['superadmin', 'admin', 'finance', 'claims_reviewer', 'support']) {
      expect(parseStaffRoleName(role)).toBe(role)
      expect(parseStaffRoleName(`  ${role.toUpperCase()}  `)).toBe(role)
    }
  })

  it('rejects unknown, missing and injection-shaped roles', () => {
    for (const bad of ['root', 'owner', 'superuser', 'admin,finance', '', '   ', null, undefined, 5]) {
      expectValidationError(() => parseStaffRoleName(bad), /Role is required|Invalid role/)
    }
  })
})

// ─── Privilege escalation ────────────────────────────────────

describe('privilege escalation guards', () => {
  it('requires the exact GRANT SUPERADMIN confirmation phrase', () => {
    expectValidationError(
      () => parseManageUserRoleBody({ action: 'grant', targetId: UUID_A, roleName: 'superadmin' }),
      /typing GRANT SUPERADMIN exactly/,
    )
    expectValidationError(
      () => parseManageUserRoleBody({
        action: 'grant',
        targetId: UUID_A,
        roleName: 'superadmin',
        confirmSuperadmin: 'grant superadmin',
      }),
      /typing GRANT SUPERADMIN exactly/,
    )
    expectValidationError(
      () => parseManageUserRoleBody({
        action: 'grant',
        targetId: UUID_A,
        roleName: 'superadmin',
        confirmSuperadmin: `${SUPERADMIN_GRANT_CONFIRM} now`,
      }),
    )
    expectValidationError(
      () => parseManageUserRoleBody({
        action: 'grant',
        targetId: UUID_A,
        roleName: 'superadmin',
        confirmSuperadmin: ` ${SUPERADMIN_GRANT_CONFIRM.toLowerCase()}`,
      }),
    )
  })

  it('tolerates surrounding whitespace on the confirmation phrase', () => {
    const r = parseManageUserRoleBody({
      action: 'grant',
      targetId: UUID_A,
      roleName: 'superadmin',
      confirmSuperadmin: `  ${SUPERADMIN_GRANT_CONFIRM}\n`,
    })
    expect(r.roleName).toBe('superadmin')
  })

  it('accepts a correctly confirmed superadmin grant', () => {
    const r = parseManageUserRoleBody({
      action: 'grant',
      targetId: UUID_A,
      roleName: 'superadmin',
      confirmSuperadmin: SUPERADMIN_GRANT_CONFIRM,
    })
    expect(r).toMatchObject({ action: 'grant', targetId: UUID_A, roleName: 'superadmin' })
  })

  it('requires confirmation for change_role to superadmin too', () => {
    expectValidationError(() =>
      parseManageUserRoleBody({ action: 'change_role', target_id: UUID_A, role_name: 'superadmin' }),
    )
    const ok = parseManageUserRoleBody({
      action: 'change_role',
      target_id: UUID_A,
      role_name: 'superadmin',
      confirm_superadmin: SUPERADMIN_GRANT_CONFIRM,
    })
    expect(ok.roleName).toBe('superadmin')
  })

  it('rejects an unknown role on grant/change_role', () => {
    expectValidationError(() =>
      parseManageUserRoleBody({ action: 'grant', targetId: UUID_A, roleName: 'godmode' }),
      /Invalid role/,
    )
  })

  it('rejects unknown actions', () => {
    for (const action of ['promote', 'delete', 'grant_all', '', 'admin', 'escalate']) {
      expectValidationError(
        () => parseManageUserRoleBody({ action, targetId: UUID_A }),
        /Invalid action/,
      )
    }
  })

  it('rejects revoke payloads that smuggle a role', () => {
    const r = parseManageUserRoleBody({ action: 'revoke', targetId: UUID_A, roleName: 'superadmin' })
    expect(r.roleName).toBeUndefined()
  })

  it('caps the audit reason at 500 characters', () => {
    const r = parseManageUserRoleBody({ action: 'revoke', targetId: UUID_A, reason: 'x'.repeat(900) })
    expect(r.reason).toHaveLength(500)
  })

  it('rejects a non-string reason', () => {
    expectValidationError(
      () => parseManageUserRoleBody({ action: 'revoke', targetId: UUID_A, reason: 42 }),
      /Reason must be a string/,
    )
  })

  it('drops an empty reason to undefined', () => {
    const r = parseManageUserRoleBody({ action: 'revoke', targetId: UUID_A, reason: '   ' })
    expect(r.reason).toBeUndefined()
  })
})

// ─── Bulk delete (duplicate + limit constraints) ─────────────

describe('parseDeleteMemberBody', () => {
  it('deduplicates repeated ids', () => {
    expect(parseDeleteMemberBody({ memberIds: [UUID_A, UUID_A, UUID_B] }).memberIds).toEqual([
      UUID_A,
      UUID_B,
    ])
  })

  it('merges a single id with a list', () => {
    expect(parseDeleteMemberBody({ memberId: UUID_A, memberIds: [UUID_B] }).memberIds).toEqual([
      UUID_A,
      UUID_B,
    ])
  })

  it('enforces the 25-member cap', () => {
    const ids = Array.from({ length: 26 }, (_, i) =>
      `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    )
    expectValidationError(() => parseDeleteMemberBody({ memberIds: ids }), /Maximum 25/)
  })

  it('allows exactly 25 members', () => {
    const ids = Array.from({ length: 25 }, (_, i) =>
      `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    )
    expect(parseDeleteMemberBody({ memberIds: ids }).memberIds).toHaveLength(25)
  })

  it('rejects a non-UUID anywhere in the list', () => {
    expectValidationError(
      () => parseDeleteMemberBody({ memberIds: [UUID_A, 'drop table members'] }),
      /Each member id must be a valid UUID/,
    )
    expectValidationError(
      () => parseDeleteMemberBody({ memberIds: [UUID_A, 42] }),
      /Each member id must be a valid UUID/,
    )
    expectValidationError(
      () => parseDeleteMemberBody({ memberIds: [UUID_A, null] }),
      /Each member id must be a valid UUID/,
    )
  })

  it('rejects an empty payload and a payload that is only invalid ids', () => {
    expectValidationError(() => parseDeleteMemberBody({}), /At least one member_id/)
    expectValidationError(() => parseDeleteMemberBody({ memberIds: [] }), /At least one member_id/)
    expectValidationError(
      () => parseDeleteMemberBody({ memberIds: ['nope'] }),
      /At least one member_id|valid UUID/,
    )
  })
})

// ─── IDOR / BOLA shaped input ────────────────────────────────

describe('parseRevealMemberIdInput', () => {
  it('accepts a UUID from the query string', () => {
    expect(parseRevealMemberIdInput(null, UUID_A)).toEqual({ memberId: UUID_A })
  })

  it('accepts camelCase and snake_case from the body', () => {
    expect(parseRevealMemberIdInput({ memberId: UUID_A }, null)).toEqual({ memberId: UUID_A })
    expect(parseRevealMemberIdInput({ member_id: UUID_B }, '')).toEqual({ memberId: UUID_B })
  })

  it('prefers a valid query id over a body id', () => {
    expect(parseRevealMemberIdInput({ memberId: UUID_B }, UUID_A)).toEqual({ memberId: UUID_A })
  })

  it('rejects an absent, non-UUID, or foreign identifier', () => {
    for (const q of [null, undefined, '', '   ', 'not-a-uuid', '1']) {
      expectValidationError(() => parseRevealMemberIdInput(null, q), /Valid member_id is required/)
    }
    expectValidationError(() => parseRevealMemberIdInput({ memberId: '../../etc' }, null))
    expectValidationError(() => parseRevealMemberIdInput({ memberId: 123 }, null))
    expectValidationError(() => parseRevealMemberIdInput([], null))
    expectValidationError(() => parseRevealMemberIdInput(null, null))
  })
})

// ─── Email verification ──────────────────────────────────────

describe('parseVerifyEmailBody', () => {
  it('accepts a valid 6-digit verify action', () => {
    expect(parseVerifyEmailBody({ email: 'A@B.co', code: '123456' }, null)).toEqual({
      action: 'verify',
      email: 'a@b.co',
      code: '123456',
    })
  })

  it('strips whitespace inside the code', () => {
    expect(parseVerifyEmailBody({ email: 'a@b.co', code: ' 123 456 ' }, null)).toMatchObject({
      code: '123456',
    })
  })

  it('accepts the resend action without a code', () => {
    expect(parseVerifyEmailBody({ action: 'resend', email: 'a@b.co' }, null)).toEqual({
      action: 'resend',
      email: 'a@b.co',
    })
  })

  it('falls back to the action query parameter', () => {
    expect(parseVerifyEmailBody({ email: 'a@b.co' }, 'resend')).toMatchObject({ action: 'resend' })
    expect(parseVerifyEmailBody({ email: 'a@b.co', code: '123456' }, 'verify')).toMatchObject({
      action: 'verify',
      code: '123456',
    })
    expect(parseVerifyEmailBody({ email: 'a@b.co', code: '123456' }, null)).toMatchObject({
      action: 'verify',
    })
  })

  it('rejects unknown actions', () => {
    for (const action of ['delete', 'reset', 'VERIFY_ALL', '', 'admin']) {
      if (action === '') continue
      expectValidationError(() => parseVerifyEmailBody({ email: 'a@b.co', action }, null), /Invalid action/)
    }
  })

  it('rejects malformed codes', () => {
    for (const code of ['', '12345', '1234567', 'abcdef', '12ab56', null, undefined, 123456]) {
      expectValidationError(
        () => parseVerifyEmailBody({ email: 'a@b.co', code }, null),
        /6-digit verification code/,
      )
    }
  })

  it('rejects a missing or invalid email', () => {
    expectValidationError(() => parseVerifyEmailBody({ code: '123456' }, null), /Email is required/)
    expectValidationError(
      () => parseVerifyEmailBody({ email: 'nope', code: '123456' }, null),
      /valid email address/,
    )
  })
})

// ─── CSV import rows ─────────────────────────────────────────

describe('parseImportMemberRow', () => {
  const good = {
    email: '  Jane.Doe@Example.COM ',
    full_name: '  Jane Doe  ',
    phone: '+254712345678',
    id_number: '12345678',
  }

  it('normalises a valid row', () => {
    expect(parseImportMemberRow(good, 'Row 2')).toEqual({
      email: 'jane.doe@example.com',
      fullName: 'Jane Doe',
      phone: VALID_PHONE,
      idNumber: '12345678',
    })
  })

  it('accepts camelCase keys and a missing ID', () => {
    expect(
      parseImportMemberRow({ email: 'a@b.co', fullName: 'A B', phone: '0712345678' }),
    ).toEqual({ email: 'a@b.co', fullName: 'A B', phone: VALID_PHONE, idNumber: null })
  })

  it('rejects non-object rows and missing fields with the row label', () => {
    expectValidationError(() => parseImportMemberRow(null, 'Row 4'), /Row 4: invalid row object/)
    expectValidationError(() => parseImportMemberRow([], 'Row 4'), /Row 4: invalid row object/)
    expectValidationError(() => parseImportMemberRow('x', 'Row 4'), /Row 4: invalid row object/)
    expectValidationError(() => parseImportMemberRow({}, 'Row 7'), /Row 7: email is required/)
    expectValidationError(
      () => parseImportMemberRow({ email: 'a@b.co' }, 'Row 7'),
      /Row 7: full name is required/,
    )
    expectValidationError(
      () => parseImportMemberRow({ email: 'a@b.co', fullName: 'A' }, 'Row 7'),
      /Row 7: phone is required/,
    )
  })

  it('rejects invalid emails, phones and national IDs', () => {
    expectValidationError(
      () => parseImportMemberRow({ ...good, email: 'nope' }, 'Row 3'),
      /valid email address/,
    )
    expectValidationError(
      () => parseImportMemberRow({ ...good, email: `${'a'.repeat(250)}@b.co` }, 'Row 3'),
      /valid email address/,
    )
    expectValidationError(
      () => parseImportMemberRow({ ...good, phone: '12345' }, 'Row 3'),
      /valid Kenyan phone number/,
    )
    expectValidationError(
      () => parseImportMemberRow({ ...good, id_number: 'ABC123' }, 'Row 3'),
      /valid Kenyan National ID/,
    )
    expectValidationError(
      () => parseImportMemberRow({ ...good, id_number: 12345678 }, 'Row 3'),
      /ID number must be a string/,
    )
  })

  it('rejects an over-long full name (DB varchar cap)', () => {
    expectValidationError(
      () => parseImportMemberRow({ ...good, full_name: 'x'.repeat(121) }, 'Row 9'),
      /full name is too long/,
    )
  })
})

// ─── Family members ──────────────────────────────────────────

describe('parseFamilyMemberBody', () => {
  const good = {
    fullName: 'Mary Wanjiku',
    relationship: 'spouse',
    tier: 'nuclear',
    idNumber: '12345678',
    dateOfBirth: '1990-01-01',
    phone: '0712345678',
    beneficiaryStatus: 'active',
  }

  it('accepts a valid member and normalises casing', () => {
    expect(parseFamilyMemberBody({ ...good, relationship: 'SPouse', tier: 'NUCLEAR' })).toMatchObject({
      relationship: 'spouse',
      tier: 'nuclear',
    })
  })

  it('accepts snake_case keys', () => {
    expect(
      parseFamilyMemberBody({
        full_name: 'Mary Wanjiku',
        relationship: 'child',
        tier: 'extended',
        id_number: '12345678',
        date_of_birth: '2010-05-05',
        beneficiary_status: 'pending',
      }),
    ).toMatchObject({ idNumber: '12345678', dateOfBirth: '2010-05-05', beneficiaryStatus: 'pending' })
  })

  it('rejects invalid enums and missing names', () => {
    expectValidationError(() => parseFamilyMemberBody({ ...good, relationship: 'boss' }), /Relationship/)
    expectValidationError(() => parseFamilyMemberBody({ ...good, tier: 'vip' }), /Cover tier/)
    expectValidationError(() => parseFamilyMemberBody({ ...good, beneficiaryStatus: 'dead' }), /beneficiary status/)
    expectValidationError(() => parseFamilyMemberBody({ ...good, fullName: '  ' }), /Full name is required/)
    expectValidationError(() => parseFamilyMemberBody({}), /Full name is required/)
    expectValidationError(() => parseFamilyMemberBody(null), /Invalid family member/)
    expectValidationError(() => parseFamilyMemberBody([]), /Invalid family member/)
  })

  it('rejects malformed dates, phones and IDs', () => {
    expectValidationError(() => parseFamilyMemberBody({ ...good, dateOfBirth: '01/01/1990' }), /YYYY-MM-DD/)
    expectValidationError(() => parseFamilyMemberBody({ ...good, phone: '555-1234' }), /valid Kenyan phone/)
    expectValidationError(() => parseFamilyMemberBody({ ...good, idNumber: 'XYZ' }), /valid Kenyan National ID/)
  })
})

// ─── Profile patch ───────────────────────────────────────────

describe('parseMemberProfilePatchBody', () => {
  const good = {
    fullName: 'Jane Doe',
    phone: '0712345678',
    idNumber: '12345678',
    altPhone: '',
  }

  it('accepts a minimal valid patch', () => {
    expect(parseMemberProfilePatchBody(good)).toMatchObject({
      fullName: 'Jane Doe',
      phone: VALID_PHONE,
      idNumber: '12345678',
      altPhone: null,
    })
  })

  it('normalises phone numbers and KRA PINs', () => {
    const r = parseMemberProfilePatchBody({
      ...good,
      phone: '+254712345678',
      altPhone: '254722000000',
      kraPin: ' a123456789x ',
    })
    expect(r.phone).toBe(VALID_PHONE)
    expect(r.altPhone).toBe('0722000000')
    expect(r.kraPin).toBe('A123456789X')
  })

  it('rejects missing / over-long / malformed core fields', () => {
    expectValidationError(() => parseMemberProfilePatchBody({ ...good, fullName: '' }), /Full name is required/)
    expectValidationError(() => parseMemberProfilePatchBody({ ...good, fullName: 'x'.repeat(121) }), /too long/)
    expectValidationError(() => parseMemberProfilePatchBody({ ...good, phone: '5551234' }), /valid Kenyan phone/)
    expectValidationError(() => parseMemberProfilePatchBody({ ...good, idNumber: '1' }), /valid Kenyan National ID/)
    expectValidationError(() => parseMemberProfilePatchBody({ ...good, idNumber: '' }), /ID number is required/)
  })

  it('rejects a non-string alternate phone and an invalid one', () => {
    expectValidationError(() => parseMemberProfilePatchBody({ ...good, altPhone: 123 }), /Alternate phone must be a string/)
    expectValidationError(() => parseMemberProfilePatchBody({ ...good, altPhone: 'not-a-phone' }), /alternate Kenyan phone/)
  })

  it('rejects an invalid KRA PIN and treats an empty one as null', () => {
    expectValidationError(() => parseMemberProfilePatchBody({ ...good, kraPin: '12345' }), /valid KRA PIN/)
    expectValidationError(() => parseMemberProfilePatchBody({ ...good, kraPin: 1234567890 }), /KRA PIN must be a string/)
    expect(parseMemberProfilePatchBody({ ...good, kraPin: '' }).kraPin).toBeUndefined()
  })

  it('caps optional text fields at 200 characters', () => {
    const r = parseMemberProfilePatchBody({ ...good, occupation: 'x'.repeat(400) })
    expect(r.occupation).toHaveLength(200)
  })

  it('rejects a non-string optional field', () => {
    expectValidationError(
      () => parseMemberProfilePatchBody({ ...good, county: 42 }),
      /county must be a string/,
    )
  })
})

// ─── Money bounds (back numeric DB constraints) ──────────────

describe('money bounds', () => {
  it('accepts bounded positive amounts', () => {
    expect(parseOptionalMoneyAmount('2500.50')).toBe(2500.5)
    expect(parseOptionalMoneyAmount(MAX_MONEY_AMOUNT_KES)).toBe(MAX_MONEY_AMOUNT_KES)
    expect(parseOptionalMoneyAmount('0.01')).toBe(0.01)
    expect(parseOptionalMoneyAmount('  40 ')).toBe(40)
  })

  it('treats null, undefined and blank as absent', () => {
    expect(parseOptionalMoneyAmount(null)).toBeNull()
    expect(parseOptionalMoneyAmount(undefined)).toBeNull()
    expect(parseOptionalMoneyAmount('')).toBeNull()
    expect(parseOptionalMoneyAmount('   ')).toBeNull()
    expectValidationError(() => parseRequiredMoneyAmount(null), /amount is required/)
  })

  it('rejects values that would violate range / type constraints', () => {
    const bad: unknown[] = [
      -1,
      0,
      NaN,
      Infinity,
      -Infinity,
      MAX_MONEY_AMOUNT_KES + 0.01,
      '1e7',
      '-5',
      '0',
      'abc',
      '12.345',
      '1,000',
      { amount: 10 },
      [100],
      true,
      '10000000.01',
    ]
    for (const v of bad) {
      expectValidationError(() => parseOptionalMoneyAmount(v), undefined)
    }
  })

  it('rejects sub-cent values that round to zero', () => {
    expectValidationError(() => parseOptionalMoneyAmount(0.001))
  })

  it('rounds half-cent precision to two decimals', () => {
    expect(parseOptionalMoneyAmount(10.999)).toBe(11)
  })
})

// ─── National ID / phone / KRA normalisation ─────────────────

describe('identity normalisation', () => {
  it('accepts 7-8 digit Kenyan national IDs only', () => {
    expect(parseKenyanNationalId('1234567')).toBe('1234567')
    expect(parseKenyanNationalId('12345678')).toBe('12345678')
    expect(parseKenyanNationalId(' 123 4567 ')).toBe('1234567')
    // Documented leniency: non-digits are stripped before the shape check.
    expect(parseKenyanNationalId('1234567A')).toBe('1234567')
    expectValidationError(() => parseKenyanNationalId('123456'), /7–8 digits/)
    expectValidationError(() => parseKenyanNationalId('123456789'), /7–8 digits/)
    expectValidationError(() => parseKenyanNationalId('ABC1234'), /7–8 digits/)
    expectValidationError(() => parseKenyanNationalId('abcdefghijkl'), /7–8 digits/)
    expectValidationError(() => parseKenyanNationalId(''), /required/)
    expectValidationError(() => parseKenyanNationalId(null), /required/)
    expectValidationError(() => parseKenyanNationalId(12345678), /required/)
  })

  it('normalises Kenyan phone formats to 0[17]XXXXXXXX', () => {
    expect(normalizeKenyanPhone('0712345678')).toBe('0712345678')
    expect(normalizeKenyanPhone('0112345678')).toBe('0112345678')
    expect(normalizeKenyanPhone('0712 345 678')).toBe('0712345678')
    expect(normalizeKenyanPhone('+254712345678')).toBe('0712345678')
    expect(normalizeKenyanPhone('254712345678')).toBe('0712345678')
    expect(normalizeKenyanPhone('712345678')).toBe('0712345678')
    expect(normalizeKenyanPhone('12345678')).toBe('12345678')
    expect(normalizeKenyanPhone('not a phone')).toBe('not a phone')
    expect(normalizeKenyanPhone('')).toBe('')
    expect(normalizeKenyanPhone(null as unknown as string)).toBe('')
  })

  it('normalises or rejects KRA PINs', () => {
    expect(parseOptionalKraPin(null)).toBeNull()
    expect(parseOptionalKraPin('')).toBeNull()
    expect(parseOptionalKraPin('   ')).toBeNull()
    expect(parseOptionalKraPin('a123456789x')).toBe('A123456789X')
    expect(parseOptionalKraPin('A 123456789 X')).toBe('A123456789X')
    expectValidationError(() => parseOptionalKraPin('12345'), /valid KRA PIN/)
    expectValidationError(() => parseOptionalKraPin('A123456789XY'), /valid KRA PIN/)
    expectValidationError(() => parseOptionalKraPin('1123456789X'), /valid KRA PIN/)
    expectValidationError(() => parseOptionalKraPin(42), /KRA PIN must be a string/)
  })
})
