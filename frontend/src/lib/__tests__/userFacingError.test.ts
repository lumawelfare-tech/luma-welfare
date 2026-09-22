import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ApiError } from '../api'

vi.mock('../sentry', () => ({
  scrubPiiText: (v: string) => v.replace(/\b07\d{8}\b/g, '[REDACTED]'),
  captureError: vi.fn(),
}))

import { userFacingMessage, reportLoadError } from '../userFacingError'
import { captureError } from '../sentry'

describe('userFacingMessage', () => {
  it('maps network ApiError to connection copy', () => {
    expect(userFacingMessage(new ApiError(0, 'x', 'NETWORK'))).toMatch(/connection/i)
  })

  it('hides 5xx ApiError details behind fallback', () => {
    expect(
      userFacingMessage(new ApiError(500, 'relation members does not exist', 'ERROR'), 'Could not load.'),
    ).toBe('Could not load.')
  })

  it('keeps scrubbed 4xx ApiError messages', () => {
    expect(userFacingMessage(new ApiError(400, 'Name is required', 'VALIDATION_ERROR'))).toBe(
      'Name is required',
    )
  })

  it('scrubs phone-like PII in ApiError messages', () => {
    expect(userFacingMessage(new ApiError(400, 'Phone 0712345678 invalid', 'VALIDATION_ERROR'))).toContain(
      '[REDACTED]',
    )
  })

  it('never surfaces raw Error.message', () => {
    expect(userFacingMessage(new Error('SELECT * FROM secrets'), 'Safe')).toBe('Safe')
  })

  it('maps fetch failures to connection copy', () => {
    expect(userFacingMessage(new Error('Failed to fetch'))).toMatch(/connection/i)
  })
})

describe('reportLoadError', () => {
  beforeEach(() => {
    vi.mocked(captureError).mockClear()
  })

  it('does not report expected 4xx ApiErrors', () => {
    const msg = reportLoadError(new ApiError(404, 'Not found', 'NOT_FOUND'), { page: 'test' }, 'Nope')
    expect(msg).toBe('Not found')
    expect(captureError).not.toHaveBeenCalled()
  })

  it('reports 5xx and returns fallback', () => {
    const msg = reportLoadError(new ApiError(503, 'upstream boom', 'ERROR'), { page: 'test' }, 'Load failed')
    expect(msg).toBe('Load failed')
    expect(captureError).toHaveBeenCalled()
  })

  it('reports unknown Errors', () => {
    reportLoadError(new Error('boom'), { page: 'x' })
    expect(captureError).toHaveBeenCalled()
  })
})
