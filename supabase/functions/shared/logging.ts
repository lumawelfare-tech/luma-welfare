/**
 * LUMA WELFARE — PHASE 6: STRUCTURED LOGGING & ERROR TAXONOMY
 *
 * Features:
 * - Request correlation IDs for tracing across components
 * - Structured JSON logging with safe metadata
 * - Error taxonomy with consistent codes
 * - Safe user-facing error messages
 * - Sensitive data redaction
 *
 * No external dependencies. No sensitive data logged.
 */

// ============================================================================
// TYPES
// ============================================================================

export type ErrorCode =
  | 'AUTH_ERROR'
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'RATE_LIMITED'
  | 'PAYMENT_ERROR'
  | 'DATABASE_ERROR'
  | 'STORAGE_ERROR'
  | 'EXTERNAL_SERVICE_ERROR'
  | 'INTERNAL_ERROR'

interface StructuredLogEntry {
  timestamp: string
  level: 'info' | 'warn' | 'error'
  service: string
  function: string
  request_id?: string
  user_id?: string
  admin_id?: string
  operation: string
  duration_ms?: number
  status?: string
  error_code?: ErrorCode
  error_message?: string
  meta?: Record<string, unknown>
}

// ============================================================================
// REQUEST CORRELATION
// ============================================================================

/**
 * Generate a unique request ID for tracing.
 * Format: req_{timestamp}_{random}
 */
export function generateRequestId(): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).slice(2, 8)
  return `req_${timestamp}_${random}`
}

/**
 * Extract request ID from headers or generate a new one.
 */
export function getRequestId(req: Request): string {
  return req.headers.get('X-Request-ID')
    ?? req.headers.get('x-request-id')
    ?? generateRequestId()
}

// ============================================================================
// STRUCTURED LOGGING
// ============================================================================

const SENSITIVE_FIELDS = [
  'password', 'token', 'secret', 'key', 'authorization',
  'cookie', 'access_token', 'refresh_token', 'service_role',
  'mpesa_consumer_key', 'mpesa_consumer_secret', 'mpesa_passkey',
  'otp', 'two_factor_secret', 'two_factor_recovery_codes',
]

/**
 * Redact sensitive fields from an object.
 */
function redactSensitive(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_FIELDS.some(f => key.toLowerCase().includes(f))) {
      result[key] = '[REDACTED]'
    } else if (typeof value === 'object' && value !== null) {
      result[key] = '[object]'
    } else {
      result[key] = value
    }
  }
  return result
}

/**
 * Log a structured entry.
 */
export function structuredLog(entry: StructuredLogEntry): void {
  const logEntry = {
    ...entry,
    meta: entry.meta ? redactSensitive(entry.meta) : undefined,
  }
  console.log(JSON.stringify(logEntry))
}

/**
 * Log an info event.
 */
export function logInfo(
  service: string,
  fn: string,
  requestId: string,
  operation: string,
  meta?: Record<string, unknown>,
): void {
  structuredLog({
    timestamp: new Date().toISOString(),
    level: 'info',
    service,
    function: fn,
    request_id: requestId,
    operation,
    meta,
  })
}

/**
 * Log a warning event.
 */
export function logWarn(
  service: string,
  fn: string,
  requestId: string,
  operation: string,
  meta?: Record<string, unknown>,
): void {
  structuredLog({
    timestamp: new Date().toISOString(),
    level: 'warn',
    service,
    function: fn,
    request_id: requestId,
    operation,
    meta,
  })
}

/**
 * Log an error event.
 */
export function logError(
  service: string,
  fn: string,
  requestId: string,
  operation: string,
  errorCode: ErrorCode,
  errorMessage: string,
  meta?: Record<string, unknown>,
): void {
  structuredLog({
    timestamp: new Date().toISOString(),
    level: 'error',
    service,
    function: fn,
    request_id: requestId,
    operation,
    error_code: errorCode,
    error_message: errorMessage,
    meta,
  })
}

// ============================================================================
// ERROR TAXONOMY
// ============================================================================

/**
 * Create a structured error with code and safe user message.
 */
export class AppError extends Error {
  code: ErrorCode
  statusCode: number
  userMessage: string
  requestId?: string

  constructor(
    code: ErrorCode,
    message: string,
    userMessage: string,
    statusCode: number = 500,
    requestId?: string,
  ) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.statusCode = statusCode
    this.userMessage = userMessage
    this.requestId = requestId
  }
}

// ============================================================================
// SAFE USER-FACING ERROR MESSAGES
// ============================================================================

const USER_MESSAGES: Record<ErrorCode, string> = {
  AUTH_ERROR: 'Please log in again to continue.',
  VALIDATION_ERROR: 'Please check your input and try again.',
  NOT_FOUND: 'The requested resource was not found.',
  FORBIDDEN: 'You do not have permission to perform this action.',
  RATE_LIMITED: 'Too many requests. Please wait a moment and try again.',
  PAYMENT_ERROR: 'We could not process your payment. Please check your payment status before trying again.',
  DATABASE_ERROR: 'We are having trouble processing this request. Please try again shortly.',
  STORAGE_ERROR: 'File upload failed. Please try again.',
  EXTERNAL_SERVICE_ERROR: 'A required service is temporarily unavailable. Please try again later.',
  INTERNAL_ERROR: 'An unexpected error occurred. Please try again.',
}

/**
 * Get a safe user-facing error message for an error code.
 */
export function getUserErrorMessage(code: ErrorCode): string {
  return USER_MESSAGES[code] ?? USER_MESSAGES.INTERNAL_ERROR
}

/**
 * Create an error response with safe user message.
 * Does NOT expose internal details.
 */
export function errorResponse(
  code: ErrorCode,
  statusCode: number,
  requestId?: string,
  internalMessage?: string,
): Response {
  return new Response(
    JSON.stringify({
      message: getUserErrorMessage(code),
      code,
      request_id: requestId,
    }),
    {
      status: statusCode,
      headers: {
        'Content-Type': 'application/json',
        ...(requestId ? { 'X-Request-ID': requestId } : {}),
      },
    },
  )
}

// ============================================================================
// REQUEST HANDLER WRAPPER
// ============================================================================

/**
 * Wrap an Edge Function handler with structured logging and error handling.
 *
 * Usage:
 *   import { withLogging } from '../shared/logging.ts'
 *
 *   Deno.serve(withLogging('my-function', async (req) => { ... }))
 */
export function withLogging(
  functionName: string,
  handler: (req: Request, requestId: string) => Promise<Response>,
): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    const requestId = getRequestId(req)
    const startTime = performance.now()
    const method = req.method

    try {
      const response = await handler(req, requestId)
      const durationMs = performance.now() - startTime

      // Log successful request
      logInfo(functionName, functionName, requestId, `${method} completed`, {
        status: response.status,
        duration_ms: Math.round(durationMs),
      })

      // Add correlation ID to response
      const newHeaders = new Headers(response.headers)
      newHeaders.set('X-Request-ID', requestId)
      newHeaders.set('X-Response-Time', `${Math.round(durationMs)}ms`)

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
      })
    } catch (err) {
      const durationMs = performance.now() - startTime

      if (err instanceof AppError) {
        logError(functionName, functionName, requestId, `${method} failed`, err.code, err.message, {
          status_code: err.statusCode,
          duration_ms: Math.round(durationMs),
        })

        const response = errorResponse(err.code, err.statusCode, requestId, err.message)
        const newHeaders = new Headers(response.headers)
        newHeaders.set('X-Request-ID', requestId)
        return new Response(response.body, { status: response.status, headers: newHeaders })
      }

      // Unexpected error
      logError(functionName, functionName, requestId, `${method} failed`, 'INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', {
        status_code: 500,
        duration_ms: Math.round(durationMs),
      })

      return errorResponse('INTERNAL_ERROR', 500, requestId)
    }
  }
}
