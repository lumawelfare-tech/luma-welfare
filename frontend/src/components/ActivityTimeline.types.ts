export type ActivityItem = {
  id: string
  title: string
  detail?: string
  at: string
  tone?: 'success' | 'warning' | 'error' | 'info' | 'neutral'
}
