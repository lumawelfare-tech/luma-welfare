import { Navigate } from 'react-router-dom'

/** Dedicated Applications nav entry — same Members queue filtered to pending approval. */
export function AdminApplications() {
  return <Navigate to="/admin/members?status=pending_approval" replace />
}
