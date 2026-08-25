import { handleCors, corsHeaders } from '../shared/cors.ts'
import { getAuthenticatedUser, createAdminClient } from '../shared/supabase.ts'

/**
 * Member Notifications
 *
 * GET  /member-notifications              — list member's notifications (newest first)
 * GET  /member-notifications?unread=true  — count only unread
 * PATCH /member-notifications?id=xxx      — mark as read
 * PATCH /member-notifications?read_all=true — mark all as read
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

    // GET — list notifications or count unread
    if (req.method === 'GET') {
      const unreadOnly = url.searchParams.get('unread') === 'true'

      if (unreadOnly) {
        // Just return the unread count
        const { count, error } = await adminClient
          .from('notifications')
          .select('id', { count: 'exact', head: true })
          .eq('member_id', user.id)
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
