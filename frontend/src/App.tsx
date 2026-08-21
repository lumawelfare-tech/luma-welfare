import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { Layout } from './components/Layout'
import { RequireMember } from './components/RequireMember'
import { RequireAdmin } from './components/RequireAdmin'

import { Home } from './pages/Home'
import { About } from './pages/About'
import { PackagesPage } from './pages/Packages'
import { HowItWorks } from './pages/HowItWorks'
import { FAQ } from './pages/FAQ'
import { Contact } from './pages/Contact'
import { News } from './pages/News'
import { Gallery } from './pages/Gallery'
import { Login } from './pages/Login'
import { Register } from './pages/Register'

import { Dashboard } from './pages/member/Dashboard'
import { Contributions } from './pages/member/Contributions'
import { JoinPackages } from './pages/member/JoinPackages'
import { Profile } from './pages/member/Profile'
import { Family } from './pages/member/Family'

import { AdminDashboard } from './pages/admin/AdminDashboard'
import { AdminMembers } from './pages/admin/AdminMembers'
import { AdminPackages } from './pages/admin/AdminPackages'
import { AdminContributions } from './pages/admin/AdminContributions'
import { AdminClaims } from './pages/admin/AdminClaims'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
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
            <Route element={<RequireMember />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/contributions" element={<Contributions />} />
              <Route path="/join" element={<JoinPackages />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/family" element={<Family />} />
            </Route>
            <Route element={<RequireAdmin />}>
              <Route path="/admin" element={<AdminDashboard />} />
              <Route path="/admin/members" element={<AdminMembers />} />
              <Route path="/admin/packages" element={<AdminPackages />} />
              <Route path="/admin/contributions" element={<AdminContributions />} />
              <Route path="/admin/claims" element={<AdminClaims />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}