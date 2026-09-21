import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  ADMIN_ROUTE_PERMISSIONS,
  hasAdminPermission,
  permissionForAdminPath,
} from '../lib/adminPermissions'

/**
 * Cosmetic gate: hide admin pages the staff role cannot access.
 * Edge Functions remain authoritative.
 */
export function RequirePermission() {
  const { isAdmin, isSuperadmin, adminPermissions, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-stone-500">
        Checking your account…
      </div>
    )
  }

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />
  }

  const required = permissionForAdminPath(location.pathname)
  if (!hasAdminPermission(adminPermissions, isSuperadmin, required)) {
    // Prefer first permitted admin route to avoid dashboard redirect loops
    const fallbackSeg = Object.entries(ADMIN_ROUTE_PERMISSIONS).find(([, req]) =>
      hasAdminPermission(adminPermissions, isSuperadmin, req),
    )?.[0]
    if (fallbackSeg && location.pathname !== `/admin/${fallbackSeg}`) {
      return <Navigate to={`/admin/${fallbackSeg}`} replace />
    }
    return (
      <div className="flex min-h-[40vh] items-center justify-center px-4">
        <p role="alert" className="max-w-md text-center text-sm text-stone-600">
          You do not have permission to view this page. Contact a superadmin if you need access.
        </p>
      </div>
    )
  }

  return <Outlet />
}
