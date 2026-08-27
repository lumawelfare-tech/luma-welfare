/**
 * health — System health check endpoint
 *
 * GET /health           — Basic health check (no auth required)
 * GET /health?detail=true — Detailed health check with latency measurements
 *
 * Returns safe, non-sensitive status information.
 * No credentials, tokens, or internal details exposed.
 */

import { corsHeaders } from '../shared/cors.ts'
import { createAdminClient } from '../shared/supabase.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ status: 'error', message: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const startTime = performance.now()
  const url = new URL(req.url)
  const detailed = url.searchParams.get('detail') === 'true'

  try {
    const adminClient = createAdminClient()
    const checks: Record<string, { status: string; latencyMs?: number; error?: string }> = {}

    // 1. Database connectivity
    const dbStart = performance.now()
    try {
      const { error } = await adminClient
        .from('platform_settings')
        .select('key')
        .limit(1)

      checks.database = {
        status: error ? 'unhealthy' : 'healthy',
        latencyMs: Math.round(performance.now() - dbStart),
        error: error ? 'Query failed' : undefined,
      }
    } catch (err) {
      checks.database = {
        status: 'unhealthy',
        latencyMs: Math.round(performance.now() - dbStart),
        error: 'Connection failed',
      }
    }

    // 2. Auth service (basic check)
    if (detailed) {
      const authStart = performance.now()
      try {
        // Simple auth check — just verify the service responds
        const { error } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1 })
        checks.auth = {
          status: error && error.message.includes('not found') ? 'healthy' : (error ? 'degraded' : 'healthy'),
          latencyMs: Math.round(performance.now() - authStart),
        }
      } catch {
        checks.auth = {
          status: 'degraded',
          latencyMs: Math.round(performance.now() - authStart),
          error: 'Auth service unreachable',
        }
      }
    }

    // 3. Storage check (detailed only)
    if (detailed) {
      const storageStart = performance.now()
      try {
        const { error } = await adminClient.storage.listBuckets()
        checks.storage = {
          status: error ? 'degraded' : 'healthy',
          latencyMs: Math.round(performance.now() - storageStart),
          error: error ? 'Storage list failed' : undefined,
        }
      } catch {
        checks.storage = {
          status: 'degraded',
          latencyMs: Math.round(performance.now() - storageStart),
          error: 'Storage unreachable',
        }
      }
    }

    // Determine overall status
    const allHealthy = Object.values(checks).every(c => c.status === 'healthy')
    const anyUnhealthy = Object.values(checks).some(c => c.status === 'unhealthy')
    const overallStatus = anyUnhealthy ? 'unhealthy' : allHealthy ? 'healthy' : 'degraded'

    const totalLatency = Math.round(performance.now() - startTime)

    const response: Record<string, unknown> = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      latencyMs: totalLatency,
    }

    if (detailed) {
      response.checks = checks
      response.version = 'phase-5'
    }

    return new Response(JSON.stringify(response), {
      status: overallStatus === 'unhealthy' ? 503 : 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Health check failed',
    }), {
      status: 503,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
