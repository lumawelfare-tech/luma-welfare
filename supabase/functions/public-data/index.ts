import { handleCors, corsHeaders } from '../shared/cors.ts'
import { createAdminClient } from '../shared/supabase.ts'

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ message: 'Method not allowed' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  try {
    const adminClient = createAdminClient()
    const url = new URL(req.url)
    const resource = url.searchParams.get('resource') ?? 'packages'

    if (resource === 'packages') {
      const { data: packages } = await adminClient
        .from('packages').select('id, code, name, description, coverage, waiting_period_months, sort_order')
        .eq('is_active', true).order('sort_order')
      const { data: tiers } = await adminClient.from('package_tiers').select('id, package_id, name, amount').eq('is_active', true)
      const { data: rules } = await adminClient.from('package_rules').select('package_id, key, value')

      const rulesByPackage = new Map<string, Record<string, unknown>>()
      for (const r of rules ?? []) {
        const map = rulesByPackage.get(r.package_id) ?? {}
        map[r.key] = r.value
        rulesByPackage.set(r.package_id, map)
      }

      return new Response(JSON.stringify({
        packages: (packages ?? []).map((p) => ({
          ...p, tiers: (tiers ?? []).filter((t) => t.package_id === p.id),
          rules: rulesByPackage.get(p.id) ?? {},
        })),
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (resource === 'settings') {
      const { data } = await adminClient.from('platform_settings').select('key, value')
      const settings: Record<string, unknown> = {}
      for (const row of data ?? []) settings[row.key] = row.value
      return new Response(JSON.stringify(settings), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (resource === 'news') {
      const { data, error } = await adminClient
        .from('news_events').select('id, title, body, type, event_date, published_at')
        .eq('is_published', true).order('published_at', { ascending: false })
      if (error) throw new Error(error.message)
      return new Response(JSON.stringify({ items: data ?? [] }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (resource === 'gallery') {
      const { data, error } = await adminClient
        .from('gallery_items').select('id, title, image_url, caption, created_at')
        .order('created_at', { ascending: false })
      if (error) throw new Error(error.message)
      return new Response(JSON.stringify({ items: data ?? [] }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({ message: 'Unknown resource' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    return new Response(JSON.stringify({ message: err instanceof Error ? err.message : 'Internal error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
