import { describe, it, expect } from 'vitest'
import { decodeBase32, generateTotp } from '../../../../e2e/helpers/totp'

describe('E2E TOTP helper', () => {
  it('decodes RFC 6238 SHA-1 demo secret and matches a known counter', () => {
    // RFC 6238 Appendix B uses ASCII key "12345678901234567890"
    const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'
    expect(decodeBase32(secret).equals(Buffer.from('12345678901234567890'))).toBe(true)
    // T = 59 → 287082
    expect(generateTotp(secret, 59_000)).toBe('287082')
  })
})
