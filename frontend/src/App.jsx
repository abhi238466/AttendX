
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
} from 'react-router-dom'

import Home from './pages/Home/Home.jsx'

// Admin pages
import AdminLogin from './pages/Admin/AdminLogin.jsx'
import AdminProtected from './pages/Admin/AdminProtected.jsx'
import AdminDashboard from './pages/Admin/AdminDashboard.jsx'

// Teacher pages
import TeacherLogin from './pages/Teacher/TeacherLogin.jsx'
import TeacherProtected from './pages/Teacher/TeacherProtected.jsx'
import TeacherDashboard from './pages/Teacher/TeacherDashboard.jsx'
import TeacherChangePassword from './pages/Teacher/TeacherChangePassword.jsx'
import StartAttendance from './pages/Teacher/StartAttendance.jsx'
import AttendanceHistory from './pages/Teacher/AttendanceHistory.jsx'
import TeacherProfile from './pages/Teacher/TeacherProfile.jsx'
import LiveAttendance from './pages/Teacher/LiveAttendance.jsx'

// Student page
import StudentAttendance from './pages/Student/StudentAttendance.jsx'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Home */}
        <Route path="/" element={<Home />} />

        {/* Admin login */}
        <Route path="/admin/login" element={<AdminLogin />} />

        {/* Teacher login */}
        <Route path="/teacher/login" element={<TeacherLogin />} />

        {/* Student attendance: QR or text-code flow */}
        <Route
          path="/student/attendance"
          element={<StudentAttendance />}
        />

        {/* Protected admin routes */}
        <Route path="/admin" element={<AdminProtected />}>
          <Route
            index
            element={<Navigate to="dashboard" replace />}
          />
          <Route
            path="dashboard"
            element={<AdminDashboard />}
          />
          <Route
            path="*"
            element={<Navigate to="dashboard" replace />}
          />
        </Route>

        {/* Protected teacher routes */}
        <Route path="/teacher" element={<TeacherProtected />}>
          <Route
            index
            element={<Navigate to="dashboard" replace />}
          />
          <Route
            path="dashboard"
            element={<TeacherDashboard />}
          />
          <Route
            path="change-password"
            element={<TeacherChangePassword />}
          />
          <Route
            path="start-attendance"
            element={<StartAttendance />}
          />
          <Route
            path="live-attendance/:sessionId"
            element={<LiveAttendance />}
          />
          <Route
            path="attendance-history"
            element={<AttendanceHistory />}
          />
          <Route
            path="profile"
            element={<TeacherProfile />}
          />
          <Route
            path="*"
            element={<Navigate to="dashboard" replace />}
          />
        </Route>

        {/* Unknown URL */}
        <Route
          path="*"
          element={<Navigate to="/" replace />}
        />
      </Routes>
    </BrowserRouter>
  )
}

export default App
