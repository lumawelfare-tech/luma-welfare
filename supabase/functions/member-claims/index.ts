import { handleCors, corsHeaders } from '../shared/cors.ts'
import { getAuthenticatedUser, createAdminClient, logAudit } from '../shared/supabase.ts'

/**
 * Member Claims — Submit, List, Detail, Document Upload
 *
 * GET    /member-claims                    — list member's own claims
 * POST   /member-claims                    — submit a new claim
 * GET    /member-claims?id=xxx             — get specific claim with documents
 * PATCH  /member-claims?id=xxx             — submit a draft claim (Draft → Submitted)
 * POST   /member-claims/upload?claimId=xxx — upload document for a claim
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
    const claimId = url.searchParams.get('id')
    const uploadClaimId = url.searchParams.get('claimId')

    // GET — list member's claims
    if (req.method === 'GET' && !claimId) {
      const { data, error } = await adminClient
        .from('claims')
        .select('id, claim_number, claim_type, amount_requested, status, description, created_at, submitted_at, decided_at, admin_notes, packages(code, name)')
        .eq('member_id', user.id)
        .order('created_at', { ascending: false })

      if (error) throw new Error(error.message)
      return new Response(JSON.stringify({ claims: data ?? [] }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // GET — specific claim with documents
    if (req.method === 'GET' && claimId) {
      const { data: claim, error } = await adminClient
        .from('claims')
        .select('*, packages(code, name)')
        .eq('id', claimId)
        .eq('member_id', user.id)
        .single()

      if (error) throw new Error('Claim not found')
      const { data: documents } = await adminClient
        .from('claim_documents')
        .select('*')
        .eq('claim_id', claim.id)

      return new Response(JSON.stringify({ claim, documents: documents ?? [] }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // PATCH — submit a draft claim (Draft → Submitted)
    if (req.method === 'PATCH' && claimId) {
      const body = await req.json()
      const { status: newStatus, description, amountRequested } = body

      if (newStatus !== 'Submitted') {
        return new Response(JSON.stringify({ message: 'Only draft-to-submitted transition is supported' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { data: claim, error: fetchErr } = await adminClient
        .from('claims')
        .select('id, status, member_id')
        .eq('id', claimId)
        .eq('member_id', user.id)
        .single()

      if (fetchErr || !claim) {
        return new Response(JSON.stringify({ message: 'Claim not found' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      if (claim.status !== 'Draft') {
        return new Response(JSON.stringify({ message: 'Only draft claims can be submitted' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const updates: Record<string, unknown> = {
        status: 'Submitted',
        submitted_at: new Date().toISOString(),
      }
      if (description) updates.description = description
      if (amountRequested != null) updates.amount_requested = amountRequested

      const { data: updated, error: updateErr } = await adminClient
        .from('claims')
        .update(updates)
        .eq('id', claimId)
        .select()
        .single()

      if (updateErr) throw new Error(updateErr.message)

      await logAudit(adminClient, {
        actor_id: user.id,
        action: 'claim_submitted',
        resource: 'claim',
        resource_id: claimId,
        meta: { claim_number: updated.claim_number },
      })

      return new Response(JSON.stringify({ claim: updated }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // POST — upload document for a claim
    if (req.method === 'POST' && uploadClaimId) {
      // Verify claim belongs to this member
      const { data: claim, error: claimErr } = await adminClient
        .from('claims')
        .select('id, member_id, status')
        .eq('id', uploadClaimId)
        .eq('member_id', user.id)
        .single()

      if (claimErr || !claim) {
        return new Response(JSON.stringify({ message: 'Claim not found' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Allow upload on Draft or Submitted claims (for additional docs)
      if (claim.status === 'Rejected' || claim.status === 'Paid') {
        return new Response(JSON.stringify({ message: 'Cannot upload documents to this claim' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const body = await req.json()
      const { fileName, fileData, fileType, documentType } = body

      if (!fileName || !fileData) {
        return new Response(JSON.stringify({ message: 'fileName and fileData (base64) are required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Validate file size (base64 decoded size < 10MB)
      const decodedSize = Math.ceil((fileData.length * 3) / 4)
      if (decodedSize > 10 * 1024 * 1024) {
        return new Response(JSON.stringify({ message: 'File size exceeds 10MB limit' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Decode base64
      const binaryStr = atob(fileData)
      const bytes = new Uint8Array(binaryStr.length)
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i)
      }

      // Generate safe storage path
      const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
      const storagePath = `${claimId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`

      // Upload to Supabase Storage
      const { error: uploadErr } = await adminClient.storage
        .from('claim-documents')
        .upload(storagePath, bytes, {
          contentType: fileType || 'application/octet-stream',
          upsert: false,
        })

      if (uploadErr) {
        throw new Error(`Storage upload failed: ${uploadErr.message}`)
      }

      // Get public URL
      const { data: urlData } = adminClient.storage
        .from('claim-documents')
        .getPublicUrl(storagePath)

      // Save document record
      const { data: doc, error: docErr } = await adminClient
        .from('claim_documents')
        .insert({
          claim_id: claimId,
          file_name: fileName,
          file_url: urlData.publicUrl,
          file_type: fileType || null,
          size_bytes: decodedSize,
          uploaded_by: user.id,
          document_type: documentType || 'supporting_document',
        })
        .select()
        .single()

      if (docErr) throw new Error(docErr.message)

      await logAudit(adminClient, {
        actor_id: user.id,
        action: 'document_uploaded',
        resource: 'claim_document',
        resource_id: doc.id,
        meta: { claim_id: claimId, file_name: fileName },
      })

      return new Response(JSON.stringify({ document: doc }), {
        status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // POST — submit new claim (creates as Draft or Submitted)
    if (req.method === 'POST' && !uploadClaimId) {
      const body = await req.json()
      const { subscriptionId, claimType, description, amountRequested, submit } = body

      if (!subscriptionId || !claimType) {
        return new Response(JSON.stringify({ message: 'subscriptionId and claimType are required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Verify subscription belongs to this member and is active
      const { data: sub, error: subErr } = await adminClient
        .from('subscriptions')
        .select('id, package_id, status, member_id')
        .eq('id', subscriptionId)
        .eq('member_id', user.id)
        .single()

      if (subErr || !sub) {
        return new Response(JSON.stringify({ message: 'Subscription not found', code: 'NOT_FOUND' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      if (sub.status !== 'active') {
        return new Response(JSON.stringify({ message: 'Only active subscriptions can file claims', code: 'SUBSCRIPTION_INACTIVE' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Check qualification — member must be eligible
      const { data: qual } = await adminClient
        .from('qualifications')
        .select('status')
        .eq('subscription_id', subscriptionId)
        .eq('member_id', user.id)
        .maybeSingle()

      if (qual && qual.status !== 'eligible') {
        return new Response(JSON.stringify({ message: 'You are not yet eligible to file a claim for this package', code: 'NOT_ELIGIBLE' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Generate claim number
      const claimNumber = `CLM-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`

      const isSubmit = submit === true
      const { data: claim, error: claimErr } = await adminClient
        .from('claims')
        .insert({
          claim_number: claimNumber,
          member_id: user.id,
          subscription_id: subscriptionId,
          package_id: sub.package_id,
          claim_type: claimType,
          description: description || null,
          amount_requested: amountRequested ?? null,
          status: isSubmit ? 'Submitted' : 'Draft',
          submitted_at: isSubmit ? new Date().toISOString() : null,
        })
        .select()
        .single()

      if (claimErr) throw new Error(claimErr.message)

      await logAudit(adminClient, {
        actor_id: user.id,
        action: isSubmit ? 'claim_submitted' : 'claim_created',
        resource: 'claim',
        resource_id: claim.id,
        meta: { claim_number: claimNumber, claim_type: claimType, package_id: sub.package_id },
      })

      return new Response(JSON.stringify({ claim }), {
        status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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
