/**
 * admin-notifications — Admin notification bell for report failures and system alerts
 *
 * GET  /admin-notifications              — list admin notifications (newest first)
 * GET  /admin-notifications?unread=true  — count only unread
 * PATCH /admin-notifications?id=xxx      — mark as read
 * PATCH /admin-notifications?read_all=true — mark all as read
 */

import { handleCors, corsHeaders } from '../shared/cors.ts'
import { getAuthenticatedUser, createAdminClient, loadAdminSession } from '../shared/supabase.ts'

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
        .select('id, channel, subject, body, status, created_at, sent_at')
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
    return new Response(JSON.stringify({ message: err instanceof Error ? err.message : 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
