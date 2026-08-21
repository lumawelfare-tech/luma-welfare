import { Hono } from 'hono'
import { withSupabase, typedDb } from '../lib/supabase.js'

const app = new Hono()

// Public catalog, org settings, news, gallery. The frontend sends the
// publishable key in the `apikey` header; RLS lets anyone read active packages.

app.get(
  '/packages',
  withSupabase({ auth: 'publishable' }),
  async (c) => {
    const { supabase } = typedDb(c.var.supabaseContext)
    const { data: packages, error } = await supabase
      .from('packages')
      .select('id, code, name, description, coverage, waiting_period_months, sort_order')
      .eq('is_active', true)
      .order('sort_order')
    if (error) return c.json({ message: error.message, code: 'DB_ERROR' }, 500)

    const { data: tiers } = await supabase
      .from('package_tiers')
      .select('id, package_id, name, amount')
      .eq('is_active', true)
    const { data: rules } = await supabase
      .from('package_rules')
      .select('package_id, key, value')

    const rulesByPackage = new Map<string, Record<string, unknown>>()
    for (const r of rules ?? []) {
      const map = rulesByPackage.get(r.package_id) ?? {}
      map[r.key] = r.value
      rulesByPackage.set(r.package_id, map)
    }

    return c.json({
      packages: (packages ?? []).map((p) => ({
        ...p,
        tiers: (tiers ?? []).filter((t) => t.package_id === p.id),
        rules: rulesByPackage.get(p.id) ?? {},
      })),
    })
  },
)

app.get('/settings', withSupabase({ auth: 'publishable' }), async (c) => {
  const { supabase } = typedDb(c.var.supabaseContext)
  const { data } = await supabase.from('platform_settings').select('key, value')
  const settings: Record<string, unknown> = {}
  for (const row of data ?? []) settings[row.key] = row.value
  return c.json(settings)
})

app.get('/news', withSupabase({ auth: 'publishable' }), async (c) => {
  const { supabase } = typedDb(c.var.supabaseContext)
  const { data, error } = await supabase
    .from('news_events')
    .select('id, title, body, type, event_date, published_at')
    .eq('is_published', true)
    .order('published_at', { ascending: false })
  if (error) return c.json({ message: error.message, code: 'DB_ERROR' }, 500)
  return c.json({ items: data ?? [] })
})

app.get('/gallery', withSupabase({ auth: 'publishable' }), async (c) => {
  const { supabase } = typedDb(c.var.supabaseContext)
  const { data, error } = await supabase
    .from('gallery_items')
    .select('id, title, image_url, caption, created_at')
    .order('created_at', { ascending: false })
  if (error) return c.json({ message: error.message, code: 'DB_ERROR' }, 500)
  return c.json({ items: data ?? [] })
})

export const publicRoutes = app