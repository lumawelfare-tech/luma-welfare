import 'dotenv/config'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import { withSupabase } from '@supabase/server/adapters/hono'
import { AuthError } from '@supabase/server'

import { publicRoutes } from './routes/public.js'
import { authRoutes } from './routes/auth.js'
import { memberRoutes } from './routes/member.js'
import { contributionRoutes } from './routes/contributions.js'
import { adminRoutes } from './routes/admin.js'
import { HttpError } from './lib/http.js'

const app = new Hono()

app.use('*', cors())

app.get('/health', (c) => c.json({ status: 'ok' }))

app.route('/api', publicRoutes)
app.route('/api/auth', authRoutes)
app.route('/api/member', memberRoutes)
app.route('/api/contributions', contributionRoutes)
app.route('/api/admin', adminRoutes)

app.onError((err, c) => {
  if (err instanceof HTTPException && err.cause instanceof AuthError) {
    const authError = err.cause
    return c.json(
      { message: authError.message, code: authError.code },
      authError.status as 401 | 500,
    )
  }
  const status = err instanceof HttpError ? err.status : 500
  const message = err instanceof HttpError ? err.message : 'Internal server error'
  return c.json(
    { message, code: err instanceof HttpError ? err.code : 'INTERNAL' },
    status as 401 | 500 | 400,
  )
})

export default app

const port = Number(process.env.PORT ?? 3001)
if (process.env.NODE_ENV !== 'edge') {
  const { serve } = await import('@hono/node-server')
  serve({ fetch: app.fetch, port }, () => {
    console.log(`Luma Welfare API listening on http://localhost:${port}`)
  })
}