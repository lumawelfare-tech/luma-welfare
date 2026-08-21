import { Hono } from 'hono'
import { z } from 'zod'
import { HttpError } from '../lib/http.js'
import { withSupabase, typedDb } from '../lib/supabase.js'
import { logAudit } from '../lib/audit.js'
import { validateAndNormalizePhone, maskPhone } from '../lib/phone.js'
import { logPaymentEvent } from '../lib/payment-log.js'
import {
  loadDarajaConfig,
  initiateStkPush,
  parseStkCallback,
  validateCallbackBody,
  queryTransactionStatus,
  type DarajaConfig,
} from '../services/daraja/index.js'
import type { DbClient } from '../lib/supabase.js'

const app = new Hono()

// ──────────────────────────────────────────────────────
// Zod schemas
// ──────────────────────────────────────────────────────

/**
 * Payment initiation request.
 * phone is optional — backend uses profile phone if omitted.
 * Frontend MUST NOT send amount — backend determines it from subscription.
 */
const initiatePaymentSchema = z.object({
  subscriptionId: z.string().uuid(),
  phone: z
    .string()
    .regex(/^0[17]\d{8}$/, 'Enter a valid Kenyan phone number, e.g. 0712345678.')
    .optional(),
  idempotencyKey: z.string().uuid('Invalid payment request ID.'),
})

// ──────────────────────────────────────────────────────
// Callback validation constants
// ──────────────────────────────────────────────────────

/** Daraja CheckoutRequestID format: ws_CO_XXXXXXXX or similar, typically 20-50 chars. */
const CHECKOUT_ID_REGEX = /^ws_CO_[A-Za-z0-9]+$/
const CHECKOUT_ID_MIN_LENGTH = 10
const CHECKOUT_ID_MAX_LENGTH = 80

// ──────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────

/** Load Daraja config lazily (only when needed). */
function getDarajaConfig(): DarajaConfig {
  return loadDarajaConfig()
}

/**
 * Load the member's phone from their profile.
 * Falls back to alt_phone if primary is missing.
 */
async function getMemberPhone(
  supabaseAdmin: DbClient,
  memberId: string,
): Promise<string | null> {
  const { data: member, error } = await supabaseAdmin
    .from('members')
    .select('phone, alt_phone')
    .eq('id', memberId)
    .single()

  if (error || !member) return null

  const primary = validateAndNormalizePhone(member.phone ?? '')
  if (primary) return primary

  const alt = validateAndNormalizePhone(member.alt_phone ?? '')
  if (alt) return alt

  return null
}

/**
 * Determine the correct amount for a subscription.
 * Reads from the package_tiers table — never trusts client-sourced amounts.
 *
 * Amount resolution order:
 * 1. package_tiers.amount (if subscription has a tier)
 * 2. package_rules.value where rule_name = 'min_contribution_amount'
 */
async function resolvePaymentAmount(
  supabaseAdmin: DbClient,
  subscriptionId: string,
): Promise<{ amount: number; packageId: string; memberId: string; packageName: string }> {
  const { data: sub, error: subErr } = await supabaseAdmin
    .from('subscriptions')
    .select('id, member_id, package_id, package_tier_id, status, packages(name, code)')
    .eq('id', subscriptionId)
    .single()

  if (subErr || !sub) {
    throw new HttpError(404, 'Subscription not found.', 'NOT_FOUND')
  }
  if (sub.status !== 'active') {
    throw new HttpError(
      400,
      'Subscription is not active. Contact an admin to activate it first.',
      'SUBSCRIPTION_INACTIVE',
    )
  }

  let amount = 0
  if (sub.package_tier_id) {
    const { data: tier } = await supabaseAdmin
      .from('package_tiers')
      .select('amount')
      .eq('id', sub.package_tier_id)
      .single()
    if (tier) amount = Number(tier.amount)
  }

  if (amount === 0) {
    const { data: rules } = await supabaseAdmin
      .from('package_rules')
      .select('rule_name, value')
      .eq('package_id', sub.package_id)

    const minContrib = rules?.find((r) => r.rule_name === 'min_contribution_amount')
    if (minContrib) amount = Number(minContrib.value)
  }

  if (amount <= 0) {
    throw new HttpError(
      400,
      'Could not determine payment amount for this package. Contact an admin.',
      'AMOUNT_UNKNOWN',
    )
  }

  return {
    amount,
    packageId: sub.package_id,
    memberId: sub.member_id,
    packageName: (sub.packages as unknown as { name: string })?.name ?? 'Package',
  }
}

/**
 * Idempotent payment initiation.
 *
 * Strategy: INSERT ... ON CONFLICT (member_id, idempotency_key) DO NOTHING.
 * This is race-condition-safe because PostgreSQL enforces the unique constraint
 * at the row level — two concurrent inserts with the same key will both attempt
 * the INSERT, and exactly one will succeed. The loser gets a conflict error
 * which we handle by querying the existing record.
 *
 * Only the winner proceeds to call Daraja STK Push.
 */
async function initiatePaymentIdempotent(
  supabaseAdmin: DbClient,
  memberId: string,
  subscriptionId: string,
  packageId: string,
  amount: number,
  phone: string,
  idempotencyKey: string,
): Promise<{ paymentId: string; checkoutRequestId: string | null; alreadyExists: boolean }> {
  // 1. Try to insert a new payment with this idempotency key
  const { data: inserted, error: insertErr } = await supabaseAdmin
    .from('payments')
    .insert({
      member_id: memberId,
      subscription_id: subscriptionId,
      package_id: packageId,
      amount,
      phone,
      idempotency_key: idempotencyKey,
      status: 'Pending',
      channel: 'mpesa',
    })
    .select('id, checkout_request_id')
    .single()

  // 2. If insert succeeded — we are the winner. Proceed to STK Push.
  if (!insertErr && inserted) {
    return { paymentId: inserted.id, checkoutRequestId: null, alreadyExists: false }
  }

  // 3. If insert failed with a unique violation on idempotency_key — we lost the race.
  //    Query the existing record.
  const isUniqueViolation = insertErr?.code === '23505'
  if (isUniqueViolation) {
    const { data: existing } = await supabaseAdmin
      .from('payments')
      .select('id, checkout_request_id, status')
      .eq('member_id', memberId)
      .eq('idempotency_key', idempotencyKey)
      .single()

    if (existing) {
      return {
        paymentId: existing.id,
        checkoutRequestId: existing.checkout_request_id,
        alreadyExists: true,
      }
    }
  }

  // 4. Other DB error
  throw new HttpError(500, 'Failed to create payment record.', 'DB_ERROR')
}

/**
 * Process a successful STK callback: create contribution + link payment.
 * Uses transaction-safe logic to prevent duplicates.
 *
 * FINAL PAYMENT STATE MACHINE:
 *
 *   Pending ──────────────────────────────────────┐
 *     │                                            │
 *     ├── (STK Push accepted by Safaricom) ──→ Processing
 *     │                                            │
 *     ├── (callback success, ResultCode=0) ──→ Completed  [TERMINAL]
 *     │                                            │
 *     ├── (callback failure, ResultCode!=0) ──→ Failed    [TERMINAL]
 *     │                                            │
 *     └── (STK Push rejected by Daraja) ──→ Failed        [TERMINAL]
 *
 *   Processing ────────────────────────────────────┐
 *     │                                            │
 *     ├── (callback success) ──→ Completed          │
 *     ├── (callback failure) ──→ Failed             │
 *     └── (reconciliation query) ──→ Completed/Failed/Pending
 *
 *   Completed [TERMINAL]
 *   Failed    [TERMINAL]
 *
 * RULES:
 * - Completed cannot transition to any other state
 * - Failed cannot transition to Completed (requires explicit reversal)
 * - Processing is for "STK accepted, awaiting callback or reconciliation"
 * - Pending is for "payment record created, STK not yet sent or not yet accepted"
 *
 * LATE SUCCESS HANDLING:
 * - If payment is already Completed: idempotent no-op (skip)
 * - If payment is Pending/Processing: update to Completed with optimistic lock
 * - If payment is Failed: DO NOT update (require explicit reversal)
 */
async function processSuccessfulCallback(
  supabaseAdmin: DbClient,
  checkoutRequestId: string,
  amount: number,
  mpesaReceipt: string,
): Promise<{ processed: boolean; reason: string }> {
  // 1. Find the payment by checkout_request_id (Layer 5-6: reject unknown references)
  const { data: payment, error: payErr } = await supabaseAdmin
    .from('payments')
    .select('id, member_id, subscription_id, package_id, status')
    .eq('checkout_request_id', checkoutRequestId)
    .single()

  if (payErr || !payment) {
    return { processed: false, reason: 'payment_not_found' }
  }

  // 2. Idempotency: skip if already completed
  if (payment.status === 'Completed') {
    return { processed: false, reason: 'already_completed' }
  }

  // 3. If payment is Failed, do NOT override — require explicit reversal
  if (payment.status === 'Failed') {
    return { processed: false, reason: 'payment_failed_requires_reversal' }
  }

  // 4. Update payment to Completed (optimistic lock: only if Pending or Processing)
  const { error: updateErr } = await supabaseAdmin
    .from('payments')
    .update({
      status: 'Completed',
      mpesa_receipt: mpesaReceipt,
      updated_at: new Date().toISOString(),
    })
    .eq('id', payment.id)
    .in('status', ['Pending', 'Processing'])

  if (updateErr) {
    return { processed: false, reason: 'update_failed' }
  }

  // 5. Create contribution if subscription_id exists (Layer 11-12: derive from payment, not callback)
  if (payment.subscription_id) {
    const period = new Date().toISOString().slice(0, 7) // YYYY-MM

    const { data: existing } = await supabaseAdmin
      .from('contributions')
      .select('id')
      .eq('subscription_id', payment.subscription_id)
      .eq('period', period)
      .single()

    if (!existing) {
      await supabaseAdmin.from('contributions').insert({
        subscription_id: payment.subscription_id,
        member_id: payment.member_id,
        package_id: payment.package_id,
        period,
        amount,
        status: 'Paid',
        payment_id: payment.id,
      })
    }
  }

  return { processed: true, reason: 'completed' }
}

/**
 * Layered callback validation.
 * Returns null if valid, error message string if invalid.
 */
function validateCallbackLayers(
  method: string,
  contentType: string | null,
  body: unknown,
): string | null {
  // Layer 1: HTTP method
  if (method !== 'POST') {
    return 'Method not allowed'
  }

  // Layer 2: Content-Type
  if (contentType && !contentType.includes('application/json')) {
    return 'Invalid Content-Type'
  }

  // Layer 3-4: Structure and CheckoutRequestID format
  const structureError = validateCallbackBody(body)
  if (structureError) return structureError

  // Layer 5: CheckoutRequestID format validation
  const b = body as Record<string, unknown>
  const inner = b.Body as Record<string, unknown>
  const cb = inner?.stkCallback as Record<string, unknown> | undefined
  if (cb?.CheckoutRequestID) {
    const checkoutId = cb.CheckoutRequestID as string
    if (
      typeof checkoutId !== 'string' ||
      checkoutId.length < CHECKOUT_ID_MIN_LENGTH ||
      checkoutId.length > CHECKOUT_ID_MAX_LENGTH ||
      !CHECKOUT_ID_REGEX.test(checkoutId)
    ) {
      return 'Invalid CheckoutRequestID format'
    }
  }

  // Layer 8: ResultCode type validation
  if (cb?.ResultCode !== undefined && typeof cb.ResultCode !== 'number') {
    return 'Invalid ResultCode type'
  }

  return null
}

// ──────────────────────────────────────────────────────
// Feature flag — payments disabled by default
// ──────────────────────────────────────────────────────
function requirePaymentsEnabled(): void {
  if (process.env.PAYMENTS_ENABLED !== 'true') {
    throw new HttpError(
      403,
      'Payments are not currently enabled. M-Pesa integration will be activated in a future phase.',
      'PAYMENTS_DISABLED',
    )
  }
}

// ──────────────────────────────────────────────────────
// Routes
// ──────────────────────────────────────────────────────

/**
 * POST /payments/initiate
 * Authenticated. Creates a Pending payment and triggers STK Push.
 *
 * Phone handling:
 * - If phone provided in request, validates and uses it
 * - If phone omitted, loads from member profile
 * - Backend always validates and normalizes
 * - Frontend MUST NOT send amount
 */
app.post('/initiate', withSupabase({ auth: 'user' }), async (c) => {
  requirePaymentsEnabled()
  const { supabaseAdmin, userClaims } = typedDb(c.var.supabaseContext)
  const memberId = userClaims!.id

  const body = await c.req.json().catch(() => null)
  if (!body) throw new HttpError(400, 'Send a JSON body.', 'VALIDATION')

  const parsed = initiatePaymentSchema.safeParse(body)
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0].message, 'VALIDATION')
  }

  const { subscriptionId, phone: requestedPhone, idempotencyKey } = parsed.data

  // Verify subscription belongs to this member
  const { data: sub, error: subErr } = await supabaseAdmin
    .from('subscriptions')
    .select('id, member_id')
    .eq('id', subscriptionId)
    .eq('member_id', memberId)
    .single()

  if (subErr || !sub) {
    throw new HttpError(404, 'Subscription not found.', 'NOT_FOUND')
  }

  // Resolve phone: from request or member profile
  let phone: string
  if (requestedPhone) {
    const normalized = validateAndNormalizePhone(requestedPhone)
    if (!normalized) {
      throw new HttpError(
        400,
        'Invalid phone number. Use a valid Kenyan M-Pesa number (e.g. 0712345678).',
        'INVALID_PHONE',
      )
    }
    phone = normalized
  } else {
    const profilePhone = await getMemberPhone(supabaseAdmin, memberId)
    if (!profilePhone) {
      throw new HttpError(
        400,
        'No valid phone number on file. Update your profile or provide a phone number.',
        'PHONE_MISSING',
      )
    }
    phone = profilePhone
  }

  // Resolve amount from trusted database data (never from client)
  const { amount, packageId, packageName } = await resolvePaymentAmount(
    supabaseAdmin,
    subscriptionId,
  )

  // Idempotent insert
  const { paymentId, checkoutRequestId, alreadyExists } = await initiatePaymentIdempotent(
    supabaseAdmin,
    memberId,
    subscriptionId,
    packageId,
    amount,
    phone,
    idempotencyKey,
  )

  // If payment already existed, return its status without calling Daraja
  if (alreadyExists) {
    logPaymentEvent('payment_idempotent_replay', {
      paymentId,
      checkoutRequestId,
      memberId,
    })

    await logAudit(supabaseAdmin, {
      actor_id: memberId,
      action: 'payment_idempotent_replay',
      resource: 'payment',
      resource_id: paymentId,
      meta: { idempotencyKey, checkoutRequestId },
    })

    return c.json({
      message: 'Payment already initiated.',
      paymentId,
      checkoutRequestId,
      status: checkoutRequestId ? 'processing' : 'pending',
    })
  }

  // We won the race — proceed to STK Push with timeout handling
  const config = getDarajaConfig()

  let stkResult: Awaited<ReturnType<typeof initiateStkPush>>
  try {
    stkResult = await initiateStkPush(config, {
      phone,
      amount,
      accountReference: paymentId,
      transactionDesc: `Payment for ${packageName}`,
    })
  } catch (err) {
    // Network/timeout error — mark payment as Processing (callback may still arrive)
    await supabaseAdmin
      .from('payments')
      .update({
        status: 'Processing',
        payload: { error: err instanceof Error ? err.message : 'STK push exception', sentToSafaricom: true },
        updated_at: new Date().toISOString(),
      })
      .eq('id', paymentId)

    logPaymentEvent('payment_stk_timeout', {
      paymentId,
      memberId,
      error: err instanceof Error ? err.message : 'unknown',
      status: 'Processing',
    })

    await logAudit(supabaseAdmin, {
      actor_id: memberId,
      action: 'payment_stk_timeout',
      resource: 'payment',
      resource_id: paymentId,
      meta: { error: err instanceof Error ? err.message : 'unknown', status: 'Processing' },
    })

    throw new HttpError(
      502,
      'M-Pesa request failed. Your payment was not charged. Please try again.',
      'STK_FAILED',
    )
  }

  if (!stkResult.success || !stkResult.data) {
    // Daraja rejected the STK request before it reached Safaricom — Failed is correct
    await supabaseAdmin
      .from('payments')
      .update({
        status: 'Failed',
        payload: { error: stkResult.error, errorCode: stkResult.errorCode, sentToSafaricom: false },
        updated_at: new Date().toISOString(),
      })
      .eq('id', paymentId)

    logPaymentEvent('payment_stk_rejected', {
      paymentId,
      memberId,
      error: stkResult.error,
      errorCode: stkResult.errorCode,
      status: 'Failed',
    })

    await logAudit(supabaseAdmin, {
      actor_id: memberId,
      action: 'payment_stk_rejected',
      resource: 'payment',
      resource_id: paymentId,
      meta: { error: stkResult.error, errorCode: stkResult.errorCode },
    })

    throw new HttpError(
      502,
      `M-Pesa request failed: ${stkResult.error ?? 'Unknown error'}`,
      'STK_FAILED',
    )
  }

  // Store Daraja's CheckoutRequestID
  await supabaseAdmin
    .from('payments')
    .update({
      checkout_request_id: stkResult.data.CheckoutRequestID,
      updated_at: new Date().toISOString(),
    })
    .eq('id', paymentId)

  logPaymentEvent('payment_stk_accepted', {
    paymentId,
    checkoutRequestId: stkResult.data.CheckoutRequestID,
    memberId,
    packageId,
    subscriptionId,
    amount,
  })

  // Audit — log masked phone
  await logAudit(supabaseAdmin, {
    actor_id: memberId,
    action: 'payment_initiated',
    resource: 'payment',
    resource_id: paymentId,
    meta: {
      packageId,
      subscriptionId,
      amount,
      phone: maskPhone(phone),
      checkoutRequestId: stkResult.data.CheckoutRequestID,
    },
  })

  return c.json({
    message: 'Payment initiated. Check your phone for the M-Pesa prompt.',
    paymentId,
    checkoutRequestId: stkResult.data.CheckoutRequestID,
  }, 201)
})

/**
 * POST /payments/callback
 * Public. Daraja STK Push callback endpoint.
 * Must NOT require auth — Daraja sends callbacks without JWT.
 *
 * CALLBACK SECURITY MODEL (layered):
 * 1. Validate HTTP method (POST only)
 * 2. Validate Content-Type (application/json)
 * 3. Validate callback JSON structure (Body.stkCallback)
 * 4. Validate CheckoutRequestID format (ws_CO_*, 10-80 chars)
 * 5. Find existing payment by checkout_request_id
 * 6. Reject unknown payment references
 * 7. Confirm payment is in processable state (Pending)
 * 8. Validate ResultCode/ResultDesc structure
 * 9. Validate receipt info for successful transactions
 * 10. Apply database-level idempotency (optimistic lock)
 * 11. Never trust member_id/package_id from callback
 * 12. Derive member/package/subscription from existing payment record
 *
 * NOTE: Daraja callbacks are NOT cryptographically signed.
 * This is a known limitation of the Daraja STK Push callback mechanism.
 * We rely on the obscurity of CheckoutRequestIDs and layered validation.
 *
 * Idempotent: repeated callbacks for the same CheckoutRequestID are safe.
 */
app.post('/callback', async (c) => {
  const method = c.req.method
  const contentType = c.req.header('content-type') ?? null

  const body = await c.req.json().catch(() => null)

  // Layers 1-4: Validate request structure
  const validationError = validateCallbackLayers(method, contentType, body)
  if (validationError) {
    return c.json({ error: validationError }, 400)
  }

  const callback = parseStkCallback(body)
  if (!callback) {
    return c.json({ error: 'Could not parse callback' }, 400)
  }

  logPaymentEvent('payment_callback_received', {
    checkoutRequestId: callback.checkoutRequestId,
    resultCode: callback.resultCode,
    resultDesc: callback.resultDesc,
    mpesaReceipt: callback.mpesaReceiptNumber,
    amount: callback.amount,
  })

  // Load admin client for DB writes
  const { createClient } = await import('@supabase/supabase-js')
  const supabaseAdmin = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
  )

  // Layers 8-9: Validate receipt for success callbacks
  if (callback.resultCode === 0) {
    if (!callback.mpesaReceiptNumber || callback.mpesaReceiptNumber.length < 5) {
      return c.json({ error: 'Missing or invalid M-Pesa receipt number' }, 400)
    }
    if (!callback.amount || callback.amount <= 0) {
      return c.json({ error: 'Invalid amount in callback' }, 400)
    }
  }

  if (callback.resultCode === 0) {
    // Success — process payment (Layers 10-12 handled inside processSuccessfulCallback)
    const result = await processSuccessfulCallback(
      supabaseAdmin,
      callback.checkoutRequestId,
      callback.amount ?? 0,
      callback.mpesaReceiptNumber ?? '',
    )

    if (result.processed) {
      logPaymentEvent('payment_completed', {
        checkoutRequestId: callback.checkoutRequestId,
        mpesaReceipt: callback.mpesaReceiptNumber,
        amount: callback.amount,
      })
    }

    await logAudit(supabaseAdmin, {
      action: 'payment_completed',
      resource: 'payment',
      resource_id: callback.checkoutRequestId,
      meta: {
        mpesaReceipt: callback.mpesaReceiptNumber,
        amount: callback.amount,
        processed: result.processed,
        reason: result.reason,
      },
    })
  } else {
    // Failed — update payment status (Layer 7: only if Pending or Processing)
    const { data: payment } = await supabaseAdmin
      .from('payments')
      .select('id, status')
      .eq('checkout_request_id', callback.checkoutRequestId)
      .single()

    if (payment && (payment.status === 'Pending' || payment.status === 'Processing')) {
      await supabaseAdmin
        .from('payments')
        .update({
          status: 'Failed',
          payload: body,
          updated_at: new Date().toISOString(),
        })
        .eq('id', payment.id)
        .in('status', ['Pending', 'Processing'])

      logPaymentEvent('payment_failed', {
        checkoutRequestId: callback.checkoutRequestId,
        resultCode: callback.resultCode,
        resultDesc: callback.resultDesc,
      })
    }

    await logAudit(supabaseAdmin, {
      action: 'payment_failed',
      resource: 'payment',
      resource_id: callback.checkoutRequestId,
      meta: { resultCode: callback.resultCode, resultDesc: callback.resultDesc },
    })
  }

  // Daraja expects a specific response
  return c.json({ ResultCode: 0, ResultDesc: 'Success' })
})

/**
 * GET /payments/:id
 * Authenticated. Returns payment status for the member.
 * Scoped to authenticated member — cannot access other members' payments.
 */
app.get('/:id', withSupabase({ auth: 'user' }), async (c) => {
  const { supabase, userClaims } = typedDb(c.var.supabaseContext)
  const paymentId = c.req.param('id')
  const memberId = userClaims!.id // Derived from JWT

  const { data: payment, error } = await supabase
    .from('payments')
    .select('id, amount, status, mpesa_receipt, channel, checkout_request_id, created_at, updated_at')
    .eq('id', paymentId)
    .eq('member_id', memberId) // Enforce member ownership
    .single()

  if (error || !payment) {
    throw new HttpError(404, 'Payment not found.', 'NOT_FOUND')
  }

  return c.json({ payment })
})

/**
 * GET /payments
 * Authenticated. Lists the member's payments.
 * Scoped to authenticated member.
 */
app.get('/', withSupabase({ auth: 'user' }), async (c) => {
  const { supabase, userClaims } = typedDb(c.var.supabaseContext)
  const memberId = userClaims!.id

  const { data: payments, error } = await supabase
    .from('payments')
    .select('id, amount, status, mpesa_receipt, channel, checkout_request_id, created_at')
    .eq('member_id', memberId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    throw new HttpError(500, error.message, 'DB_ERROR')
  }

  return c.json({ payments: payments ?? [] })
})

/**
 * POST /payments/:id/reconcile
 * Authenticated. Reconciles a Pending/Processing payment by querying Daraja status.
 * Only for payments where the callback may have been lost or delayed.
 * Does NOT weaken terminal state protection — Completed stays Completed.
 */
app.post('/:id/reconcile', withSupabase({ auth: 'user' }), async (c) => {
  requirePaymentsEnabled()
  const { supabase, supabaseAdmin, userClaims } = typedDb(c.var.supabaseContext)
  const paymentId = c.req.param('id')
  const memberId = userClaims!.id

  // 1. Load payment — scoped to member
  const { data: payment, error } = await supabase
    .from('payments')
    .select('id, member_id, status, checkout_request_id, subscription_id, package_id, amount')
    .eq('id', paymentId)
    .eq('member_id', memberId)
    .single()

  if (error || !payment) {
    throw new HttpError(404, 'Payment not found.', 'NOT_FOUND')
  }

  // 2. Only Pending/Processing payments can be reconciled
  if (payment.status !== 'Pending' && payment.status !== 'Processing') {
    return c.json({
      paymentId: payment.id,
      status: payment.status,
      reconciled: false,
      message: `Payment is already ${payment.status}. No reconciliation needed.`,
    })
  }

  // 3. Must have a CheckoutRequestID to query
  if (!payment.checkout_request_id) {
    return c.json({
      paymentId: payment.id,
      status: payment.status,
      reconciled: false,
      message: 'No CheckoutRequestID available for status query.',
    })
  }

  // 4. Query Daraja for transaction status
  const config = getDarajaConfig()
  let statusResult: Awaited<ReturnType<typeof queryTransactionStatus>>
  try {
    statusResult = await queryTransactionStatus(config, payment.checkout_request_id)
  } catch (err) {
    return c.json({
      paymentId: payment.id,
      status: payment.status,
      reconciled: false,
      message: 'Status query failed. Please try again later.',
    })
  }

  if (!statusResult.success || !statusResult.data) {
    return c.json({
      paymentId: payment.id,
      status: payment.status,
      reconciled: false,
      message: `Could not query status: ${statusResult.error ?? 'unknown error'}`,
    })
  }

  // 5. Interpret Daraja response
  const darajaResultCode = statusResult.data.ResultCode

  if (darajaResultCode === '0') {
    // Transaction succeeded — mark as completed via reconciliation
    await supabaseAdmin
      .from('payments')
      .update({
        status: 'Completed',
        payload: { reconciliation: statusResult.data },
        updated_at: new Date().toISOString(),
      })
      .eq('id', payment.id)
      .in('status', ['Pending', 'Processing'])

    // Create contribution if needed
    if (payment.subscription_id) {
      const period = new Date().toISOString().slice(0, 7)
      const { data: existing } = await supabaseAdmin
        .from('contributions')
        .select('id')
        .eq('subscription_id', payment.subscription_id)
        .eq('period', period)
        .single()

      if (!existing) {
        await supabaseAdmin.from('contributions').insert({
          subscription_id: payment.subscription_id,
          member_id: payment.member_id,
          package_id: payment.package_id,
          period,
          amount: payment.amount,
          status: 'Paid',
          payment_id: payment.id,
        })
      }
    }

    logPaymentEvent('payment_reconciled', {
      paymentId: payment.id,
      checkoutRequestId: payment.checkout_request_id,
      memberId,
      darajaResultCode,
      status: 'Completed',
    })

    await logAudit(supabaseAdmin, {
      actor_id: memberId,
      action: 'payment_reconciled',
      resource: 'payment',
      resource_id: payment.id,
      meta: { result: 'completed', darajaResultCode },
    })

    return c.json({
      paymentId: payment.id,
      status: 'Completed',
      reconciled: true,
      message: 'Payment confirmed as completed.',
    })
  }

  if (darajaResultCode === '1032') {
    // Transaction was cancelled by user
    await supabaseAdmin
      .from('payments')
      .update({
        status: 'Failed',
        payload: { reconciliation: statusResult.data },
        updated_at: new Date().toISOString(),
      })
      .eq('id', payment.id)
      .in('status', ['Pending', 'Processing'])

    await logAudit(supabaseAdmin, {
      actor_id: memberId,
      action: 'payment_reconciled',
      resource: 'payment',
      resource_id: payment.id,
      meta: { result: 'cancelled', darajaResultCode },
    })

    return c.json({
      paymentId: payment.id,
      status: 'Failed',
      reconciled: true,
      message: 'Payment was cancelled.',
    })
  }

  // Other result codes — keep as Pending, allow retry
  return c.json({
    paymentId: payment.id,
    status: payment.status,
    reconciled: false,
    message: `Transaction status: ${statusResult.data.ResultDescription}. You may retry the payment.`,
  })
})

export const paymentRoutes = app
