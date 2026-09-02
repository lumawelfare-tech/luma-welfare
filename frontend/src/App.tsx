import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ErrorBoundary } from './components/ErrorBoundary'
import { Layout } from './components/Layout'
import { AdminLayout } from './components/AdminLayout'
import { RequireMember } from './components/RequireMember'
import { MemberLayout } from './components/MemberLayout'
import { RequireAdmin } from './components/RequireAdmin'
import { SWUpdateBanner } from './components/SWUpdateBanner'
import { SyncStatus } from './components/SyncStatus'

// Public pages — loaded eagerly (small, high-traffic)
import { Home } from './pages/Home'
import { About } from './pages/About'
import { HowItWorks } from './pages/HowItWorks'
import { FAQ } from './pages/FAQ'
import { Privacy } from './pages/Privacy'
import { Terms } from './pages/Terms'
import { Contact } from './pages/Contact'
import { Login } from './pages/Login'
import { Register } from './pages/Register'
import { ForgotPassword } from './pages/ForgotPassword'
import { ResetPassword } from './pages/ResetPassword'
import { VerifyEmail } from './pages/VerifyEmail'
import { NotFound } from './pages/NotFound'

// Heavy/protected pages — lazy loaded (code-split into separate chunks)
const PackagesPage = lazy(() => import('./pages/Packages').then(m => ({ default: m.PackagesPage })))
const News = lazy(() => import('./pages/News').then(m => ({ default: m.News })))
const Gallery = lazy(() => import('./pages/Gallery').then(m => ({ default: m.Gallery })))
const MediaPage = lazy(() => import('./pages/Media').then(m => ({ default: m.Media })))

// Member pages — lazy loaded
const Dashboard = lazy(() => import('./pages/member/Dashboard').then(m => ({ default: m.Dashboard })))
const Contributions = lazy(() => import('./pages/member/Contributions').then(m => ({ default: m.Contributions })))
const JoinPackages = lazy(() => import('./pages/member/JoinPackages').then(m => ({ default: m.JoinPackages })))
const Profile = lazy(() => import('./pages/member/Profile').then(m => ({ default: m.Profile })))
const Family = lazy(() => import('./pages/member/Family').then(m => ({ default: m.Family })))
const ReceiptsStatements = lazy(() => import('./pages/member/ReceiptsStatements').then(m => ({ default: m.ReceiptsStatements })))
const Claims = lazy(() => import('./pages/member/Claims').then(m => ({ default: m.Claims })))
const Notifications = lazy(() => import('./pages/member/Notifications').then(m => ({ default: m.Notifications })))
const NotificationPreferences = lazy(() => import('./pages/member/NotificationPreferences').then(m => ({ default: m.NotificationPreferences })))

// Admin pages — lazy loaded (largest, least frequently used)
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard').then(m => ({ default: m.AdminDashboard })))
const AdminMembers = lazy(() => import('./pages/admin/AdminMembers').then(m => ({ default: m.AdminMembers })))
const AdminPackages = lazy(() => import('./pages/admin/AdminPackages').then(m => ({ default: m.AdminPackages })))
const AdminContributions = lazy(() => import('./pages/admin/AdminContributions').then(m => ({ default: m.AdminContributions })))
const AdminClaims = lazy(() => import('./pages/admin/AdminClaims').then(m => ({ default: m.AdminClaims })))
const AdminSubscriptions = lazy(() => import('./pages/admin/AdminSubscriptions').then(m => ({ default: m.AdminSubscriptions })))
const AdminNews = lazy(() => import('./pages/admin/AdminNews').then(m => ({ default: m.AdminNews })))
const AdminGallery = lazy(() => import('./pages/admin/AdminGallery').then(m => ({ default: m.AdminGallery })))
const AdminSettings = lazy(() => import('./pages/admin/AdminSettings').then(m => ({ default: m.AdminSettings })))
const AdminAuditLogs = lazy(() => import('./pages/admin/AdminAuditLogs').then(m => ({ default: m.AdminAuditLogs })))
const AdminRegistrationFees = lazy(() => import('./pages/admin/AdminRegistrationFees').then(m => ({ default: m.AdminRegistrationFees })))
const AdminReports = lazy(() => import('./pages/admin/AdminReports').then(m => ({ default: m.AdminReports })))
const AdminScheduledReports = lazy(() => import('./pages/admin/AdminScheduledReports').then(m => ({ default: m.AdminScheduledReports })))
const AdminReconciliation = lazy(() => import('./pages/admin/AdminReconciliation').then(m => ({ default: m.AdminReconciliation })))
const AdminMedia = lazy(() => import('./pages/admin/AdminMedia').then(m => ({ default: m.AdminMedia })))
const AdminHealthCheck = lazy(() => import('./pages/admin/AdminHealthCheck').then(m => ({ default: m.AdminHealthCheck })))

function PageLoader() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <div className="text-sm text-gray-500">Loading…</div>
    </div>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
          <SWUpdateBanner />
          <SyncStatus />
          <Suspense fallback={<PageLoader />}>
            <Routes>
              {/* ===== PUBLIC WEBSITE ===== */}
              <Route element={<Layout />}>
                <Route path="/" element={<Home />} />
                <Route path="/about" element={<About />} />
                <Route path="/packages" element={<PackagesPage />} />
                <Route path="/how-it-works" element={<HowItWorks />} />
                <Route path="/faq" element={<FAQ />} />
                <Route path="/privacy" element={<Privacy />} />
                <Route path="/terms" element={<Terms />} />
                <Route path="/contact" element={<Contact />} />
                <Route path="/news" element={<News />} />
                <Route path="/gallery" element={<Gallery />} />
                <Route path="/media" element={<MediaPage />} />
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="/verify-email" element={<VerifyEmail />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="*" element={<NotFound />} />
              </Route>

              {/* ===== MEMBER PORTAL ===== */}
              <Route element={<RequireMember />}>
                <Route element={<MemberLayout />}>
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/contributions" element={<Contributions />} />
                  <Route path="/join" element={<JoinPackages />} />
                  <Route path="/profile" element={<Profile />} />
                  <Route path="/family" element={<Family />} />
                  <Route path="/receipts-statements" element={<ReceiptsStatements />} />
                  <Route path="/claims" element={<Claims />} />
                  <Route path="/notifications" element={<Notifications />} />
                  <Route path="/notification-preferences" element={<NotificationPreferences />} />
                </Route>
              </Route>

              {/* ===== ADMIN PORTAL ===== */}
              <Route path="/admin" element={<RequireAdmin />}>
                <Route element={<AdminLayout />}>
                  <Route index element={<Navigate to="dashboard" replace />} />
                  <Route path="dashboard" element={<AdminDashboard />} />
                  <Route path="members" element={<AdminMembers />} />
                  <Route path="registration-fees" element={<AdminRegistrationFees />} />
                  <Route path="packages" element={<AdminPackages />} />
                  <Route path="contributions" element={<AdminContributions />} />
                  <Route path="claims" element={<AdminClaims />} />
                  <Route path="subscriptions" element={<AdminSubscriptions />} />
                  <Route path="news" element={<AdminNews />} />
                  <Route path="gallery" element={<AdminGallery />} />
                  <Route path="media" element={<AdminMedia />} />
                  <Route path="reports" element={<AdminReports />} />
                  <Route path="scheduled-reports" element={<AdminScheduledReports />} />
                  <Route path="settings" element={<AdminSettings />} />
                  <Route path="audit-logs" element={<AdminAuditLogs />} />
                  <Route path="reconciliation" element={<AdminReconciliation />} />
                  <Route path="health" element={<AdminHealthCheck />} />
                </Route>
              </Route>
            </Routes>
          </Suspense>
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  )
}
