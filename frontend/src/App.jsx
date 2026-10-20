
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useEffect } from 'react'

import Home from './pages/Home/Home.jsx'

import AdminLogin from './pages/Admin/AdminLogin.jsx'
import AdminProtected from './pages/Admin/AdminProtected.jsx'
import AdminDashboard from './pages/Admin/AdminDashboard.jsx'

import TeacherLogin from './pages/Teacher/TeacherLogin.jsx'
import TeacherProtected from './pages/Teacher/TeacherProtected.jsx'
import TeacherDashboard from './pages/Teacher/TeacherDashboard.jsx'
import TeacherChangePassword from './pages/Teacher/TeacherChangePassword.jsx'

function HomeHistory() {
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    if (location.pathname !== '/') return

    // If Home was opened using browser Back, do not add another
    // Home history entry. This avoids creating a Back-button loop.
    const handlePageShow = () => {
      if (window.location.pathname !== '/') return
    }

    window.addEventListener('pageshow', handlePageShow)

    return () => {
      window.removeEventListener('pageshow', handlePageShow)
    }
  }, [location.pathname, navigate])

  return null
}

function App() {
  return (
    <BrowserRouter>
      <HomeHistory />

      <Routes>
        {/* Public pages */}
        <Route path="/" element={<Home />} />
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/teacher/login" element={<TeacherLogin />} />

        {/* Admin protected routes */}
        <Route path="/admin" element={<AdminProtected />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<AdminDashboard />} />
          <Route path="*" element={<Navigate to="dashboard" replace />} />
        </Route>

        {/* Teacher protected routes */}
        <Route path="/teacher" element={<TeacherProtected />}>
          <Route index element={<Navigate to="dashboard" replace />} />

          <Route path="dashboard" element={<TeacherDashboard />} />

          <Route
            path="change-password"
            element={<TeacherChangePassword />}
          />

          {/* Future Teacher pages will remain protected here */}
          <Route
            path="*"
            element={<Navigate to="dashboard" replace />}
          />
        </Route>

        {/* Unknown URLs */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
