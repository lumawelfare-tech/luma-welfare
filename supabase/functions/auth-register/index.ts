import { handleCors, corsHeaders } from '../shared/cors.ts'
import { createAdminClient, logAudit } from '../shared/supabase.ts'
import { sendEmail, buildEmailTemplate } from '../shared/email.ts'

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ message: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const body = await req.json()
    const { email, password, fullName, phone, idNumber } = body

    // Validation
    if (!email || !password || !fullName || !phone) {
      return new Response(JSON.stringify({ message: 'Missing required fields.', code: 'VALIDATION' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (password.length < 8) {
      return new Response(JSON.stringify({ message: 'Password must be at least 8 characters.', code: 'VALIDATION' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      return new Response(JSON.stringify({ message: 'Password must contain at least one letter and one number.', code: 'VALIDATION' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!/^0[17]\d{8}$/.test(phone)) {
      return new Response(JSON.stringify({ message: 'Enter a valid Kenyan phone number.', code: 'VALIDATION' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const adminClient = createAdminClient()

    // Create auth user using admin client
    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: false,
      user_metadata: { full_name: fullName },
    })

    if (authError) {
      if (authError.message.toLowerCase().includes('already registered')) {
        return new Response(JSON.stringify({ message: 'That email is already registered. Sign in instead.', code: 'EMAIL_TAKEN' }), {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ message: authError.message, code: 'AUTH' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const userId = authData.user.id

    // Create member record
    const { error: memberError } = await adminClient.from('members').insert({
      id: userId,
      full_name: fullName,
      phone,
      id_number: idNumber || null,
      email: email.toLowerCase(),
      status: 'active',
    })

    if (memberError) {
      return new Response(JSON.stringify({ message: memberError.message, code: 'DB_ERROR' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Audit log
    await logAudit(adminClient, {
      actor_id: userId,
      action: 'registered',
      resource: 'member',
      resource_id: userId,
    })

    // Send welcome email (non-blocking)
    const welcomeHtml = buildEmailTemplate(
      'Welcome to Luma Welfare!',
      `Hello ${fullName},\n\nWelcome to Luma Welfare — your community welfare management platform.\n\nYour account has been created successfully. Here's what to do next:\n\n1. Check your email (${email}) to confirm your address\n2. Sign in to your account\n3. Pay the one-time KSh 300 activation fee\n4. Explore and join available welfare packages\n\nIf you have any questions, visit our FAQ page or contact support.\n\nBest regards,\nLuma Welfare Team`,
      'Sign In',
      'https://luma-welfare.vercel.app/login',
    )
    // Don't await — fire and forget so registration isn't delayed
    sendEmail(email, 'Welcome to Luma Welfare!', welcomeHtml).catch((e) => {
      console.error('Welcome email failed:', e instanceof Error ? e.message : e)
    })

    // Create registration fee record (KSh 300 one-time)
    const { error: feeError } = await adminClient.from('registration_fees').insert({
      member_id: userId,
      fee_type: 'registration',
      amount: 300,
      currency: 'KES',
      status: 'unpaid',
    })
    if (feeError) {
      console.error('Failed to create registration fee record:', feeError.message)
    }

    return new Response(JSON.stringify({
      message: 'Account created. Check your email to confirm your address. Once confirmed, sign in and pay the KSh 300 registration fee to activate your membership and access welfare packages.',
      userId,
    }), {
      status: 201,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ message: 'Internal server error', code: 'INTERNAL' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
