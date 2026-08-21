import { Hono } from 'hono'
import { z } from 'zod'
import { HttpError } from '../lib/http.js'
import { withSupabase, typedDb } from '../lib/supabase.js'
import { logAudit } from '../lib/audit.js'

const app = new Hono()

const registerSchema = z.object({
  email: z.string().email(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters.')
    .regex(/[A-Za-z]/, 'Password must contain a letter.')
    .regex(/[0-9]/, 'Password must contain a number.'),
  fullName: z.string().min(2, 'Enter your full name.'),
  phone: z
    .string()
    .regex(/^0[17]\d{8}$/, 'Enter a valid Kenyan phone number, e.g. 0712345678.'),
  idNumber: z.string().optional(),
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, 'Enter your password.'),
})

// Registration creates the auth user and a pending_approval member profile.
// An admin approves the account before the member can subscribe to packages.
app.post('/register', withSupabase({ auth: 'publishable' }), async (c) => {
  const { supabase, supabaseAdmin } = typedDb(c.var.supabaseContext)
  const body = await c.req.json().catch(() => null)
  if (!body) throw new HttpError(400, 'Send a JSON body.', 'VALIDATION')

  const parsed = registerSchema.safeParse(body)
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0].message, 'VALIDATION')
  }

  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { data: { full_name: parsed.data.fullName } },
  })

  if (error) {
    if (error.message.toLowerCase().includes('already registered')) {
      throw new HttpError(409, 'That email is already registered. Sign in instead.', 'EMAIL_TAKEN')
    }
    throw new HttpError(400, error.message, 'AUTH')
  }

  const userId = data.user?.id
  if (!userId) throw new HttpError(500, 'Account created but user id missing.', 'AUTH')

  const { error: memberError } = await supabaseAdmin.from('members').insert({
    id: userId,
    full_name: parsed.data.fullName,
    phone: parsed.data.phone,
    id_number: parsed.data.idNumber ?? null,
    email: parsed.data.email.toLowerCase(),
    status: 'pending_approval',
  })
  if (memberError) {
    throw new HttpError(500, memberError.message, 'DB_ERROR')
  }

  await logAudit(supabaseAdmin, {
    actor_id: userId,
    action: 'registered',
    resource: 'member',
    resource_id: userId,
  })

  return c.json(
    {
      message:
        'Account created. Check your email to confirm your address. An admin will approve your membership before you can join packages.',
      userId,
    },
    201,
  )
})

app.post('/login', withSupabase({ auth: 'publishable' }), async (c) => {
  const { supabase, supabaseAdmin } = typedDb(c.var.supabaseContext)
  const body = await c.req.json().catch(() => null)
  if (!body) throw new HttpError(400, 'Send a JSON body.', 'VALIDATION')

  const parsed = loginSchema.safeParse(body)
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0].message, 'VALIDATION')
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  })
  if (error) {
    throw new HttpError(401, 'Email or password is incorrect.', 'INVALID_LOGIN')
  }

  const { data: member, error: memberError } = await supabaseAdmin
    .from('members')
    .select('*')
    .eq('id', data.user.id)
    .single()
  if (memberError && memberError.code !== 'PGRST116') {
    throw new HttpError(500, memberError.message, 'DB_ERROR')
  }

  return c.json({ session: data.session, member })
})

// Authenticated profile for the member portal.
app.get('/me', withSupabase({ auth: 'user' }), async (c) => {
  const { supabase, supabaseAdmin, userClaims } = typedDb(c.var.supabaseContext)
  const userId = userClaims!.id

  const { data: member, error } = await supabase
    .from('members')
    .select('*')
    .eq('id', userId)
    .single()

  const { data: subscriptions } = await supabaseAdmin
    .from('subscriptions')
    .select('id, status, started_at, next_due_date, package_id, package_tier_id, packages(code, name), package_tiers(name, amount)')
    .eq('member_id', userId)
    .order('created_at')

  return c.json({ member: member ?? null, error: error ? error.message : null, subscriptions: subscriptions ?? [] })
})

export const authRoutes = app



