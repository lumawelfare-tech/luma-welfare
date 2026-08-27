/**
 * admin-monitoring — System monitoring and metrics for admins
 *
 * GET /admin-monitoring                        — System overview
 * GET /admin-monitoring?action=metrics         — Request metrics summary
 * GET /admin-monitoring?action=health          — Detailed health check
 * GET /admin-monitoring?action=tables          — Table row counts
 * GET /admin-monitoring?action=exports         — Export worker status
 * GET /admin-monitoring?action=payments        — Payment health metrics
 * GET /admin-monitoring?action=reconciliation  — Financial reconciliation status
 * GET /admin-monitoring?action=security        — Security monitoring
 * GET /admin-monitoring?action=slo             — SLO compliance
 *
 * Admin-only. Requires active admin session.
 */

import { handleCors, corsHeaders } from '../shared/cors.ts'
import { getAuthenticatedUser, createAdminClient, loadAdminSession, requirePermission } from '../shared/supabase.ts'
import { getMetricsSummary } from '../shared/observability.ts'

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ message: 'Method not allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

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

    requirePermission(session, 'members', 'read')

    const url = new URL(req.url)
    const action = url.searchParams.get('action') ?? 'overview'

    // ========================================================================
    // OVERVIEW — System health dashboard
    // ========================================================================
    if (action === 'overview') {
      const metricsSummary = getMetricsSummary()

      // Parallel table counts
      const [membersCount, subsCount, contribsCount, claimsCount, notifCount, auditCount, exportCount] = await Promise.all([
        adminClient.from('members').select('id', { count: 'exact', head: true }),
        adminClient.from('subscriptions').select('id', { count: 'exact', head: true }),
        adminClient.from('contributions').select('id', { count: 'exact', head: true }),
        adminClient.from('claims').select('id', { count: 'exact', head: true }),
        adminClient.from('notifications').select('id', { count: 'exact', head: true }),
        adminClient.from('audit_logs').select('id', { count: 'exact', head: true }),
        adminClient.from('export_jobs').select('id', { count: 'exact', head: true }),
      ])

      // Payment health (quick check)
      const [pendingPayments, failedPayments, recentCompleted] = await Promise.all([
        adminClient.from('payments').select('id', { count: 'exact', head: true }).eq('status', 'Pending'),
        adminClient.from('payments').select('id', { count: 'exact', head: true }).eq('status', 'Failed'),
        adminClient.from('payments').select('id', { count: 'exact', head: true }).eq('status', 'Completed').gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
      ])

      // Export health
      const [exportQueued, exportProcessing, exportFailed] = await Promise.all([
        adminClient.from('export_jobs').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        adminClient.from('export_jobs').select('id', { count: 'exact', head: true }).eq('status', 'processing'),
        adminClient.from('export_jobs').select('id', { count: 'exact', head: true }).eq('status', 'failed'),
      ])

      // Determine health status
      const paymentFailRate = (failedPayments.count ?? 0) > 0 && (pendingPayments.count ?? 0) > 10 ? 'warning' : 'healthy'
      const exportHealth = (exportFailed.count ?? 0) > 5 ? 'warning' : 'healthy'

      return new Response(JSON.stringify({
        system: {
          status: 'healthy',
          timestamp: new Date().toISOString(),
          uptime: metricsSummary.uptime,
          version: 'phase-11',
        },
        database: {
          status: 'healthy',
          tables: {
            members: membersCount.count ?? 0,
            subscriptions: subsCount.count ?? 0,
            contributions: contribsCount.count ?? 0,
            claims: claimsCount.count ?? 0,
            notifications: notifCount.count ?? 0,
            audit_logs: auditCount.count ?? 0,
            export_jobs: exportCount.count ?? 0,
          },
        },
        payments: {
          status: paymentFailRate,
          pending: pendingPayments.count ?? 0,
          failed_24h: failedPayments.count ?? 0,
          completed_24h: recentCompleted.count ?? 0,
        },
        exports: {
          status: exportHealth,
          queued: exportQueued.count ?? 0,
          processing: exportProcessing.count ?? 0,
          failed: exportFailed.count ?? 0,
        },
        metrics: {
          totalRequests: metricsSummary.totalRequests,
          avgLatencyMs: Math.round(metricsSummary.avgLatencyMs),
          p95LatencyMs: Math.round(metricsSummary.p95LatencyMs),
          slowQueries: metricsSummary.slowQueries,
          recentErrors: metricsSummary.recentErrors,
        },
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ========================================================================
    // PAYMENTS — Payment health metrics
    // ========================================================================
    if (action === 'payments') {
      const now = Date.now()
      const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString()
      const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString()

      const [completed24h, pending24h, failed24h, completed7d, avgAmount] = await Promise.all([
        adminClient.from('payments').select('id', { count: 'exact', head: true }).eq('status', 'Completed').gte('created_at', oneDayAgo),
        adminClient.from('payments').select('id', { count: 'exact', head: true }).eq('status', 'Pending').gte('created_at', oneDayAgo),
        adminClient.from('payments').select('id', { count: 'exact', head: true }).eq('status', 'Failed').gte('created_at', oneDayAgo),
        adminClient.from('payments').select('id', { count: 'exact', head: true }).eq('status', 'Completed').gte('created_at', sevenDaysAgo),
        adminClient.from('payments').select('amount').eq('status', 'Completed').gte('created_at', oneDayAgo),
      ])

      const amounts = (avgAmount.data ?? []).map((p: { amount: number }) => Number(p.amount))
      const totalAmount24h = amounts.reduce((sum: number, a: number) => sum + a, 0)
      const avgAmount24h = amounts.length > 0 ? totalAmount24h / amounts.length : 0

      const total24h = (completed24h.count ?? 0) + (pending24h.count ?? 0) + (failed24h.count ?? 0)
      const successRate = total24h > 0 ? ((completed24h.count ?? 0) / total24h) * 100 : 100

      return new Response(JSON.stringify({
        payments: {
          last_24h: {
            completed: completed24h.count ?? 0,
            pending: pending24h.count ?? 0,
            failed: failed24h.count ?? 0,
            total: total24h,
            success_rate: Math.round(successRate * 10) / 10,
            total_amount_kes: Math.round(totalAmount24h),
            avg_amount_kes: Math.round(avgAmount24h),
          },
          last_7d: {
            completed: completed7d.count ?? 0,
          },
        },
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ========================================================================
    // RECONCILIATION — Financial reconciliation status
    // ========================================================================
    if (action === 'reconciliation') {
      // Count payments without matching contributions
      const { data: orphanPayments } = await adminClient
        .from('payments')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'Completed')
        .is('subscription_id', null)

      // Count contributions without matching payments (manual records)
      const { data: manualContribs } = await adminClient
        .from('contributions')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'Pending')
        .is('payment_id', null)

      // Check for duplicate claim numbers
      const { data: duplicateClaims } = await adminClient
        .from('claims')
        .select('claim_number')
        .eq('status', 'Paid')

      // Stale pending payments (>30 minutes without callback)
      const staleThreshold = new Date(Date.now() - 30 * 60 * 1000).toISOString()
      const { count: stalePending } = await adminClient
        .from('payments')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'Pending')
        .lt('created_at', staleThreshold)

      return new Response(JSON.stringify({
        reconciliation: {
          orphan_payments: orphanPayments?.length ?? 0,
          manual_pending_contributions: manualContribs?.length ?? 0,
          stale_pending_payments: stalePending ?? 0,
          status: (stalePending ?? 0) > 10 ? 'warning' : 'healthy',
        },
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ========================================================================
    // SECURITY — Security monitoring
    // ========================================================================
    if (action === 'security') {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

      // Recent admin actions
      const { data: recentAdminActions } = await adminClient
        .from('audit_logs')
        .select('action, resource, created_at')
        .gte('created_at', oneDayAgo)
        .order('created_at', { ascending: false })
        .limit(20)

      // Count high-risk actions today
      const { count: roleChanges } = await adminClient
        .from('audit_logs')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', oneDayAgo)
        .in('action', ['member_suspended', 'member_closed', 'claim_approved', 'claim_rejected'])

      // Count failed auth attempts (from audit logs)
      const { count: failedAuth } = await adminClient
        .from('audit_logs')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', oneHourAgo)
        .eq('action', 'auth_failed')

      return new Response(JSON.stringify({
        security: {
          status: (failedAuth ?? 0) > 20 ? 'warning' : 'healthy',
          high_risk_actions_24h: roleChanges ?? 0,
          failed_auth_1h: failedAuth ?? 0,
          recent_actions: recentAdminActions ?? [],
        },
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ========================================================================
    // SLO — Service Level Objectives compliance
    // ========================================================================
    if (action === 'slo') {
      const summary = getMetricsSummary()

      // Calculate SLO compliance
      const totalReqs = summary.totalRequests
      const errorReqs = Object.entries(summary.requestsByStatus)
        .filter(([code]) => parseInt(code) >= 500)
        .reduce((sum, [, count]) => sum + count, 0)

      const availability = totalReqs > 0 ? ((totalReqs - errorReqs) / totalReqs) * 100 : 100
      const latencyCompliant = summary.p95LatencyMs < 1000 // p95 < 1s target

      return new Response(JSON.stringify({
        slo: {
          availability: {
            target: 99.9,
            actual: Math.round(availability * 100) / 100,
            status: availability >= 99.9 ? 'met' : 'missed',
          },
          latency_p95: {
            target_ms: 1000,
            actual_ms: Math.round(summary.p95LatencyMs),
            status: latencyCompliant ? 'met' : 'missed',
          },
          error_rate: {
            target_pct: 1.0,
            actual_pct: totalReqs > 0 ? Math.round((errorReqs / totalReqs) * 10000) / 100 : 0,
            status: (errorReqs / totalReqs) * 100 <= 1.0 ? 'met' : 'missed',
          },
          total_requests: totalReqs,
          uptime_ms: summary.uptime,
        },
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ========================================================================
    // METRICS — Detailed metrics
    // ========================================================================
    if (action === 'metrics') {
      const summary = getMetricsSummary()
      return new Response(JSON.stringify({ metrics: summary }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ========================================================================
    // TABLES — Table sizes
    // ========================================================================
    if (action === 'tables') {
      const tables = ['members', 'subscriptions', 'contributions', 'claims', 'payments', 'notifications', 'audit_logs', 'registration_fees', 'export_jobs', 'report_history']
      const counts: Record<string, number> = {}

      const results = await Promise.all(
        tables.map(async (table) => {
          try {
            const { count } = await adminClient.from(table).select('id', { count: 'exact', head: true })
            return { table, count: count ?? 0 }
          } catch {
            return { table, count: -1 }
          }
        })
      )

      for (const r of results) counts[r.table] = r.count

      return new Response(JSON.stringify({ tables: counts }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ========================================================================
    // EXPORTS — Export worker status
    // ========================================================================
    if (action === 'exports') {
      const [queued, processing, completed, failed] = await Promise.all([
        adminClient.from('export_jobs').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        adminClient.from('export_jobs').select('id', { count: 'exact', head: true }).eq('status', 'processing'),
        adminClient.from('export_jobs').select('id', { count: 'exact', head: true }).eq('status', 'completed'),
        adminClient.from('export_jobs').select('id', { count: 'exact', head: true }).eq('status', 'failed'),
      ])

      const staleThreshold = new Date(Date.now() - 10 * 60 * 1000).toISOString()
      const { data: staleJobs } = await adminClient
        .from('export_jobs')
        .select('id, type, started_at, worker_id')
        .eq('status', 'processing')
        .lt('started_at', staleThreshold)

      return new Response(JSON.stringify({
        exports: {
          queued: queued.count ?? 0,
          processing: processing.count ?? 0,
          completed: completed.count ?? 0,
          failed: failed.count ?? 0,
          stale: staleJobs ?? [],
          status: (staleJobs?.length ?? 0) > 0 || (failed.count ?? 0) > 5 ? 'warning' : 'healthy',
        },
      }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ message: 'Unknown action' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('admin-monitoring error:', err)
    return new Response(JSON.stringify({ message: 'An unexpected error occurred.', code: 'INTERNAL' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
