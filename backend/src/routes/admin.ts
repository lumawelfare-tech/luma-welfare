import { Hono } from 'hono'
import { z } from 'zod'
import { HttpError } from '../lib/http.js'
import { withSupabase, typedDb } from '../lib/supabase.js'
import { logAudit } from '../lib/audit.js'
import { loadAdminSession, requirePermission } from '../lib/rbac.js'
import { evaluateQualification } from '../lib/qualify.js'

const app = new Hono()

app.use('*', withSupabase({ auth: 'user' }), async (c, next) => {
  const { supabaseAdmin, userClaims } = typedDb(c.var.supabaseContext)
  const session = await loadAdminSession(supabaseAdmin, userClaims!.id)
  c.set('adminSession', session)
  await next()
})

declare module 'hono' {
  interface ContextVariableMap {
    adminSession: ReturnType<typeof loadAdminSession> extends Promise<infer T> ? T : never
  }
}

const memberStatusSchema = z.object({
  status: z.enum(['active', 'suspended', 'closed']),
})

const subscriptionStatusSchema = z.object({
  status: z.enum(['active', 'paused', 'cancelled', 'rejected']),
  reason: z.string().optional(),
})

const packageSchema = z.object({
  code: z.string().min(1).regex(/^[a-z0-9_]+$/, 'Code must be lowercase letters, numbers or underscore.'),
  name: z.string().min(1),
  description: z.string().optional(),
  coverage: z.string().optional(),
  waitingPeriodMonths: z.string().optional(),
  sortOrder: z.number().int().optional(),
  payoutRule: z.string().optional(),
})

const tierSchema = z.object({
  name: z.string().min(1),
  amount: z.number().positive(),
  description: z.string().optional(),
})

const rulesSchema = z.record(z.any())

const verifyContributionSchema = z.object({
  action: z.enum(['verify', 'reject']),
  paymentId: z.string().uuid().optional(),
  notes: z.string().optional(),
})

const claimDecisionSchema = z.object({
  decision: z.enum(['approve', 'reject', 'request-info']),
  adminNotes: z.string().optional(),
  amount: z.number().positive().optional(),
})

// ---------------------------------------------------------------------------
// Dashboard — confirmed figures only. The marketing stats (12,000+ members,
// 10,000+ claims) stay out until Luma confirms them.
// ---------------------------------------------------------------------------
app.get('/dashboard', async (c) => {
  const { supabaseAdmin } = typedDb(c.var.supabaseContext)
  requirePermission(c.get('adminSession'), 'members', 'read')

  const [members, pending, subs, pendingContribs, pendingClaims, settings, openQ] =
    await Promise.all([
      supabaseAdmin.from('members').select('id', { count: 'exact', head: true }),
      supabaseAdmin.from('members').select('id', { count: 'exact', head: true }).eq('status', 'pending_approval'),
      supabaseAdmin.from('subscriptions').select('id', { count: 'exact', head: true }),
      supabaseAdmin.from('contributions').select('id', { count: 'exact', head: true }).eq('status', 'Pending'),
      supabaseAdmin.from('claims').select('id', { count: 'exact', head: true }).neq('status', 'Paid'),
      supabaseAdmin.from('platform_settings').select('key, value').eq('key', 'stats'),
      supabaseAdmin.from('open_questions').select('*').eq('status', 'open'),
    ])

  return c.json({
    members: members.count ?? 0,
    pending_approvals: pending.count ?? 0,
    subscriptions: subs.count ?? 0,
    pending_contributions: pendingContribs.count ?? 0,
    open_claims: pendingClaims.count ?? 0,
    confirmed_stats: settings.data?.[0]?.value ?? {},
    open_questions: openQ.data ?? [],
  })
})

// ---------------------------------------------------------------------------
// Dashboard — confirmed figures only. The marketing stats (12,000+ members,

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------
app.get('/members', async (c) => {
  const { supabaseAdmin } = typedDb(c.var.supabaseContext)
  requirePermission(c.get('adminSession'), 'members', 'read')

  const status = c.req.query('status')
  const q = c.req.query('q')
  let query = supabaseAdmin
    .from('members')
    .select('id, membership_number, full_name, phone, email, status, joined_at, approved_at')
    .order('joined_at', { ascending: false })
  if (status) query = query.eq('status', status)
  if (q) {
    query = query.or(`full_name.ilike.%${q}%,phone.ilike.%${q}%,membership_number.ilike.%${q}%`)
  }
  const { data, error } = await query
  if (error) throw new HttpError(500, error.message, 'DB_ERROR')
  return c.json({ members: data ?? [] })
})

app.get('/members/:id', async (c) => {
  const { supabaseAdmin } = typedDb(c.var.supabaseContext)
  requirePermission(c.get('adminSession'), 'members', 'read')

  const id = c.req.param('id')
  const { data: member, error } = await supabaseAdmin
    .from('members')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw new HttpError(404, 'Member not found.', 'NOT_FOUND')

  const [subs, family, contribs] = await Promise.all([
    supabaseAdmin
      .from('subscriptions')
      .select('id, status, started_at, next_due_date, package_id, packages(code, name), package_tiers(name, amount)')
      .eq('member_id', id),
    supabaseAdmin.from('family_members').select('*').eq('member_id', id).eq('is_active', true),
    supabaseAdmin.from('contributions').select('id, period, amount, status, package_id, created_at').eq('member_id', id).order('period', { ascending: false }),
  ])

  return c.json({ member, subscriptions: subs.data ?? [], family_members: family.data ?? [], contributions: contribs.data ?? [] })
})

app.patch('/members/:id/status', async (c) => {
  const { supabaseAdmin } = typedDb(c.var.supabaseContext)
  requirePermission(c.get('adminSession'), 'members', 'approve')

  const body = await c.req.json().catch(() => null)
  const parsed = memberStatusSchema.safeParse(body ?? {})
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message, 'VALIDATION')

  const id = c.req.param('id')
  const now = new Date().toISOString()
  const { data, error } = await supabaseAdmin
    .from('members')
    .update({
      status: parsed.data.status,
      approved_at: parsed.data.status === 'active' ? now : undefined,
      approved_by: parsed.data.status === 'active' ? c.get('adminSession').id : undefined,
    })
    .eq('id', id)
    .select()
    .single()
  if (error) throw new HttpError(404, 'Member not found.', 'NOT_FOUND')

  await logAudit(supabaseAdmin, {
    actor_id: c.get('adminSession').id,
    actor_role: c.get('adminSession').role_name,
    action: `member_${parsed.data.status}`,
    resource: 'member',
    resource_id: id,
    meta: { by: c.get('adminSession').display_name },
  })
  return c.json({ member: data })
})

// ---------------------------------------------------------------------------
// Packages — admin-editable, per the build spec
// ---------------------------------------------------------------------------
app.get('/packages', async (c) => {
  const { supabaseAdmin } = typedDb(c.var.supabaseContext)
  requirePermission(c.get('adminSession'), 'packages', 'read')

  const { data: packages } = await supabaseAdmin.from('packages').select('*').order('sort_order')
  const { data: tiers } = await supabaseAdmin.from('package_tiers').select('*')
  const { data: rules } = await supabaseAdmin.from('package_rules').select('*')

  return c.json({
    packages: (packages ?? []).map((p) => ({
      ...p,
      tiers: (tiers ?? []).filter((t) => t.package_id === p.id),
      rules: (rules ?? []).filter((r) => r.package_id === p.id).reduce(
        (acc, r) => ({ ...acc, [r.key]: r.value }),
        {},
      ),
    })),
  })
})

app.post('/packages', async (c) => {
  const { supabaseAdmin } = typedDb(c.var.supabaseContext)
  requirePermission(c.get('adminSession'), 'packages', 'create')

  const body = await c.req.json().catch(() => null)
  const parsed = packageSchema.safeParse(body ?? {})
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message, 'VALIDATION')

  const { data, error } = await supabaseAdmin
    .from('packages')
    .insert({
      code: parsed.data.code,
      name: parsed.data.name,
      description: parsed.data.description,
      coverage: parsed.data.coverage ?? '',
      waiting_period_months: parsed.data.waitingPeriodMonths ?? '',
      sort_order: parsed.data.sortOrder ?? 0,
      payout_rule: parsed.data.payoutRule ?? '',
    })
    .select()
    .single()
  if (error) throw new HttpError(500, error.message, 'DB_ERROR')

  await logAudit(supabaseAdmin, {
    actor_id: c.get('adminSession').id,
    actor_role: c.get('adminSession').role_name,
    action: 'created_package',
    resource: 'package',
    resource_id: data.id,
  })
  return c.json({ package: data }, 201)
})

app.patch('/packages/:id', async (c) => {
  const { supabaseAdmin } = typedDb(c.var.supabaseContext)
  requirePermission(c.get('adminSession'), 'packages', 'update')

  const body = await c.req.json().catch(() => null)
  const parsed = packageSchema.partial().safeParse(body ?? {})
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message, 'VALIDATION')

  const { data, error } = await supabaseAdmin
    .from('packages')
    .update({
      name: parsed.data.name,
      description: parsed.data.description,
      coverage: parsed.data.coverage,
      waiting_period_months: parsed.data.waitingPeriodMonths,
      sort_order: parsed.data.sortOrder,
      payout_rule: parsed.data.payoutRule,
    })
    .eq('id', c.req.param('id'))
    .select()
    .single()
  if (error) throw new HttpError(404, 'Package not found.', 'NOT_FOUND')

  await logAudit(supabaseAdmin, {
    actor_id: c.get('adminSession').id,
    actor_role: c.get('adminSession').role_name,
    action: 'updated_package',
    resource: 'package',
    resource_id: data.id,
  })
  return c.json({ package: data })
})

app.post('/packages/:id/tiers', async (c) => {
  const { supabaseAdmin } = typedDb(c.var.supabaseContext)
  requirePermission(c.get('adminSession'), 'packages', 'update')

  const body = await c.req.json().catch(() => null)
  const parsed = tierSchema.safeParse(body ?? {})
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message, 'VALIDATION')

  const { data, error } = await supabaseAdmin
    .from('package_tiers')
    .insert({ package_id: c.req.param('id'), name: parsed.data.name, amount: parsed.data.amount, description: parsed.data.description })
    .select()
    .single()
  if (error) throw new HttpError(500, error.message, 'DB_ERROR')
  return c.json({ tier: data }, 201)
})

// Replace the rule set for a package (qualification engine config).
app.put('/packages/:id/rules', async (c) => {
  const { supabaseAdmin } = typedDb(c.var.supabaseContext)
  requirePermission(c.get('adminSession'), 'packages', 'update')

  const body = await c.req.json().catch(() => null)
  const parsed = rulesSchema.safeParse(body ?? {})
  if (!parsed.success) throw new HttpError(400, 'Rules must be a JSON object.', 'VALIDATION')

  const packageId = c.req.param('id')
  await supabaseAdmin.from('package_rules').delete().eq('package_id', packageId)
  for (const [key, value] of Object.entries(parsed.data)) {
    await supabaseAdmin.from('package_rules').insert({ package_id: packageId, key, value: String(value ?? '') })
  }

  await logAudit(supabaseAdmin, {
    actor_id: c.get('adminSession').id,
    actor_role: c.get('adminSession').role_name,
    action: 'updated_package_rules',
    resource: 'package',
    resource_id: packageId,
  })
  return c.json({ ok: true })
})

app.post('/packages/:id/retire', async (c) => {
  const { supabaseAdmin } = typedDb(c.var.supabaseContext)
  requirePermission(c.get('adminSession'), 'packages', 'update')

  const { data, error } = await supabaseAdmin
    .from('packages')
    .update({ is_active: false })
    .eq('id', c.req.param('id'))
    .select('id, name')
    .single()
  if (error) throw new HttpError(404, 'Package not found.', 'NOT_FOUND')

  await logAudit(supabaseAdmin, {
    actor_id: c.get('adminSession').id,
    actor_role: c.get('adminSession').role_name,
    action: 'retired_package',
    resource: 'package',
    resource_id: data.id,
  })
  return c.json({ ok: true, package: data })
})

// ---------------------------------------------------------------------------
// Subscriptions — approve to start the waiting period
// ---------------------------------------------------------------------------
app.get('/subscriptions', async (c) => {
  const { supabaseAdmin } = typedDb(c.var.supabaseContext)
  requirePermission(c.get('adminSession'), 'members', 'read')

  const status = c.req.query('status')
  let query = supabaseAdmin
    .from('subscriptions')
    .select('id, status, started_at, next_due_date, member_id, members(full_name, phone, membership_number), packages(code, name), package_tiers(name, amount)')
    .order('created_at', { ascending: false })
  if (status) query = query.eq('status', status)
  const { data, error } = await query
  if (error) throw new HttpError(500, error.message, 'DB_ERROR')
  return c.json({ subscriptions: data ?? [] })
})

app.patch('/subscriptions/:id', async (c) => {
  const { supabaseAdmin } = typedDb(c.var.supabaseContext)
  requirePermission(c.get('adminSession'), 'members', 'approve')

  const body = await c.req.json().catch(() => null)
  const parsed = subscriptionStatusSchema.safeParse(body ?? {})
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message, 'VALIDATION')

  const updates: Record<string, unknown> = {
    status: parsed.data.status,
    cancelled_reason: parsed.data.reason,
  }
  if (parsed.data.status === 'active') {
    updates.started_at = new Date().toISOString().slice(0, 10)
    updates.next_due_date = new Date().toISOString().slice(0, 10)
  }
  if (parsed.data.status === 'cancelled' || parsed.data.status === 'rejected') {
    updates.cancelled_at = new Date().toISOString()
  }

  const { data, error } = await supabaseAdmin
    .from('subscriptions')
    .update(updates)
    .eq('id', c.req.param('id'))
    .select()
    .single()
  if (error) throw new HttpError(404, 'Subscription not found.', 'NOT_FOUND')

  await logAudit(supabaseAdmin, {
    actor_id: c.get('adminSession').id,
    actor_role: c.get('adminSession').role_name,
    action: `subscription_${parsed.data.status}`,
    resource: 'subscription',
    resource_id: data.id,
  })
  return c.json({ subscription: data })
})

// Run the qualification engine for one subscription and store the result.
app.post('/subscriptions/:id/evaluate', async (c) => {
  const { supabaseAdmin } = typedDb(c.var.supabaseContext)
  requirePermission(c.get('adminSession'), 'members', 'read')

  const subId = c.req.param('id')
  const { data: sub, error } = await supabaseAdmin
    .from('subscriptions')
    .select('id, member_id, package_id, started_at, status, members(status)')
    .eq('id', subId)
    .single()
  if (error) throw new HttpError(404, 'Subscription not found.', 'NOT_FOUND')

  const { data: rules } = await supabaseAdmin.from('package_rules').select('key, value').eq('package_id', sub.package_id)
  const { data: contributions } = await supabaseAdmin.from('contributions').select('status, period').eq('subscription_id', subId)
  const { data: existing } = await supabaseAdmin.from('qualifications').select('id').eq('subscription_id', subId).maybeSingle()

  const ruleMap: Record<string, unknown> = {}
  for (const r of rules ?? []) ruleMap[r.key] = r.value

  const result = evaluateQualification(
    ruleMap,
    {
      memberStatus: ((sub.members as unknown as { status: string }[]) ?? [])[0]?.status ?? 'pending_approval',
      subscriptionStatus: sub.status,
      startedAt: sub.started_at,
    },
    (contributions ?? []) as { status: string; period: string }[],
  )

  const payload = {
    subscription_id: subId,
    member_id: sub.member_id,
    package_id: sub.package_id,
    status: result.status,
    eligible_from: result.eligibleFrom,
    criteria_met: result.criteriaMet,
    evaluated_at: new Date().toISOString(),
    evaluated_by: c.get('adminSession').id,
  }

  const { data: saved, error: saveError } = existing
    ? await supabaseAdmin.from('qualifications').update(payload).eq('id', existing.id).select().single()
    : await supabaseAdmin.from('qualifications').insert(payload).select().single()
  if (saveError) throw new HttpError(500, saveError.message, 'DB_ERROR')

  await logAudit(supabaseAdmin, {
    actor_id: c.get('adminSession').id,
    actor_role: c.get('adminSession').role_name,
    action: 'evaluated_qualification',
    resource: 'subscription',
    resource_id: subId,
    meta: { status: result.status },
  })
  return c.json({ qualification: saved, criteria_met: result.criteriaMet })
})

// ---------------------------------------------------------------------------
// Contributions — finance verification
// ---------------------------------------------------------------------------
app.get('/contributions', async (c) => {
  const { supabaseAdmin } = typedDb(c.var.supabaseContext)
  requirePermission(c.get('adminSession'), 'contributions', 'read')

  const status = c.req.query('status') ?? 'Pending'
  const { data, error } = await supabaseAdmin
    .from('contributions')
    .select('id, period, amount, status, notes, created_at, member_id, members(full_name, phone, membership_number), packages(code, name), payments(mpesa_receipt)')
    .eq('status', status)
    .order('created_at', { ascending: true })
    .limit(100)
  if (error) throw new HttpError(500, error.message, 'DB_ERROR')
  return c.json({ contributions: data ?? [] })
})

app.patch('/contributions/:id', async (c) => {
  const { supabaseAdmin } = typedDb(c.var.supabaseContext)
  requirePermission(c.get('adminSession'), 'contributions', 'verify')

  const body = await c.req.json().catch(() => null)
  const parsed = verifyContributionSchema.safeParse(body ?? {})
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message, 'VALIDATION')

  const { data, error } = await supabaseAdmin
    .from('contributions')
    .update({
      status: parsed.data.action === 'verify' ? 'Verified' : 'Failed',
      payment_id: parsed.data.paymentId ?? null,
      notes: parsed.data.notes,
    })
    .eq('id', c.req.param('id'))
    .select()
    .single()
  if (error) throw new HttpError(404, 'Contribution not found.', 'NOT_FOUND')

  await logAudit(supabaseAdmin, {
    actor_id: c.get('adminSession').id,
    actor_role: c.get('adminSession').role_name,
    action: parsed.data.action === 'verify' ? 'verified_contribution' : 'rejected_contribution',
    resource: 'contribution',
    resource_id: data.id,
  })
  return c.json({ contribution: data })
})

// ---------------------------------------------------------------------------
// Claims — scaffolded for Phase 2 (full flow with documents + payouts)
// ---------------------------------------------------------------------------
app.get('/claims', async (c) => {
  const { supabaseAdmin } = typedDb(c.var.supabaseContext)
  requirePermission(c.get('adminSession'), 'claims', 'read')

  const { data, error } = await supabaseAdmin
    .from('claims')
    .select('id, claim_number, claim_type, amount_requested, status, created_at, member_id, members(full_name, phone), packages(code, name)')
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) throw new HttpError(500, error.message, 'DB_ERROR')
  return c.json({ claims: data ?? [] })
})

app.get('/claims/:id', async (c) => {
  const { supabaseAdmin } = typedDb(c.var.supabaseContext)
  requirePermission(c.get('adminSession'), 'claims', 'read')

  const { data: claim, error } = await supabaseAdmin
    .from('claims')
    .select('*')
    .eq('id', c.req.param('id'))
    .single()
  if (error) throw new HttpError(404, 'Claim not found.', 'NOT_FOUND')

  const { data: documents } = await supabaseAdmin.from('claim_documents').select('*').eq('claim_id', claim.id)
  return c.json({ claim, documents: documents ?? [] })
})

app.patch('/claims/:id', async (c) => {
  const { supabaseAdmin } = typedDb(c.var.supabaseContext)
  requirePermission(c.get('adminSession'), 'claims', 'approve')

  const body = await c.req.json().catch(() => null)
  const parsed = claimDecisionSchema.safeParse(body ?? {})
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message, 'VALIDATION')

  const statusMap = {
    approve: 'Approved',
    reject: 'Rejected',
    'request-info': 'Additional Information Required',
  } as const

  const updates: Record<string, unknown> = {
    status: statusMap[parsed.data.decision],
    admin_notes: parsed.data.adminNotes,
    reviewed_at: new Date().toISOString(),
  }
  if (parsed.data.decision === 'approve' || parsed.data.decision === 'reject') {
    updates.decided_at = new Date().toISOString()
    updates.decided_by = c.get('adminSession').id
  }
  if (parsed.data.amount) updates.amount_requested = parsed.data.amount

  const { data, error } = await supabaseAdmin
    .from('claims')
    .update(updates)
    .eq('id', c.req.param('id'))
    .select()
    .single()
  if (error) throw new HttpError(404, 'Claim not found.', 'NOT_FOUND')

  await logAudit(supabaseAdmin, {
    actor_id: c.get('adminSession').id,
    actor_role: c.get('adminSession').role_name,
    action: `claim_${parsed.data.decision}`,
    resource: 'claim',
    resource_id: data.id,
  })
  return c.json({ claim: data })
})

// ---------------------------------------------------------------------------
// Admin housekeeping
// ---------------------------------------------------------------------------
app.get('/open-questions', async (c) => {
  const { supabaseAdmin } = typedDb(c.var.supabaseContext)
  requirePermission(c.get('adminSession'), 'members', 'read')
  const { data, error } = await supabaseAdmin.from('open_questions').select('*').order('created_at')
  if (error) throw new HttpError(500, error.message, 'DB_ERROR')
  return c.json({ open_questions: data ?? [] })
})

app.post('/open-questions/:id/resolve', async (c) => {
  const { supabaseAdmin } = typedDb(c.var.supabaseContext)
  requirePermission(c.get('adminSession'), 'members', 'update')

  const body = await c.req.json().catch(() => null)
  const answer = typeof body?.answer === 'string' ? body.answer : null
  const { data, error } = await supabaseAdmin
    .from('open_questions')
    .update({ status: 'resolved', answer: answer ?? '' })
    .eq('id', c.req.param('id'))
    .select()
    .single()
  if (error) throw new HttpError(404, 'Question not found.', 'NOT_FOUND')
  return c.json({ question: data })
})

app.get('/audit-logs', async (c) => {
  const { supabaseAdmin } = typedDb(c.var.supabaseContext)
  requirePermission(c.get('adminSession'), 'audit_logs', 'read')
  const { data, error } = await supabaseAdmin
    .from('audit_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) throw new HttpError(500, error.message, 'DB_ERROR')
  return c.json({ audit_logs: data ?? [] })
})

app.patch('/settings', async (c) => {
  const { supabaseAdmin } = typedDb(c.var.supabaseContext)
  requirePermission(c.get('adminSession'), 'members', 'update')

  const body = await c.req.json().catch(() => null)
  if (!body || typeof body.key !== 'string') {
    throw new HttpError(400, 'Send { key, value } where value is a JSON object.', 'VALIDATION')
  }
  const { data, error } = await supabaseAdmin
    .from('platform_settings')
    .upsert({ key: body.key, value: body.value })
    .select()
    .single()
  if (error) throw new HttpError(500, error.message, 'DB_ERROR')

  await logAudit(supabaseAdmin, {
    actor_id: c.get('adminSession').id,
    actor_role: c.get('adminSession').role_name,
    action: 'updated_setting',
    resource: 'platform_settings',
    resource_id: body.key,
  })
  return c.json({ setting: data })
})

export const adminRoutes = app