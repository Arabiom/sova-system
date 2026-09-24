import { Navigate, Route, Routes } from 'react-router-dom'
import { Splash } from './components/Feedback.jsx'
import Layout from './components/Layout.jsx'
import { useAuth } from './context/AuthContext.jsx'
import Bookings from './pages/Bookings.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Exhibitions from './pages/Exhibitions.jsx'
import Exhibitors from './pages/Exhibitors.jsx'
import Login from './pages/Login.jsx'
import PublicBooking from './pages/PublicBooking.jsx'
import Reports from './pages/Reports.jsx'
import Sales from './pages/Sales.jsx'
import WhatsApp from './pages/WhatsApp.jsx'

/** Everything except /book requires a signed-in staff member. */
function Protected() {
  const { session, loading } = useAuth()
  if (loading) return <Splash />
  if (!session) return <Login />
  return <Layout />
}

export default function App() {
  return (
    <Routes>
      <Route path="/book" element={<PublicBooking />} />
      <Route element={<Protected />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/exhibitions" element={<Exhibitions />} />
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
