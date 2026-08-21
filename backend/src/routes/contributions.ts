import { Hono } from 'hono'
import { z } from 'zod'
import { HttpError } from '../lib/http.js'
import { withSupabase, typedDb } from '../lib/supabase.js'
import { logAudit } from '../lib/audit.js'

const app = new Hono()

const recordSchema = z.object({
  subscriptionId: z.string().uuid('Select a package to contribute to.'),
  period: z.string().regex(/^\d{4}-\d{2}$/, 'Period must be YYYY-MM.'),
  amount: z.number().positive('Amount must be greater than zero.'),
})

app.use('*', withSupabase({ auth: 'user' }))

// List the member's own contributions, optionally scoped to one subscription.
app.get('/', async (c) => {
  const { supabase, userClaims } = typedDb(c.var.supabaseContext)
  const subId = c.req.query('subscriptionId')

  let query = supabase
    .from('contributions')
    .select(
      'id, period, amount, status, notes, created_at, subscription_id, packages(code, name)',
    )
    .eq('member_id', userClaims!.id)
  if (subId) query = query.eq('subscription_id', subId)
  const { data, error } = await query.order('period', { ascending: false })
  if (error) throw new HttpError(500, error.message, 'DB_ERROR')
  return c.json({ contributions: data ?? [] })
})

// Record a contribution for the current period. Status starts as Pending; a
// finance admin verifies it against the M-Pesa payment (Phase 2 wires the STK
// push callback to set this directly).
app.post('/', async (c) => {
  const { supabase, supabaseAdmin, userClaims } = typedDb(c.var.supabaseContext)
  const body = await c.req.json().catch(() => null)
  if (!body) throw new HttpError(400, 'Send a JSON body.', 'VALIDATION')
  const parsed = recordSchema.safeParse(body)
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message, 'VALIDATION')

  const { data: sub, error: subErr } = await supabase
    .from('subscriptions')
    .select('id, status, package_id, package_tiers(amount)')
    .eq('id', parsed.data.subscriptionId)
    .eq('member_id', userClaims!.id)
    .single()
  if (subErr || !sub) throw new HttpError(404, 'Subscription not found.', 'NOT_FOUND')
  if (sub.status !== 'active') {
    throw new HttpError(409, 'This package is not active for your account yet.', 'SUBSCRIPTION_INACTIVE')
  }

  const expected = Number(sub.package_tiers?.[0]?.amount ?? 0)
  if (expected > 0 && parsed.data.amount !== expected) {
    throw new HttpError(
      400,
      `The monthly contribution for this package is KSh ${expected}.`,
      'AMOUNT_MISMATCH',
    )
  }

  const { data: existing } = await supabase
    .from('contributions')
    .select('id')
    .eq('subscription_id', parsed.data.subscriptionId)
    .eq('period', parsed.data.period)
    .maybeSingle()
  if (existing) throw new HttpError(409, 'A contribution already exists for this period.', 'DUPLICATE_PERIOD')

  const { data, error } = await supabaseAdmin
    .from('contributions')
    .insert({
      subscription_id: parsed.data.subscriptionId,
      member_id: userClaims!.id,
      package_id: sub.package_id,
      period: parsed.data.period,
      amount: parsed.data.amount,
      status: 'Pending',
      recorded_by: userClaims!.id,
    })
    .select()
    .single()
  if (error) throw new HttpError(500, error.message, 'DB_ERROR')

  await logAudit(supabaseAdmin, {
    actor_id: userClaims!.id,
    action: 'recorded_contribution',
    resource: 'contribution',
    resource_id: data.id,
  })
  return c.json({ contribution: data }, 201)
})

export const contributionRoutes = app