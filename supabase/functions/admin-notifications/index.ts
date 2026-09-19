/**
 * admin-notifications — Admin notification bell + member announcements
 *
 * GET  /admin-notifications              — list admin notifications (newest first)
 * GET  /admin-notifications?unread=true  — count only unread
 * PATCH /admin-notifications?id=xxx      — mark as read
 * PATCH /admin-notifications?read_all=true — mark all as read
 * POST /admin-notifications?action=announce — fan-out admin announcement to members
 */

import { handleCors, corsHeaders } from '../shared/cors.ts'
import {
  getAuthenticatedUser,
  createAdminClient,
  loadAdminSession,
  adminSessionDeniedResponse,
  logAudit,
  handleAdminError,
} from '../shared/supabase.ts'
import { sendNotification } from '../shared/notifications.ts'

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
    const loaded = await loadAdminSession(adminClient, user.id, { req })
    if (loaded.status !== 'ok') {
      return adminSessionDeniedResponse(loaded)
    }
    const session = loaded.session

    const url = new URL(req.url)

    // POST — publish announcement to members
    if (req.method === 'POST' && url.searchParams.get('action') === 'announce') {
      if (!session.is_superadmin) {
        const canNotify = session.permissions.has('notifications:create')
          || session.permissions.has('members:update')
          || session.permissions.has('notifications:write')
        if (!canNotify) {
          return new Response(JSON.stringify({ message: 'Forbidden', code: 'FORBIDDEN' }), {
            status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
      }

      const body = await req.json()
      const title = typeof body.title === 'string' ? body.title.trim() : ''
      const message = typeof body.body === 'string' ? body.body.trim() : ''
      if (!title || !message) {
        return new Response(JSON.stringify({ message: 'title and body are required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { data: announcement, error: annErr } = await adminClient
        .from('announcements')
        .insert({
          title,
          body: message,
          created_by: user.id,
          published_at: new Date().toISOString(),
        })
        .select('id')
        .single()

      if (annErr) throw new Error(annErr.message)

      const { data: members, error: memErr } = await adminClient
        .from('members')
        .select('id')
        .eq('status', 'active')

      if (memErr) throw new Error(memErr.message)

      let sent = 0
      for (const m of members ?? []) {
        const r = await sendNotification(adminClient, {
          memberId: m.id,
          type: 'admin_announcement',
          subject: title,
          body: message,
          meta: { announcementId: announcement.id },
          skipEmail: body.skipEmail === true,
        })
        if (r.inApp) sent++
      }

      await logAudit(adminClient, {
        actor_id: user.id,
        action: 'announcement_published',
        resource: 'announcement',
        resource_id: announcement.id,
        meta: { recipients: sent },
      })

      return new Response(JSON.stringify({
        announcement_id: announcement.id,
        recipients: sent,
      }), {
        status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // GET — list notifications or count unread
    if (req.method === 'GET') {
      const unreadOnly = url.searchParams.get('unread') === 'true'

      if (unreadOnly) {
        const { count, error } = await adminClient
          .from('notifications')
          .select('id', { count: 'exact', head: true })
          .eq('member_id', user.id)
          .eq('channel', 'admin')
          .eq('status', 'queued')

        if (error) throw new Error(error.message)
        return new Response(JSON.stringify({ unread_count: count ?? 0 }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { data, error } = await adminClient
        .from('notifications')
        .select('id, channel, subject, body, status, type, meta, created_at, sent_at')
        .eq('member_id', user.id)
        .eq('channel', 'admin')
        .order('created_at', { ascending: false })
        .limit(50)

      if (error) throw new Error(error.message)
      return new Response(JSON.stringify({ notifications: data ?? [] }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // PATCH — mark as read
    if (req.method === 'PATCH') {
      const markAll = url.searchParams.get('read_all') === 'true'
      const notifId = url.searchParams.get('id')

      if (markAll) {
        const { error } = await adminClient
          .from('notifications')
          .update({ status: 'sent', sent_at: new Date().toISOString() })
          .eq('member_id', user.id)
          .eq('channel', 'admin')
          .eq('status', 'queued')

        if (error) throw new Error(error.message)
        return new Response(JSON.stringify({ message: 'All notifications marked as read' }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      if (notifId) {
        const { error } = await adminClient
          .from('notifications')
          .update({ status: 'sent', sent_at: new Date().toISOString() })
          .eq('id', notifId)
          .eq('member_id', user.id)
          .eq('channel', 'admin')

        if (error) throw new Error(error.message)
        return new Response(JSON.stringify({ message: 'Notification marked as read' }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      return new Response(JSON.stringify({ message: 'Provide ?id=xxx or ?read_all=true' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ message: 'Method not allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return handleAdminError(err, 'admin-notifications')
  }
})
