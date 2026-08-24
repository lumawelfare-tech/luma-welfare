import { handleCors, corsHeaders } from '../shared/cors.ts'
import { createAdminClient, logAudit } from '../shared/supabase.ts'

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

    return new Response(JSON.stringify({
      message: 'Account created. Check your email to confirm your address. Once your email is confirmed, you can sign in, explore available packages, and choose the package that best suits you.',
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
