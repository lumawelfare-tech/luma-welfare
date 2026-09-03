export type DashboardData = {
  members: number
  active_members: number
  new_members_period: number
  subscriptions: number
  pending_contributions: number
  total_contributions: number
  verified_contributions: number
  pending_claims: number
  approved_claims: number
  paid_claims: number
  total_claims: number
  total_payments: number
  completed_payments: number
  confirmed_stats: Record<string, unknown>
  member_growth: { month: string; new_members: number; active_members: number; cumulative: number }[]
  payment_health: { total_payments: number; completed: number; pending: number; failed: number; success_rate: number; total_amount: number; completed_amount: number; avg_amount: number }
  outstanding: { approved_unpaid_claims: number; approved_unpaid_amount: number; pending_contributions: number; pending_contribution_amount: number; stale_pending_payments: number; stale_pending_amount: number }
  qualifications: { qualified: number; not_eligible: number; at_risk: number; revoked: number; total: number }
  retention: { current_month_active: number; previous_month_active: number; retained: number; retention_rate: number; new_active: number }
  monthly_contributions: { month: string; label: string; total: number; verified: number; pending: number }[]
  package_breakdown: { name: string; count: number }[]
  claims_by_status: Record<string, number>
  registration_fees: { total: number; paid: number; unpaid: number }
  recent_transactions: { id: string; amount: number; status: string; date: string; member_name: string; package_name: string }[]
  drill_month: string | null
  drill_transactions: { id: string; amount: number; status: string; period: string; date: string; member_name: string; member_phone: string; package_name: string }[]
  recent_reports: { id: string; schedule_name: string; report_type: string; filename: string; record_count: number; status: string; generated_at: string }[]
  scheduled_report_stats: { total: number; enabled: number }
  report_analytics: {
    total_reports: number; successful: number; failed: number; success_rate: number
    avg_records: number; total_records: number
    by_type: { type: string; total: number; success: number; error: number; records: number }[]
    by_month: { month: string; label: string; total: number; success: number; error: number; records: number }[]
    by_schedule: { name: string; total: number; success: number; error: number; lastRun: string }[]
  }
  membership_funnel: { stage: string; count: number; pct_of_total: number }[]
}

export type DatePreset = 'today' | '7d' | '30d' | 'month' | 'quarter' | 'ytd' | 'all' | 'custom'
