import { handleCors, corsHeaders } from '../shared/cors.ts'
import { getAuthenticatedUser, createAdminClient, loadAdminSession, requirePermission, logAudit } from '../shared/supabase.ts'

// ── Webhook Payload Builders ───────────────────────────────────────────────

function buildWebhookPayload(event: string, type: string, data: Record<string, unknown>): Record<string, unknown> {
  const base = {
    event,
    timestamp: new Date().toISOString(),
    source: 'luma-welfare',
    ...data,
  }

  if (type === 'slack') {
    const statusEmoji = event.includes('unhealthy') ? '🔴' : event.includes('degraded') ? '🟡' : '🟢'
    return {
      text: `${statusEmoji} *Luma Welfare* — ${data.message ?? event}`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `${statusEmoji} *Luma Welfare Health Alert*

${data.message ?? event}

• Status: *${data.overall ?? 'unknown'}*
• Time: ${base.timestamp}`,
          },
        },
      ],
    }
  }

  if (type === 'discord') {
    const color = event.includes('unhealthy') ? 0xdc2626 : event.includes('degraded') ? 0xca8a04 : 0x16a34a
    return {
      embeds: [
        {
          title: `Luma Welfare — ${data.message ?? event}`,
          description: data.message ?? event,
          color,
          fields: [
            { name: 'Status', value: String(data.overall ?? 'unknown'), inline: true },
            { name: 'Time', value: base.timestamp, inline: true },
          ],
          footer: { text: 'Luma Welfare Health Check' },
        },
      ],
    }
  }

  // Custom webhook — flat JSON payload
  return base
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const user = await getAuthenticatedUser(req)
    if (!user) return new Response(JSON.stringify({ message: 'Not authenticated' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const adminClient = createAdminClient()
    const session = await loadAdminSession(adminClient, user.id)
    if (!session) return new Response(JSON.stringify({ message: 'No admin access' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const url = new URL(req.url)
    const resourceId = url.searchParams.get("resource_id")
    const action = url.searchParams.get("action")
    const resource = resourceId
    // Also accept ?resource= query param for backward compatibility
    const resourceParam = url.searchParams.get("resource") ?? resource

    // GET /admin-settings/audit-logs
    if (req.method === 'GET' && (resource === 'audit-logs' || resourceParam === 'audit_logs')) {
      requirePermission(session, 'audit_logs', 'read')
      const pageParam = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1)
      const perPage = Math.min(200, Math.max(1, parseInt(url.searchParams.get('per_page') ?? '50', 10) || 50))
      const q = url.searchParams.get('q')?.trim()
      const actionFilter = url.searchParams.get('action')?.trim()
      const from = (pageParam - 1) * perPage
      const to = from + perPage - 1
      let query = adminClient.from('audit_logs').select('*', { count: 'exact' })
      if (actionFilter) query = query.eq('action', actionFilter)
      if (q) {
        query = query.or(`action.ilike.%${q}%,resource.ilike.%${q}%,actor_role.ilike.%${q}%,resource_id.ilike.%${q}%`)
      }
      query = query.order('created_at', { ascending: false }).range(from, to)
      const { data, error, count } = await query
      if (error) throw new Error(error.message)
      const total = count ?? (data?.length ?? 0)
      const pages = Math.max(1, Math.ceil(total / perPage))
      return new Response(JSON.stringify({ items: data ?? [], total, pages }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // GET /admin-settings/open-questions
    if (req.method === 'GET' && (resource === 'open-questions' || resourceParam === 'open-questions')) {
      requirePermission(session, 'members', 'read')
      const { data, error } = await adminClient.from('open_questions').select('*').order('created_at')
      if (error) throw new Error(error.message)
      return new Response(JSON.stringify({ open_questions: data ?? [] }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // POST /admin-settings/resolve?id={questionId}
    if (req.method === 'POST' && action === 'resolve') {
      requirePermission(session, 'members', 'update')
      const body = await req.json()
      const questionId = url.searchParams.get('id') ?? resourceId
      const { data, error } = await adminClient.from('open_questions').update({ status: 'resolved', answer: body.answer ?? '' }).eq('id', questionId).select().single()
      if (error) throw new Error('Question not found')
      return new Response(JSON.stringify({ question: data }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // PATCH /admin-settings — update settings
    // When called as /admin/settings (no resource_id), treat as settings update
    if (req.method === 'PATCH' && (!resource || resource === 'settings' || resourceParam === 'settings')) {
      requirePermission(session, 'members', 'update')
      const body = await req.json()
      if (!body || typeof body.key !== 'string') {
        return new Response(JSON.stringify({ message: 'Send { key, value }' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      const { data, error } = await adminClient.from('platform_settings').upsert({ key: body.key, value: body.value }).select().single()
      if (error) throw new Error(error.message)
      await logAudit(adminClient, { actor_id: session.id, actor_role: session.role_name, action: 'updated_setting', resource: 'platform_settings', resource_id: body.key })
      return new Response(JSON.stringify({ setting: data }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ========================================================================
    // WEBHOOKS — System alert webhook management
    // ========================================================================

    // GET /admin-settings?resource=webhooks
    if (req.method === 'GET' && (resource === 'webhooks' || resourceParam === 'webhooks')) {
      requirePermission(session, 'members', 'read')
      const { data, error } = await adminClient.rpc('get_system_webhooks')
      if (error) throw new Error(error.message)
      return new Response(JSON.stringify({ webhooks: data ?? [] }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // POST /admin-settings?action=create-webhook
    if (req.method === 'POST' && action === 'create-webhook') {
      requirePermission(session, 'members', 'update')
      const body = await req.json()
      if (!body?.name || !body?.url || !body?.type) {
        return new Response(JSON.stringify({ message: 'Send { name, url, type, events? }' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      const { data, error } = await adminClient.from('system_webhooks').insert({
        name: body.name,
        url: body.url,
        type: body.type,
        events: body.events ?? ['health.unhealthy', 'health.degraded'],
        enabled: body.enabled ?? true,
      }).select().single()
      if (error) throw new Error(error.message)
      await logAudit(adminClient, { actor_id: session.id, actor_role: session.role_name, action: 'webhook_created', resource: 'system_webhooks', resource_id: data.id })
      return new Response(JSON.stringify({ webhook: data }), { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // PATCH /admin-settings?action=update-webhook&id={id}
    if (req.method === 'PATCH' && action === 'update-webhook') {
      requirePermission(session, 'members', 'update')
      const webhookId = url.searchParams.get('id')
      if (!webhookId) {
        return new Response(JSON.stringify({ message: 'Missing webhook id' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      const body = await req.json()
      const updates: Record<string, unknown> = {}
      if (body.name !== undefined) updates.name = body.name
      if (body.url !== undefined) updates.url = body.url
      if (body.type !== undefined) updates.type = body.type
      if (body.events !== undefined) updates.events = body.events
      if (body.enabled !== undefined) updates.enabled = body.enabled
      updates.updated_at = new Date().toISOString()
      const { data, error } = await adminClient.from('system_webhooks').update(updates).eq('id', webhookId).select().single()
      if (error) throw new Error('Webhook not found')
      await logAudit(adminClient, { actor_id: session.id, actor_role: session.role_name, action: 'webhook_updated', resource: 'system_webhooks', resource_id: webhookId })
      return new Response(JSON.stringify({ webhook: data }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // DELETE /admin-settings?action=delete-webhook&id={id}
    if (req.method === 'DELETE' && action === 'delete-webhook') {
      requirePermission(session, 'members', 'update')
      const webhookId = url.searchParams.get('id')
      if (!webhookId) {
        return new Response(JSON.stringify({ message: 'Missing webhook id' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      const { error } = await adminClient.from('system_webhooks').delete().eq('id', webhookId)
      if (error) throw new Error('Webhook not found')
      await logAudit(adminClient, { actor_id: session.id, actor_role: session.role_name, action: 'webhook_deleted', resource: 'system_webhooks', resource_id: webhookId })
      return new Response(JSON.stringify({ message: 'Webhook deleted' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // POST /admin-settings?action=test-webhook&id={id}
    if (req.method === 'POST' && action === 'test-webhook') {
      requirePermission(session, 'members', 'update')
      const webhookId = url.searchParams.get('id')
      if (!webhookId) {
        return new Response(JSON.stringify({ message: 'Missing webhook id' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      const { data: webhook, error: fetchError } = await adminClient.from('system_webhooks').select('*').eq('id', webhookId).single()
      if (fetchError || !webhook) {
        return new Response(JSON.stringify({ message: 'Webhook not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      // Send test payload
      const testPayload = buildWebhookPayload('test', webhook.type, {
        message: 'Test alert from Luma Welfare',
        timestamp: new Date().toISOString(),
      })
      try {
        const resp = await fetch(webhook.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(testPayload),
        })
        await adminClient.from('system_webhooks').update({ last_sent: new Date().toISOString(), last_status: resp.status, updated_at: new Date().toISOString() }).eq('id', webhookId)
        return new Response(JSON.stringify({ message: resp.ok ? 'Test sent successfully' : `Test failed: HTTP ${resp.status}`, status: resp.status }), {
          status: resp.ok ? 200 : 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      } catch (err) {
        return new Response(JSON.stringify({ message: `Test failed: ${err instanceof Error ? err.message : 'Network error'}` }), {
          status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    return new Response(JSON.stringify({ message: 'Not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    console.error('admin-settings error:', err)
    return new Response(JSON.stringify({ message: 'An unexpected error occurred.', code: 'INTERNAL' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
