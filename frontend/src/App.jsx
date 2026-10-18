
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'

import Home from './pages/Home/Home.jsx'
import AdminLogin from './pages/Admin/AdminLogin.jsx'
import AdminProtected from './pages/Admin/AdminProtected.jsx'
import AdminDashboard from './pages/Admin/AdminDashboard.jsx'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public pages */}
        <Route path="/" element={<Home />} />
        <Route path="/admin/login" element={<AdminLogin />} />

        {/* All routes inside this section require Admin login */}
        <Route path="/admin" element={<AdminProtected />}>
          <Route
            index
            element={<Navigate to="dashboard" replace />}
          />

          <Route
            path="dashboard"
            element={<AdminDashboard />}
          />

          {/* Unknown Admin pages */}
          <Route
            path="*"
            element={<Navigate to="dashboard" replace />}
          />
        </Route>

        {/* Unknown non-Admin URLs */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
