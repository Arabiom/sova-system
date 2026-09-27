import { lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Splash } from './components/Feedback.jsx'
import Layout from './components/Layout.jsx'
import { useAuth } from './context/AuthContext.jsx'
import Login from './pages/Login.jsx'

// Pages load on demand so the first screen appears quickly.
const Bookings = lazy(() => import('./pages/Bookings.jsx'))
const Clients = lazy(() => import('./pages/Clients.jsx'))
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'))
const ExhibitionFile = lazy(() => import('./pages/ExhibitionFile.jsx'))
const Exhibitions = lazy(() => import('./pages/Exhibitions.jsx'))
const Exhibitors = lazy(() => import('./pages/Exhibitors.jsx'))
const Reports = lazy(() => import('./pages/Reports.jsx'))
const Sales = lazy(() => import('./pages/Sales.jsx'))
const WhatsApp = lazy(() => import('./pages/WhatsApp.jsx'))

/** Internal system: every page requires a signed-in staff member. */
function Protected() {
  const { session, loading } = useAuth()
  if (loading) return <Splash />
  if (!session) return <Login />
  return <Layout />
}

export default function App() {
  return (
    <Routes>
      <Route element={<Protected />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/exhibitions" element={<Exhibitions />} />
        <Route path="/exhibitions/:id" element={<ExhibitionFile />} />
        <Route path="/clients" element={<Clients />} />
        <Route path="/bookings" element={<Bookings />} />
        <Route path="/exhibitors" element={<Exhibitors />} />
        <Route path="/sales" element={<Sales />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/whatsapp" element={<WhatsApp />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  )
}
