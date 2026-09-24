import { handleCors, corsHeaders } from '../shared/cors.ts'
import { getAuthenticatedUser, createAdminClient, logAudit, handleUnexpectedError } from '../shared/supabase.ts'
import { detectAllowedUpload } from '../shared/file-upload.ts'
import { rateLimitAsync } from '../shared/rate-limit.ts'
import {
  MEMBER_DOC_BUCKET,
  signPrivateStorageUrl,
  PRIVATE_SIGNED_URL_TTL_SECONDS,
} from '../shared/storage-signed.ts'
import {
  parseIdentityDocumentType,
  parseUuid,
  ValidationError,
} from '../shared/validate.ts'
import { maskIdNumberLast4 } from '../shared/pii.ts'

const MAX_BYTES = 10 * 1024 * 1024

function folderForType(docType: string): string {
  if (docType === 'kra_certificate' || docType === 'beneficiary_kra') return 'tax'
  if (docType.startsWith('beneficiary_')) return 'family'
  return 'identity'
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
    const url = new URL(req.url)
    const action = url.searchParams.get('action')

    if (req.method === 'GET') {
      const { data, error } = await adminClient
        .from('member_documents')
        .select('id, document_type, family_member_id, original_filename, mime_type, size_bytes, verification_status, rejection_reason, is_current, created_at, expires_at')
        .eq('member_id', user.id)
        .eq('is_current', true)
        .order('created_at', { ascending: false })
      if (error) throw new Error(error.message)
      const { data: member } = await adminClient
        .from('members')
        .select('id_number, kra_pin')
        .eq('id', user.id)
        .maybeSingle()
      return new Response(JSON.stringify({
        documents: data ?? [],
        id_number_masked: maskIdNumberLast4(member?.id_number ?? null),
        kra_pin_masked: maskIdNumberLast4(member?.kra_pin ?? null),
      }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (req.method === 'POST' && action === 'download') {
      const body = await req.json()
      const docId = parseUuid(body.documentId ?? body.document_id, 'document')
      const { data: doc, error } = await adminClient
        .from('member_documents')
        .select('id, storage_path, member_id')
        .eq('id', docId)
        .eq('member_id', user.id)
        .maybeSingle()
      if (error || !doc) {
        return new Response(JSON.stringify({ message: 'Document not found', code: 'NOT_FOUND' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const signed = await signPrivateStorageUrl(adminClient, MEMBER_DOC_BUCKET, doc.storage_path)
      if (!signed) {
        return new Response(JSON.stringify({ message: 'Could not create a download link.', code: 'INTERNAL' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      await logAudit(adminClient, {
        actor_id: user.id,
        action: 'member_document_downloaded',
        resource: 'member_document',
        resource_id: doc.id,
      })
      return new Response(JSON.stringify({
        file_url: signed,
        signed_url_expires_in: PRIVATE_SIGNED_URL_TTL_SECONDS,
      }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (req.method === 'POST') {
      const rl = await rateLimitAsync(req, 'member-identity-docs', { userId: user.id, adminClient })
      if (!rl.ok) return rl.response!

      const body = await req.json()
      const documentType = parseIdentityDocumentType(body.documentType ?? body.document_type)
      let familyMemberId: string | null = null
      const famRaw = body.familyMemberId ?? body.family_member_id
      if (famRaw != null && famRaw !== '') {
        familyMemberId = parseUuid(famRaw, 'family member')
        const { data: fam } = await adminClient
          .from('family_members')
          .select('id')
          .eq('id', familyMemberId)
          .eq('member_id', user.id)
          .eq('is_active', true)
          .maybeSingle()
        if (!fam) {
          return new Response(JSON.stringify({ message: 'Family member not found.', code: 'NOT_FOUND' }), {
            status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
      }
      if ((documentType === 'beneficiary_id' || documentType === 'beneficiary_kra') && !familyMemberId) {
        throw new ValidationError('A family member is required for beneficiary documents.')
      }

      const rawB64 = typeof body.fileBase64 === 'string' ? body.fileBase64 : ''
      const comma = rawB64.indexOf(',')
      const b64 = comma >= 0 ? rawB64.slice(comma + 1) : rawB64
      if (!b64) throw new ValidationError('A PDF file is required.')
      const binary = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
      if (binary.byteLength > MAX_BYTES) throw new ValidationError('File must be 10MB or smaller.')
      const detected = detectAllowedUpload(binary)
      if (!detected || detected.kind !== 'pdf') {
        throw new ValidationError('Only PDF files are accepted for identity documents.')
      }

      const objectName = `${user.id}/${folderForType(documentType)}/${crypto.randomUUID()}.pdf`
      const { error: upErr } = await adminClient.storage
        .from(MEMBER_DOC_BUCKET)
        .upload(objectName, binary, { contentType: 'application/pdf', upsert: false })
      if (upErr) throw new Error(upErr.message)

      let prevQ = adminClient
        .from('member_documents')
        .select('id')
        .eq('member_id', user.id)
        .eq('document_type', documentType)
        .eq('is_current', true)
      prevQ = familyMemberId
        ? prevQ.eq('family_member_id', familyMemberId)
        : prevQ.is('family_member_id', null)
      const { data: previous } = await prevQ
      const prevIds = (previous ?? []).map((r: { id: string }) => r.id)
      if (prevIds.length) {
        await adminClient
          .from('member_documents')
          .update({ is_current: false, verification_status: 'superseded' })
          .in('id', prevIds)
      }

      const original = typeof body.fileName === 'string' ? body.fileName.replace(/[^\w.\- ]+/g, '').slice(0, 180) : 'document.pdf'
      const { data: inserted, error: insErr } = await adminClient
        .from('member_documents')
        .insert({
          member_id: user.id,
          family_member_id: familyMemberId,
          document_type: documentType,
          storage_path: objectName,
          original_filename: original || 'document.pdf',
          mime_type: 'application/pdf',
          size_bytes: binary.byteLength,
          uploaded_by: user.id,
          verification_status: 'pending',
          is_current: true,
          supersedes_id: prevIds[0] ?? null,
        })
        .select('id, document_type, family_member_id, verification_status, created_at, original_filename')
        .single()
      if (insErr) throw new Error(insErr.message)

      await logAudit(adminClient, {
        actor_id: user.id,
        action: 'member_document_uploaded',
        resource: 'member_document',
        resource_id: inserted.id,
        meta: { document_type: documentType, family_member_id: familyMemberId },
      })

      return new Response(JSON.stringify({ document: inserted }), {
        status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ message: 'Method not allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    if (err instanceof ValidationError) {
      return new Response(JSON.stringify({ message: err.message, code: 'VALIDATION' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    return handleUnexpectedError(err, 'member-identity-docs')
  }
})
