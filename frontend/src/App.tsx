import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { Layout } from './components/Layout'
import { RequireMember } from './components/RequireMember'
import { RequireAdmin } from './components/RequireAdmin'

// Public pages — loaded eagerly (small, high-traffic)
import { Home } from './pages/Home'
import { About } from './pages/About'
import { HowItWorks } from './pages/HowItWorks'
import { FAQ } from './pages/FAQ'
import { Contact } from './pages/Contact'
import { Login } from './pages/Login'
import { Register } from './pages/Register'

// Heavy/protected pages — lazy loaded (code-split into separate chunks)
const PackagesPage = lazy(() => import('./pages/Packages').then(m => ({ default: m.PackagesPage })))
const News = lazy(() => import('./pages/News').then(m => ({ default: m.News })))
const Gallery = lazy(() => import('./pages/Gallery').then(m => ({ default: m.Gallery })))

// Member pages — lazy loaded
const Dashboard = lazy(() => import('./pages/member/Dashboard').then(m => ({ default: m.Dashboard })))
const Contributions = lazy(() => import('./pages/member/Contributions').then(m => ({ default: m.Contributions })))
const JoinPackages = lazy(() => import('./pages/member/JoinPackages').then(m => ({ default: m.JoinPackages })))
const Profile = lazy(() => import('./pages/member/Profile').then(m => ({ default: m.Profile })))
const Family = lazy(() => import('./pages/member/Family').then(m => ({ default: m.Family })))

// Admin pages — lazy loaded (largest, least frequently used)
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard').then(m => ({ default: m.AdminDashboard })))
const AdminMembers = lazy(() => import('./pages/admin/AdminMembers').then(m => ({ default: m.AdminMembers })))
const AdminPackages = lazy(() => import('./pages/admin/AdminPackages').then(m => ({ default: m.AdminPackages })))
const AdminContributions = lazy(() => import('./pages/admin/AdminContributions').then(m => ({ default: m.AdminContributions })))
const AdminClaims = lazy(() => import('./pages/admin/AdminClaims').then(m => ({ default: m.AdminClaims })))

function PageLoader() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <div className="text-sm text-gray-500">Loading…</div>
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route element={<Layout />}>
              {/* Public pages */}
              <Route path="/" element={<Home />} />
              <Route path="/about" element={<About />} />
              <Route path="/packages" element={<PackagesPage />} />
              <Route path="/how-it-works" element={<HowItWorks />} />
              <Route path="/faq" element={<FAQ />} />
              <Route path="/contact" element={<Contact />} />
              <Route path="/news" element={<News />} />
              <Route path="/gallery" element={<Gallery />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />

              {/* Member pages */}
              <Route element={<RequireMember />}>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/contributions" element={<Contributions />} />
                <Route path="/join" element={<JoinPackages />} />
                <Route path="/profile" element={<Profile />} />
                <Route path="/family" element={<Family />} />
              </Route>

              {/* Admin pages */}
              <Route element={<RequireAdmin />}>
                <Route path="/admin" element={<AdminDashboard />} />
                <Route path="/admin/members" element={<AdminMembers />} />
                <Route path="/admin/packages" element={<AdminPackages />} />
                <Route path="/admin/contributions" element={<AdminContributions />} />
                <Route path="/admin/claims" element={<AdminClaims />} />
              </Route>
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  )
}
