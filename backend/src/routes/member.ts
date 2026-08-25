import { Hono } from 'hono'
import { z } from 'zod'
import { HttpError } from '../lib/http.js'
import { withSupabase, typedDb } from '../lib/supabase.js'
import { logAudit } from '../lib/audit.js'
import { buildMemberDashboard } from '../lib/dashboard.js'

const app = new Hono()

const profileSchema = z.object({
  fullName: z.string().min(2).optional(),
  idNumber: z.string().optional(),
  altPhone: z.string().optional(),
  dateOfBirth: z.string().optional(),
  county: z.string().optional(),
  location: z.string().optional(),
  occupation: z.string().optional(),
  photoUrl: z.string().url().optional().or(z.literal('')),
})

const familySchema = z.object({
  fullName: z.string().min(2, 'Enter the family member\'s name.'),
  relationship: z.string().min(1, 'Select a relationship.'),
  idNumber: z.string().optional(),
  dateOfBirth: z.string().optional(),
  tier: z.enum(['nuclear', 'extended']).default('nuclear'),
})

const subscribeSchema = z.object({
  packageId: z.string().uuid('Select a package.'),
  packageTierId: z.string().uuid().optional(),
})

app.use('*', withSupabase({ auth: 'user' }))

// ---------------------------------------------------------------------------
// Registration Fee (KSh 300 one-time)
// ---------------------------------------------------------------------------

// Check registration fee status
app.get('/registration-fee', async (c) => {
  const { supabaseAdmin, userClaims } = typedDb(c.var.supabaseContext)
  const { data: fee } = await supabaseAdmin
    .from('registration_fees')
    .select('*')
    .eq('member_id', userClaims!.id)
    .eq('fee_type', 'registration')
    .maybeSingle()
  return c.json({ registration_fee: fee ?? null })
})

// Record registration fee as pending (after STK Push initiated)
app.post('/registration-fee/initiate', async (c) => {
  const { supabaseAdmin, userClaims } = typedDb(c.var.supabaseContext)
  const memberId = userClaims!.id

  // Check if already paid
  const { data: existing } = await supabaseAdmin
    .from('registration_fees')
    .select('status')
    .eq('member_id', memberId)
    .eq('fee_type', 'registration')
    .maybeSingle()

  if (existing?.status === 'paid') {
    throw new HttpError(409, 'Registration fee already paid.', 'ALREADY_PAID')
  }

  if (existing?.status === 'pending') {
    return c.json({ message: 'Payment already in progress.', status: 'pending' })
  }

  // Mark as pending
  if (existing) {
    await supabaseAdmin
      .from('registration_fees')
      .update({ status: 'pending', payment_method: 'mpesa' })
      .eq('member_id', memberId)
      .eq('fee_type', 'registration')
  } else {
    await supabaseAdmin
      .from('registration_fees')
      .insert({
        member_id: memberId,
        fee_type: 'registration',
        amount: 300,
        currency: 'KES',
        status: 'pending',
        payment_method: 'mpesa',
      })
  }

  return c.json({ message: 'Registration fee payment initiated.', status: 'pending' })
})

// NOTE: Registration fee confirmation is NOT available to members.
// Confirmation is only possible via:
// 1. M-Pesa callback handler (Phase 2 — automatic verification)
// 2. Admin verification endpoint (admin route, not here)
// Members cannot mark their own fee as paid.

app.patch('/profile', async (c) => {
  const { supabase, supabaseAdmin, userClaims } = typedDb(c.var.supabaseContext)
  const userId = userClaims!.id
  const body = await c.req.json().catch(() => null)
  if (!body) throw new HttpError(400, 'Send a JSON body.', 'VALIDATION')

  const parsed = profileSchema.safeParse(body)
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message, 'VALIDATION')

  const { data, error } = await supabase
    .from('members')
    .update({
      full_name: parsed.data.fullName,
      id_number: parsed.data.idNumber,
      alt_phone: parsed.data.altPhone,
      date_of_birth: parsed.data.dateOfBirth,
      county: parsed.data.county,
      location: parsed.data.location,
      occupation: parsed.data.occupation,
      photo_url: parsed.data.photoUrl || null,
    })
    .eq('id', userId)
    .select()
    .single()
  if (error) throw new HttpError(500, error.message, 'DB_ERROR')

  await logAudit(supabaseAdmin, {
    actor_id: userId,
    action: 'updated_profile',
    resource: 'member',
    resource_id: userId,
  })
  return c.json({ member: data })
})

// Family members — registered dependents for Welfare Package tiered coverage
app.get('/family', async (c) => {
  const { supabase, userClaims } = typedDb(c.var.supabaseContext)
  const { data, error } = await supabase
    .from('family_members')
    .select('*')
    .eq('member_id', userClaims!.id)
    .eq('is_active', true)
    .order('created_at')
  if (error) throw new HttpError(500, error.message, 'DB_ERROR')
  return c.json({ family_members: data ?? [] })
})

app.post('/family', async (c) => {
  const { supabase, supabaseAdmin, userClaims } = typedDb(c.var.supabaseContext)
  const body = await c.req.json().catch(() => null)
  if (!body) throw new HttpError(400, 'Send a JSON body.', 'VALIDATION')
  const parsed = familySchema.safeParse(body)
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message, 'VALIDATION')

  const { data, error } = await supabase
    .from('family_members')
    .insert({
      member_id: userClaims!.id,
      full_name: parsed.data.fullName,
      relationship: parsed.data.relationship,
      id_number: parsed.data.idNumber,
      date_of_birth: parsed.data.dateOfBirth,
      tier: parsed.data.tier,
    })
    .select()
    .single()
  if (error) throw new HttpError(500, error.message, 'DB_ERROR')

  await logAudit(supabaseAdmin, {
    actor_id: userClaims!.id,
    action: 'added_family_member',
    resource: 'family_member',
    resource_id: data.id,
  })
  return c.json({ family_member: data }, 201)
})

app.patch('/family/:id', async (c) => {
  const { supabase, supabaseAdmin, userClaims } = typedDb(c.var.supabaseContext)
  const body = await c.req.json().catch(() => null)
  const parsed = familySchema.partial().safeParse(body ?? {})
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message, 'VALIDATION')

  const { data, error } = await supabase
    .from('family_members')
    .update(parsed.data)
    .eq('id', c.req.param('id'))
    .eq('member_id', userClaims!.id)
    .select()
    .single()
  if (error) throw new HttpError(404, 'Family member not found.', 'NOT_FOUND')

  await logAudit(supabaseAdmin, {
    actor_id: userClaims!.id,
    action: 'updated_family_member',
    resource: 'family_member',
    resource_id: data.id,
  })
  return c.json({ family_member: data })
})

app.delete('/family/:id', async (c) => {
  const { supabase, supabaseAdmin, userClaims } = typedDb(c.var.supabaseContext)
  const { data, error } = await supabase
    .from('family_members')
    .update({ is_active: false })
    .eq('id', c.req.param('id'))
    .eq('member_id', userClaims!.id)
    .select()
    .single()
  if (error) throw new HttpError(404, 'Family member not found.', 'NOT_FOUND')

  await logAudit(supabaseAdmin, {
    actor_id: userClaims!.id,
    action: 'removed_family_member',
    resource: 'family_member',
    resource_id: data.id,
  })
  return c.json({ ok: true })
})

// Join a package. Requires an active (approved) account. The subscription is
// created as 'pending'; an admin approves it to start the waiting period.
app.post('/subscriptions', async (c) => {
  const { supabase, supabaseAdmin, userClaims } = typedDb(c.var.supabaseContext)
  const body = await c.req.json().catch(() => null)
  if (!body) throw new HttpError(400, 'Send a JSON body.', 'VALIDATION')
  const parsed = subscribeSchema.safeParse(body)
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message, 'VALIDATION')

  const { data: member } = await supabase
    .from('members')
    .select('status')
    .eq('id', userClaims!.id)
    .single()
  if (!member || member.status !== 'active') {
    throw new HttpError(
      403,
      'Your account is not active. Please contact support if you believe this is an error.',
      'ACCOUNT_INACTIVE',
    )
  }

  // Check if registration fee has been paid
  const { data: regFee } = await supabaseAdmin
    .from('registration_fees')
    .select('status')
    .eq('member_id', userClaims!.id)
    .eq('fee_type', 'registration')
    .maybeSingle()
  if (!regFee || regFee.status !== 'paid') {
    throw new HttpError(
      403,
      'You must pay the KSh 300 registration fee before subscribing to packages.',
      'REGISTRATION_FEE_REQUIRED',
    )
  }

  const { data: existing } = await supabase
    .from('subscriptions')
    .select('id')
    .eq('member_id', userClaims!.id)
    .eq('package_id', parsed.data.packageId)
    .maybeSingle()
  if (existing) throw new HttpError(409, 'You are already in this package.', 'ALREADY_SUBSCRIBED')

  const { data, error } = await supabaseAdmin
    .from('subscriptions')
    .insert({
      member_id: userClaims!.id,
      package_id: parsed.data.packageId,
      package_tier_id: parsed.data.packageTierId ?? null,
      status: 'pending',
    })
    .select()
    .single()
  if (error) throw new HttpError(500, error.message, 'DB_ERROR')

  await logAudit(supabaseAdmin, {
    actor_id: userClaims!.id,
    action: 'requested_subscription',
    resource: 'subscription',
    resource_id: data.id,
  })
  return c.json({ subscription: data }, 201)
})

// Per-package dashboard cards — one card per package, never a flat bar.
app.get('/dashboard', async (c) => {
  const { supabaseAdmin, userClaims } = typedDb(c.var.supabaseContext)
  const cards = await buildMemberDashboard(supabaseAdmin, userClaims!.id)
  return c.json({ cards })
})

export const memberRoutes = app