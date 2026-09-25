import { handleCors, getCorsHeaders } from '../shared/cors.ts'
import { createAdminClient } from '../shared/supabase.ts'

/** Keys safe to expose publicly. Never include mpesa credentials or secrets. */
const PUBLIC_SETTINGS_KEYS = new Set(['org_contact', 'stats'])

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  const cors = getCorsHeaders(req)

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ message: 'Method not allowed' }), { status: 405, headers: { ...cors, 'Content-Type': 'application/json' } })
  }

  try {
    const adminClient = createAdminClient()
    const url = new URL(req.url)
    const resource = url.searchParams.get('resource') ?? 'packages'

    if (resource === 'packages') {
      const { data: packages, error: packagesErr } = await adminClient
        .from('packages')
        .select('id, code, name, description, coverage, waiting_period_months, sort_order, parent_package_id')
        .eq('is_active', true)
        .order('sort_order')
      if (packagesErr) throw new Error(packagesErr.message)
      const { data: tiers, error: tiersErr } = await adminClient
        .from('package_tiers')
        .select('id, package_id, name, amount, min_age, max_age, sort_order')
        .eq('is_active', true)
        .order('sort_order')
      if (tiersErr) throw new Error(tiersErr.message)
      const { data: rules, error: rulesErr } = await adminClient.from('package_rules').select('package_id, key, value')
      if (rulesErr) throw new Error(rulesErr.message)

      const rulesByPackage = new Map<string, Record<string, unknown>>()
      for (const r of rules ?? []) {
        const map = rulesByPackage.get(r.package_id) ?? {}
        map[r.key] = r.value
        rulesByPackage.set(r.package_id, map)
      }

      return new Response(JSON.stringify({
        packages: (packages ?? []).map((p) => ({
          ...p,
          tiers: (tiers ?? []).filter((t) => t.package_id === p.id),
          rules: rulesByPackage.get(p.id) ?? {},
        })),
      }), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } })
    }

    if (resource === 'settings') {
      const { data } = await adminClient
        .from('platform_settings')
        .select('key, value')
        .in('key', [...PUBLIC_SETTINGS_KEYS])
      const settings: Record<string, unknown> = {}
      for (const row of data ?? []) {
        if (PUBLIC_SETTINGS_KEYS.has(row.key)) settings[row.key] = row.value
      }
      return new Response(JSON.stringify(settings), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } })
    }

    if (resource === 'news') {
      const { data, error } = await adminClient
        .from('news_events').select('id, title, body, type, event_date, published_at')
        .eq('is_published', true).order('published_at', { ascending: false })
      if (error) throw new Error(error.message)
      return new Response(JSON.stringify({ items: data ?? [] }), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } })
    }

    if (resource === 'gallery') {
      const { data, error } = await adminClient
        .from('gallery_items').select('id, title, image_url, caption, created_at')
        .order('created_at', { ascending: false })
      if (error) throw new Error(error.message)
      return new Response(JSON.stringify({ items: data ?? [] }), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } })
    }

    if (resource === 'media') {
      const type = url.searchParams.get('type')
      const category = url.searchParams.get('category')
      const page = parseInt(url.searchParams.get('page') || '1')
      const perPage = Math.min(parseInt(url.searchParams.get('per_page') || '24'), 100)

      let query = adminClient
        .from('media_items')
        .select('id, title, description, media_type, file_url, thumbnail_url, mime_type, file_size, duration, category, tags, is_featured, sort_order, created_at', { count: 'exact' })
        .eq('is_published', true)

      if (type && type !== 'all') query = query.eq('media_type', type)
      if (category && category !== 'all') query = query.eq('category', category)
      query = query.order('sort_order', { ascending: true }).order('created_at', { ascending: false })
      query = query.range((page - 1) * perPage, page * perPage - 1)

      const { data, error, count } = await query
      if (error) throw new Error(error.message)
      return new Response(JSON.stringify({ items: data ?? [], total: count ?? 0, page, per_page: perPage, pages: Math.ceil((count ?? 0) / perPage) }), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({ message: 'Unknown resource' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } })
  } catch (err) {
    console.error('public-data error:', err)
    return new Response(JSON.stringify({ message: 'An unexpected error occurred.', code: 'INTERNAL' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } })
  }
})
