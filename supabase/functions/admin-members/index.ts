import { handleCors, corsHeaders } from '../shared/cors.ts'
import { getAuthenticatedUser, createAdminClient, loadAdminSession, requirePermission, logAudit } from '../shared/supabase.ts'

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
    const resourceId = url.searchParams.get('resource_id')
    const action = url.searchParams.get('action')

    // GET /admin-members — list members with optimized search
    if (req.method === 'GET' && !resourceId) {
      requirePermission(session, 'members', 'read')
      const status = url.searchParams.get('status')
      const q = url.searchParams.get('q')
      const page = parseInt(url.searchParams.get('page') || '1')
      const perPage = Math.min(parseInt(url.searchParams.get('per_page') || '50'), 200)

      // Use RPC for server-side indexed search with pagination
      const { data, error } = await adminClient.rpc('admin_search_members', {
        p_q: q || null,
        p_status: status || null,
        p_page: page,
        p_per_page: perPage,
      })

      if (error) throw new Error(error.message)

      const result = data?.[0] ?? { members: [], total: 0, page, per_page: perPage, pages: 1 }
      return new Response(JSON.stringify({
        members: result.members ?? [],
        total: Number(result.total) ?? 0,
        page: result.page ?? page,
        per_page: result.per_page ?? perPage,
        pages: result.pages ?? 1,
      }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // GET /admin-members?resource_id=xxx — get member detail
    if (req.method === 'GET' && resourceId) {
      requirePermission(session, 'members', 'read')
      const { data: member, error } = await adminClient
        .from('members')
        .select('*')
        .eq('id', resourceId)
        .single()
      if (error) throw new Error('Member not found')

      const [subs, family, contribs] = await Promise.all([
        adminClient.from('subscriptions').select('id, status, started_at, next_due_date, package_id, packages(code, name), package_tiers(name, amount)').eq('member_id', resourceId),
        adminClient.from('family_members').select('*').eq('member_id', resourceId).eq('is_active', true),
        adminClient.from('contributions').select('id, period, amount, status, package_id, created_at').eq('member_id', resourceId).order('period', { ascending: false }),
      ])

      return new Response(JSON.stringify({
        member,
        subscriptions: subs.data ?? [],
        family_members: family.data ?? [],
        contributions: contribs.data ?? [],
      }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // PATCH /admin-members?resource_id=xxx — approve/suspend/close member
    if (req.method === 'PATCH' && resourceId) {
      requirePermission(session, 'members', 'approve')
      const body = await req.json()
      const { status: memberStatus } = body
      if (!['active', 'suspended', 'closed'].includes(memberStatus)) {
        return new Response(JSON.stringify({ message: 'Invalid status', code: 'VALIDATION' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const now = new Date().toISOString()
      const { data, error } = await adminClient
        .from('members')
        .update({
          status: memberStatus,
          approved_at: memberStatus === 'active' ? now : undefined,
          approved_by: memberStatus === 'active' ? session.id : undefined,
        })
        .eq('id', resourceId)
        .select()
        .single()
      if (error) throw new Error('Member not found')

      await logAudit(adminClient, {
        actor_id: session.id,
        actor_role: session.role_name,
        action: `member_${memberStatus}`,
        resource: 'member',
        resource_id: resourceId,
        meta: { by: session.display_name },
      })

      return new Response(JSON.stringify({ member: data }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // DELETE /admin-members?resource_id=xxx — soft-delete (deactivate) member
    if (req.method === 'DELETE' && resourceId) {
      requirePermission(session, 'members', 'delete')

      if (resourceId === user.id) {
        return new Response(JSON.stringify({ message: 'Administrators cannot delete their own account', code: 'SELF_DELETE_BLOCKED' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { data: targetAdmin } = await adminClient
        .from('admins')
        .select('id, display_name')
        .eq('id', resourceId)
        .maybeSingle()
      if (targetAdmin) {
        return new Response(JSON.stringify({ message: 'Cannot delete an administrator account through member management', code: 'ADMIN_DELETE_BLOCKED' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { data: member, error } = await adminClient
        .from('members')
        .update({ status: 'closed', updated_at: new Date().toISOString() })
        .eq('id', resourceId)
        .select('id, full_name, email')
        .single()
      if (error) throw new Error('Member not found')

      await logAudit(adminClient, {
        actor_id: session.id,
        actor_role: session.role_name,
        action: 'member.deleted',
        resource: 'member',
        resource_id: resourceId,
        meta: { member_name: member.full_name, by: session.display_name },
      })

      return new Response(JSON.stringify({ message: 'Member deactivated', member }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // POST /admin-members?action=import — bulk import members from CSV
    if (req.method === 'POST' && (action === 'import' || resourceId === 'import')) {
      requirePermission(session, 'members', 'create')
      const body = await req.json()
      const { members: importMembers } = body

      if (!Array.isArray(importMembers) || importMembers.length === 0) {
        return new Response(JSON.stringify({ message: 'No members to import.' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      if (importMembers.length > 100) {
        return new Response(JSON.stringify({ message: 'Maximum 100 members per import.' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const results: Array<{ row: number; email: string; status: 'success' | 'error'; message: string; member_id?: string }> = []

      for (let i = 0; i < importMembers.length; i++) {
        const row = importMembers[i]
        const rowNum = i + 2
        const email = (row.email ?? '').trim().toLowerCase()
        const fullName = (row.full_name ?? row.fullName ?? '').trim()
        const phone = (row.phone ?? '').trim()
        const idNumber = (row.id_number ?? row.idNumber ?? '').trim()

        if (!email || !fullName || !phone) {
          results.push({ row: rowNum, email, status: 'error', message: 'Missing required fields (email, full_name, phone).' })
          continue
        }

        const { data: existing } = await adminClient
          .from('members')
          .select('id, email')
          .eq('email', email)
          .maybeSingle()

        if (existing) {
          results.push({ row: rowNum, email, status: 'error', message: 'Member with this email already exists.' })
          continue
        }

        const tempPassword = `Luma${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

        try {
          const { data: authUser, error: authErr } = await adminClient.auth.admin.createUser({
            email,
            password: tempPassword,
            email_confirm: true,
            user_metadata: { full_name: fullName },
          })

          if (authErr || !authUser?.user) {
            results.push({ row: rowNum, email, status: 'error', message: authErr?.message ?? 'Failed to create auth user.' })
            continue
          }

          const { error: memberErr } = await adminClient
            .from('members')
            .insert({
              id: authUser.user.id,
              email,
              full_name: fullName,
              phone,
              id_number: idNumber || null,
              status: 'active',
              joined_at: new Date().toISOString(),
            })

          if (memberErr) {
            await adminClient.auth.admin.deleteUser(authUser.user.id)
            results.push({ row: rowNum, email, status: 'error', message: memberErr.message })
            continue
          }

          await adminClient
            .from('registration_fees')
            .insert({ member_id: authUser.user.id, fee_type: 'registration', amount: 300, currency: 'KES', status: 'unpaid' })

          results.push({ row: rowNum, email, status: 'success', message: 'Member created.', member_id: authUser.user.id })
        } catch (err) {
          results.push({ row: rowNum, email, status: 'error', message: err instanceof Error ? err.message : 'Unknown error.' })
        }
      }

      const successCount = results.filter(r => r.status === 'success').length
      const errorCount = results.filter(r => r.status === 'error').length

      await logAudit(adminClient, {
        actor_id: session.id,
        actor_role: session.role_name,
        action: 'members_bulk_import',
        resource: 'member',
        meta: { total: importMembers.length, success: successCount, errors: errorCount },
      })

      return new Response(JSON.stringify({
        message: `Import complete: ${successCount} created, ${errorCount} failed.`,
        results,
        summary: { total: importMembers.length, success: successCount, errors: errorCount },
      }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ message: 'Not found' }), {
      status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('admin-members error:', err)
    const message = err instanceof Error ? err.message : 'An unexpected error occurred.'
    const status = message.includes('not found') || message.includes('Not found') ? 404 : 500
    return new Response(JSON.stringify({ message, code: 'INTERNAL' }), {
      status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
