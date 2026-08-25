import { handleCors, corsHeaders } from '../shared/cors.ts'
import { getAuthenticatedUser, createAdminClient, loadAdminSession, logAudit } from '../shared/supabase.ts'

/**
 * Admin 2FA — TOTP-based two-factor authentication
 *
 * GET    /admin-2fa              — get 2FA status
 * POST   /admin-2fa?action=setup — generate TOTP secret + QR code URL
 * POST   /admin-2fa?action=enable — verify TOTP code and enable 2FA
 * POST   /admin-2fa?action=disable — disable 2FA (requires current TOTP)
 * POST   /admin-2fa?action=verify — verify TOTP during login (called by auth-login)
 */

// Simple TOTP implementation using HMAC-SHA1
// Based on RFC 6238 (TOTP) and RFC 4226 (HOTP)

function base32Decode(encoded: string): Uint8Array {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const cleaned = encoded.replace(/[^A-Z2-7]/gi, '').toUpperCase()
  let bits = ''
  for (const char of cleaned) {
    const val = alphabet.indexOf(char)
    if (val === -1) continue
    bits += val.toString(2).padStart(5, '0')
  }
  const bytes = new Uint8Array(Math.floor(bits.length / 8))
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2)
  }
  return bytes
}

function base32Encode(buffer: Uint8Array): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = ''
  for (const byte of buffer) {
    bits += byte.toString(2).padStart(8, '0')
  }
  let result = ''
  for (let i = 0; i < bits.length; i += 5) {
    const chunk = bits.slice(i, i + 5).padEnd(5, '0')
    result += alphabet[parseInt(chunk, 2)]
  }
  return result
}

function generateSecret(): string {
  const bytes = new Uint8Array(20)
  crypto.getRandomValues(bytes)
  return base32Encode(bytes)
}

async function hmacSha1(key: Uint8Array, message: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'])
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, message)
  return new Uint8Array(signature)
}

function intToBytes(num: number): Uint8Array {
  const bytes = new Uint8Array(8)
  for (let i = 7; i >= 0; i--) {
    bytes[i] = num & 0xff
    num = Math.floor(num / 256)
  }
  return bytes
}

async function generateTOTP(secret: string, timeStep: number = 30, digits: number = 6): Promise<string> {
  const key = base32Decode(secret)
  const counter = Math.floor(Date.now() / 1000 / timeStep)
  const message = intToBytes(counter)
  const hash = await hmacSha1(key, message)
  const offset = hash[hash.length - 1] & 0x0f
  const code = (
    ((hash[offset] & 0x7f) << 24) |
    ((hash[offset + 1] & 0xff) << 16) |
    ((hash[offset + 2] & 0xff) << 8) |
    (hash[offset + 3] & 0xff)
  ) % Math.pow(10, digits)
  return code.toString().padStart(digits, '0')
}

async function verifyTOTP(secret: string, token: string, window: number = 1): Promise<boolean> {
  const timeStep = 30
  const counter = Math.floor(Date.now() / 1000 / timeStep)
  for (let i = -window; i <= window; i++) {
    const key = base32Decode(secret)
    const message = intToBytes(counter + i)
    const hash = await hmacSha1(key, message)
    const offset = hash[hash.length - 1] & 0x0f
    const code = (
      ((hash[offset] & 0x7f) << 24) |
      ((hash[offset + 1] & 0xff) << 16) |
      ((hash[offset + 2] & 0xff) << 8) |
      (hash[offset + 3] & 0xff)
    ) % 1000000
    if (code.toString().padStart(6, '0') === token) return true
  }
  return false
}

function generateRecoveryCodes(): string[] {
  const codes: string[] = []
  for (let i = 0; i < 8; i++) {
    const bytes = new Uint8Array(4)
    crypto.getRandomValues(bytes)
    const code = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
    codes.push(code.slice(0, 4) + '-' + code.slice(4))
  }
  return codes
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const user = await getAuthenticatedUser(req)
    if (!user) {
      return new Response(JSON.stringify({ message: 'Not authenticated', code: 'UNAUTHORIZED' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const adminClient = createAdminClient()
    const session = await loadAdminSession(adminClient, user.id)
    if (!session) {
      return new Response(JSON.stringify({ message: 'No admin access', code: 'FORBIDDEN' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const url = new URL(req.url)
    const action = url.searchParams.get('action')

    // GET — 2FA status
    if (req.method === 'GET') {
      const { data: admin } = await adminClient
        .from('admins')
        .select('two_factor_enabled')
        .eq('id', user.id)
        .single()

      return new Response(JSON.stringify({
        two_factor_enabled: admin?.two_factor_enabled ?? false,
      }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // POST
    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}))

      // POST?action=setup — generate TOTP secret
      if (action === 'setup') {
        // Check if already enabled
        const { data: admin } = await adminClient
          .from('admins')
          .select('two_factor_enabled')
          .eq('id', user.id)
          .single()

        if (admin?.two_factor_enabled) {
          return new Response(JSON.stringify({ message: '2FA is already enabled. Disable it first.' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }

        const secret = generateSecret()
        const issuer = 'Luma Welfare'
        const accountName = session.display_name || user.email || user.id
        const otpauthUrl = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(accountName)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`

        // Store the pending secret (not yet enabled)
        await adminClient
          .from('admins')
          .update({ two_factor_secret: secret })
          .eq('id', user.id)

        // Generate current TOTP for verification
        const currentCode = await generateTOTP(secret)

        return new Response(JSON.stringify({
          secret,
          otpauth_url: otpauthUrl,
          current_code: currentCode,
          message: 'Scan the QR code or enter the secret in your authenticator app, then verify with the current code.',
        }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // POST?action=enable — verify TOTP and enable 2FA
      if (action === 'enable') {
        const { code } = body
        if (!code || code.length !== 6) {
          return new Response(JSON.stringify({ message: 'Please enter the 6-digit verification code.' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }

        const { data: admin } = await adminClient
          .from('admins')
          .select('two_factor_secret, two_factor_enabled')
          .eq('id', user.id)
          .single()

        if (admin?.two_factor_enabled) {
          return new Response(JSON.stringify({ message: '2FA is already enabled.' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }

        if (!admin?.two_factor_secret) {
          return new Response(JSON.stringify({ message: 'No pending 2FA setup. Run setup first.' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }

        const valid = await verifyTOTP(admin.two_factor_secret, code)
        if (!valid) {
          return new Response(JSON.stringify({ message: 'Invalid verification code. Please try again.' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }

        // Generate recovery codes
        const recoveryCodes = generateRecoveryCodes()

        await adminClient
          .from('admins')
          .update({
            two_factor_enabled: true,
            two_factor_recovery_codes: recoveryCodes,
          })
          .eq('id', user.id)

        await logAudit(adminClient, {
          actor_id: session.id,
          actor_role: session.role_name,
          action: 'enabled_2fa',
          resource: 'admin',
          resource_id: user.id,
        })

        return new Response(JSON.stringify({
          message: '2FA enabled successfully.',
          recovery_codes: recoveryCodes,
        }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // POST?action=disable — disable 2FA
      if (action === 'disable') {
        const { code } = body
        if (!code || code.length !== 6) {
          return new Response(JSON.stringify({ message: 'Please enter a valid 6-digit code or recovery code.' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }

        const { data: admin } = await adminClient
          .from('admins')
          .select('two_factor_secret, two_factor_enabled, two_factor_recovery_codes')
          .eq('id', user.id)
          .single()

        if (!admin?.two_factor_enabled) {
          return new Response(JSON.stringify({ message: '2FA is not enabled.' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }

        // Check TOTP code
        let valid = false
        if (admin.two_factor_secret) {
          valid = await verifyTOTP(admin.two_factor_secret, code)
        }

        // Check recovery codes if TOTP didn't match
        if (!valid && admin.two_factor_recovery_codes) {
          const codes = admin.two_factor_recovery_codes as string[]
          const idx = codes.indexOf(code)
          if (idx !== -1) {
            valid = true
            // Remove used recovery code
            codes.splice(idx, 1)
            await adminClient
              .from('admins')
              .update({ two_factor_recovery_codes: codes })
              .eq('id', user.id)
          }
        }

        if (!valid) {
          return new Response(JSON.stringify({ message: 'Invalid code. Please enter a valid TOTP code or recovery code.' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }

        await adminClient
          .from('admins')
          .update({
            two_factor_enabled: false,
            two_factor_secret: null,
            two_factor_recovery_codes: null,
          })
          .eq('id', user.id)

        await logAudit(adminClient, {
          actor_id: session.id,
          actor_role: session.role_name,
          action: 'disabled_2fa',
          resource: 'admin',
          resource_id: user.id,
        })

        return new Response(JSON.stringify({ message: '2FA disabled successfully.' }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // POST?action=verify — verify TOTP during login (called by auth-login)
      if (action === 'verify') {
        const { code, userId } = body
        const targetUserId = userId || user.id

        if (!code) {
          return new Response(JSON.stringify({ message: 'Verification code is required.' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }

        const { data: admin } = await adminClient
          .from('admins')
          .select('two_factor_secret, two_factor_enabled, two_factor_recovery_codes')
          .eq('id', targetUserId)
          .single()

        if (!admin?.two_factor_enabled) {
          return new Response(JSON.stringify({ verified: true, message: '2FA not enabled.' }), {
            status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }

        // Check TOTP
        let valid = false
        if (admin.two_factor_secret) {
          valid = await verifyTOTP(admin.two_factor_secret, code)
        }

        // Check recovery codes
        if (!valid && admin.two_factor_recovery_codes) {
          const codes = admin.two_factor_recovery_codes as string[]
          const idx = codes.indexOf(code)
          if (idx !== -1) {
            valid = true
            codes.splice(idx, 1)
            await adminClient
              .from('admins')
              .update({ two_factor_recovery_codes: codes })
              .eq('id', targetUserId)
          }
        }

        if (!valid) {
          return new Response(JSON.stringify({ verified: false, message: 'Invalid verification code.' }), {
            status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }

        return new Response(JSON.stringify({ verified: true, message: 'Verification successful.' }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    return new Response(JSON.stringify({ message: 'Method not allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ message: err instanceof Error ? err.message : 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
