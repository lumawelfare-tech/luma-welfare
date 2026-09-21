import { describe, it, expect } from 'vitest'
import { scrubPiiText } from '../sentry'

describe('Sentry PII scrubbing', () => {
  it('redacts Kenyan phone numbers and bearer tokens', () => {
    expect(scrubPiiText('call 0712345678 now')).toContain('[REDACTED]')
    expect(scrubPiiText('Authorization Bearer abc.def.ghi')).toContain('Bearer [REDACTED]')
  })

  it('leaves safe operational text intact', () => {
    expect(scrubPiiText('member profile update failed')).toBe('member profile update failed')
  })
})
