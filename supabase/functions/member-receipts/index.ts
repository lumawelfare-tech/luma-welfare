import { handleCors, corsHeaders } from '../shared/cors.ts'
import { getAuthenticatedUser, createAdminClient } from '../shared/supabase.ts'

/**
 * Member Receipts & Statements
 *
 * GET /member-receipts/transactions   — list all financial transactions
 * GET /member-receipts/receipt?id=xxx  — generate receipt data for a transaction
 * GET /member-receipts/statement       — generate statement data
 */

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
    const url = new URL(req.url)
    const action = url.searchParams.get('action') ?? 'transactions'

    // GET /member-receipts/transactions — list all financial transactions
    if (req.method === 'GET' && action === 'transactions') {
      // Get member info
      const { data: member } = await adminClient
        .from('members')
        .select('full_name, email, phone, membership_number')
        .eq('id', user.id)
        .single()

      // Get registration fee
      const { data: regFee } = await adminClient
        .from('registration_fees')
        .select('id, amount, currency, status, payment_method, mpesa_receipt, transaction_reference, paid_at, created_at')
        .eq('member_id', user.id)
        .eq('fee_type', 'registration')
        .maybeSingle()

      // Get contributions
      const { data: contributions } = await adminClient
        .from('contributions')
        .select('id, period, amount, status, payment_id, created_at, packages(code, name), payments(mpesa_receipt, channel)')
        .eq('member_id', user.id)
        .order('created_at', { ascending: false })

      // Get claims (for reference)
      const { data: claims } = await adminClient
        .from('claims')
        .select('id, claim_number, claim_type, amount_requested, status, created_at, decided_at, packages(code, name)')
        .eq('member_id', user.id)
        .order('created_at', { ascending: false })

      // Build unified transaction list
      const transactions: Array<{
        id: string
        type: string
        description: string
        package: string | null
        amount: number
        currency: string
        status: string
        payment_method: string | null
        reference: string | null
        date: string
      }> = []

      if (regFee) {
        transactions.push({
          id: regFee.id,
          type: 'Registration Fee',
          description: 'One-time registration fee',
          package: null,
          amount: regFee.amount,
          currency: regFee.currency,
          status: regFee.status,
          payment_method: regFee.payment_method,
          reference: regFee.mpesa_receipt ?? regFee.transaction_reference,
          date: regFee.created_at,
        })
      }

      for (const c of contributions ?? []) {
        transactions.push({
          id: c.id,
          type: 'Contribution',
          description: `Monthly contribution for ${c.period}`,
          package: (c.packages as unknown as { name: string })?.name ?? null,
          amount: c.amount,
          currency: 'KES',
          status: c.status,
          payment_method: (c.payments as unknown as { channel: string })?.channel ?? 'manual',
          reference: (c.payments as unknown as { mpesa_receipt: string })?.mpesa_receipt ?? null,
          date: c.created_at,
        })
      }

      for (const cl of claims ?? []) {
        transactions.push({
          id: cl.id,
          type: 'Claim',
          description: cl.claim_number,
          package: (cl.packages as unknown as { name: string })?.name ?? null,
          amount: cl.amount_requested ?? 0,
          currency: 'KES',
          status: cl.status,
          payment_method: null,
          reference: cl.claim_number,
          date: cl.created_at,
        })
      }

      // Sort by date descending
      transactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

      return new Response(JSON.stringify({ member, transactions }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // GET /member-receipts/receipt?id=xxx — receipt data for a specific transaction
    if (req.method === 'GET' && action === 'receipt') {
      const transactionId = url.searchParams.get('id')
      if (!transactionId) {
        return new Response(JSON.stringify({ message: 'Transaction ID required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { data: member } = await adminClient
        .from('members')
        .select('full_name, email, phone, membership_number')
        .eq('id', user.id)
        .single()

      // Try registration fee
      const { data: regFee } = await adminClient
        .from('registration_fees')
        .select('*')
        .eq('id', transactionId)
        .eq('member_id', user.id)
        .maybeSingle()

      if (regFee) {
        return new Response(JSON.stringify({
          receipt: {
            type: 'Registration Fee',
            number: `RF-${regFee.id.slice(0, 8).toUpperCase()}`,
            member,
            amount: regFee.amount,
            currency: regFee.currency,
            status: regFee.status,
            payment_method: regFee.payment_method,
            reference: regFee.mpesa_receipt ?? regFee.transaction_reference,
            date: regFee.paid_at ?? regFee.created_at,
            package: null,
          }
        }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      // Try contribution
      const { data: contrib } = await adminClient
        .from('contributions')
        .select('*, packages(name), payments(mpesa_receipt, channel)')
        .eq('id', transactionId)
        .eq('member_id', user.id)
        .maybeSingle()

      if (contrib) {
        return new Response(JSON.stringify({
          receipt: {
            type: 'Contribution',
            number: `CTR-${contrib.id.slice(0, 8).toUpperCase()}`,
            member,
            amount: contrib.amount,
            currency: 'KES',
            status: contrib.status,
            payment_method: (contrib.payments as unknown as { channel: string })?.channel ?? 'manual',
            reference: (contrib.payments as unknown as { mpesa_receipt: string })?.mpesa_receipt ?? null,
            date: contrib.created_at,
            package: (contrib.packages as unknown as { name: string })?.name ?? null,
            period: contrib.period,
          }
        }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      return new Response(JSON.stringify({ message: 'Transaction not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
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
