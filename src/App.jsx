import { lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Splash } from './components/Feedback.jsx'
import Layout from './components/Layout.jsx'
import { signOut, useAuth, useCan } from './context/AuthContext.jsx'
import Login from './pages/Login.jsx'

// Pages load on demand so the first screen appears quickly.
const Bookings = lazy(() => import('./pages/Bookings.jsx'))
const Clients = lazy(() => import('./pages/Clients.jsx'))
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'))
const ExhibitionFile = lazy(() => import('./pages/ExhibitionFile.jsx'))
const Exhibitions = lazy(() => import('./pages/Exhibitions.jsx'))
const Exhibitors = lazy(() => import('./pages/Exhibitors.jsx'))
const Register = lazy(() => import('./pages/Register.jsx'))
const Expenses = lazy(() => import('./pages/Expenses.jsx'))
const Reports = lazy(() => import('./pages/Reports.jsx'))
const Sales = lazy(() => import('./pages/Sales.jsx'))
const WhatsApp = lazy(() => import('./pages/WhatsApp.jsx'))
const Staff = lazy(() => import('./pages/Staff.jsx'))

/** Internal system: every page requires a signed-in staff member. */
function Protected() {
  const { session, loading, role, staffError } = useAuth()
  if (loading) return <Splash />
  if (!session) return <Login />
  if (!role) return <NoAccess error={staffError} />
  return <Layout />
}

/** Signed in, but no staff role (removed by an admin, or the role could not be loaded). */
function NoAccess({ error }) {
  return (
    <div className="login">
      <div className="login-box">
        <div className="login-card center">
          <div className="empty-icon">🔒</div>
          <div className="login-title">لا توجد صلاحية دخول</div>
          <div className="login-hint">{error || 'حسابك غير مفعّل في النظام. تواصل مع مدير النظام لإضافة صلاحيتك.'}</div>
          <button className="btn btn-outline btn-full" onClick={signOut}>
            تسجيل الخروج
          </button>
        </div>
      </div>
    </div>
  )
}

/** Route only for roles with `permission`; others land on the dashboard. */
function Allow({ permission, children }) {
  return useCan(permission) ? children : <Navigate to="/dashboard" replace />
}

export default function App() {
  return (
    <Routes>
      <Route element={<Protected />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route
          path="/register"
          element={
            <Allow permission="data.write">
              <Register />
            </Allow>
          }
        />
        <Route path="/exhibitions" element={<Exhibitions />} />
        <Route path="/exhibitions/:id" element={<ExhibitionFile />} />
        <Route path="/clients" element={<Clients />} />
        <Route path="/bookings" element={<Bookings />} />
        <Route path="/exhibitors" element={<Exhibitors />} />
        <Route
          path="/sales"
          element={
            <Allow permission="money.view">
              <Sales />
            </Allow>
          }
        />
        <Route
          path="/reports"
          element={
            <Allow permission="reports.view">
              <Reports />
            </Allow>
          }
        />
        <Route
          path="/staff"
          element={
            <Allow permission="staff.manage">
              <Staff />
            </Allow>
          }
        />
        <Route path="/expenses" element={<Expenses />} />
        <Route
          path="/whatsapp"
          element={
            <Allow permission="data.write">
              <WhatsApp />
            </Allow>
          }
        />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  )
}
