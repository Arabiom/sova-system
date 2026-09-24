import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { countPendingBookings, watchBookings } from '../api/bookings.js'
import { signOut, useAuth } from '../context/AuthContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { COMPANY } from '../lib/constants.js'

const NAV = [
  { section: 'الرئيسية' },
  { path: '/dashboard', icon: '⬡', label: 'لوحة التحكم', desc: 'نظرة عامة شاملة', sub: 'نظرة شاملة على أداء SOVA' },
  { section: 'المعارض' },
  { path: '/exhibitions', icon: '◈', label: 'المعارض والمواعيد', desc: 'إدارة كل المعارض', sub: 'إدارة وتتبع كل المعارض' },
  { path: '/bookings', icon: '◎', label: 'طلبات الحجز', desc: 'مراجعة وقبول الطلبات', sub: 'مراجعة وإدارة طلبات العارضين', badge: true },
  { section: 'الأعمال' },
  { path: '/exhibitors', icon: '◉', label: 'العارضون والعقود', desc: 'إدارة العارضين', sub: 'قاعدة بيانات العارضين والعقود' },
  { path: '/sales', icon: '◆', label: 'المبيعات والمدفوعات', desc: 'التتبع المالي', sub: 'التتبع المالي الشامل' },
  { path: '/reports', icon: '◈', label: 'التقارير المالية', desc: 'تحليل الأداء', sub: 'تحليل الأداء والإيرادات' },
  { section: 'التواصل' },
  { path: '/whatsapp', icon: '◎', label: 'واتساب SOVA', desc: 'إرسال الإشعارات', sub: 'إرسال الإشعارات للعارضين', isNew: true },
]

/** Number of pending booking requests, kept live through Supabase realtime. */
function usePendingCount() {
  const [count, setCount] = useState(0)
  useEffect(() => {
    const refresh = () => countPendingBookings().then(setCount).catch(() => {})
    refresh()
    return watchBookings(refresh)
  }, [])
  return count
}

function Sidebar({ open, onNavigate, pendingCount }) {
  const { session } = useAuth()
  const toast = useToast()
  const email = session?.user?.email || ''
  const name = email.split('@')[0] || 'المدير'
  const bookingLink = `${window.location.origin}/book`

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(bookingLink)
      toast('📋 تم نسخ رابط التسجيل')
    } catch {
      toast('تعذّر النسخ — انسخ الرابط يدوياً', 'warn')
    }
  }

  return (
    <nav className={`sidebar ${open ? 'open' : ''}`}>
      <div className="sidebar-brand">
        <div className="sidebar-logo">
          <div className="logo-mark">S</div>
          <div>
            <div className="sidebar-name">SOVA</div>
            <div className="sidebar-tagline">EXHIBITION SYSTEM</div>
          </div>
        </div>
        <div className="sidebar-company">
          <div className="sidebar-company-name">{COMPANY.name}</div>
          <div className="sidebar-company-cr">
            {COMPANY.cr} • مسقط، عُمان
          </div>
        </div>
      </div>

      <div className="sidebar-nav">
        {NAV.map((item) =>
          item.section ? (
            <div key={item.section} className="nav-section">
              {item.section}
            </div>
          ) : (
            <NavLink key={item.path} to={item.path} onClick={onNavigate} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <div className="nav-icon">{item.icon}</div>
              <div className="nav-text">
                <div className="nav-label">{item.label}</div>
                <div className="nav-desc">{item.desc}</div>
              </div>
              {item.badge && pendingCount > 0 && <span className="nav-badge">{pendingCount}</span>}
              {item.isNew && <span className="nav-new">NEW</span>}
            </NavLink>
          ),
        )}

        <button className="booking-link" onClick={copyLink}>
          <div className="booking-link-title">🔗 رابط تسجيل العارضين</div>
          <div className="booking-link-url">{bookingLink}</div>
          <div className="booking-link-hint">📋 اضغط لنسخ الرابط</div>
        </button>
      </div>

      <div className="sidebar-user">
        <div className="sidebar-user-row">
          <div className="avatar">{name[0]?.toUpperCase()}</div>
          <div className="sidebar-user-info">
            <div className="sidebar-user-name">{name}</div>
            <div className="sidebar-user-email">{email}</div>
          </div>
          <div className="online-dot" title="متصل" />
        </div>
        <button className="logout-btn" onClick={signOut}>
          تسجيل الخروج
        </button>
      </div>
    </nav>
  )
}

function Topbar({ page, onMenu }) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  return (
    <header className="topbar">
      <div className="topbar-title-wrap">
        <button className="menu-btn" onClick={onMenu} aria-label="القائمة">
          ☰
        </button>
        <div className="topbar-icon">{page.icon}</div>
        <div>
          <div className="topbar-title">{page.label}</div>
          <div className="topbar-sub">{page.sub}</div>
        </div>
      </div>
      <div className="topbar-meta">
        <div className="topbar-date">
          <div>{now.toLocaleDateString('ar-OM', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
          <div className="muted">{now.toLocaleTimeString('ar-OM', { hour: '2-digit', minute: '2-digit' })}</div>
        </div>
        <div className="topbar-divider" />
        <div className="pill pill-success">
          <span className="dot" /> متصل • Supabase
        </div>
        <div className="pill pill-gold">
          <strong>SOVA</strong> <span className="muted">محور الأعمال</span>
        </div>
      </div>
    </header>
  )
}

export default function Layout() {
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const pendingCount = usePendingCount()
  const page = NAV.find((item) => item.path && location.pathname.startsWith(item.path)) || NAV[1]

  return (
    <div className="app">
      <Sidebar open={menuOpen} onNavigate={() => setMenuOpen(false)} pendingCount={pendingCount} />
      {menuOpen && <div className="sidebar-overlay" onClick={() => setMenuOpen(false)} />}
      <div className="main">
        <Topbar page={page} onMenu={() => setMenuOpen(true)} />
        <main key={location.pathname} className="content fade-in">
          <Outlet />
        </main>
        <footer className="footer">
          <div>
            {COMPANY.name} • {COMPANY.cr} • {COMPANY.location}
          </div>
          <div>SOVA Exhibition System {COMPANY.version}</div>
        </footer>
      </div>
    </div>
  )
}
