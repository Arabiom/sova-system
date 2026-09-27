import { Suspense, useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { countPendingBookings, watchBookings } from '../api/bookings.js'
import { signOut, useAuth } from '../context/AuthContext.jsx'
import { COMPANY } from '../lib/constants.js'
import { can, ROLES } from '../lib/permissions.js'
import { Loading } from './Feedback.jsx'

const NAV = [
  { section: 'الرئيسية' },
  { path: '/dashboard', icon: '⬡', label: 'لوحة التحكم', desc: 'نظرة عامة شاملة', sub: 'نظرة شاملة على أداء الشركة' },
  { path: '/register', icon: '✚', label: 'تسجيل مشارك', desc: 'استمارة وفاتورة', sub: 'استمارة تسجيل المشاركين والفاتورة', perm: 'data.write' },
  { section: 'المعارض' },
  { path: '/exhibitions', icon: '◈', label: 'المعارض والمواعيد', desc: 'إدارة كل المعارض', sub: 'إدارة وتتبع كل المعارض' },
  { path: '/bookings', icon: '◎', label: 'طلبات الحجز', desc: 'مراجعة وقبول الطلبات', sub: 'مراجعة وإدارة طلبات العارضين', badge: true },
  { section: 'الأعمال' },
  { path: '/clients', icon: '◍', label: 'العملاء', desc: 'قاعدة بيانات العملاء', sub: 'كل عملاء الشركة وسجل مشاركاتهم' },
  { path: '/exhibitors', icon: '◉', label: 'العارضون والعقود', desc: 'إدارة العارضين', sub: 'قاعدة بيانات العارضين والعقود' },
  { path: '/sales', icon: '◆', label: 'المبيعات والمدفوعات', desc: 'التتبع المالي', sub: 'التتبع المالي الشامل', perm: 'money.view' },
  { path: '/expenses', icon: '🧾', label: 'المصروفات والفواتير', desc: 'فواتير ما يصرفه الموظفون', sub: 'كل ما يصرفه الموظفون من أجل الشركة مع فواتيره' },
  { path: '/reports', icon: '◈', label: 'التقارير المالية', desc: 'تحليل الأداء', sub: 'تحليل الأداء والإيرادات', perm: 'reports.view' },
  { section: 'التواصل' },
  { path: '/whatsapp', icon: '◎', label: 'واتساب', desc: 'إرسال الإشعارات', sub: 'إرسال الإشعارات للعارضين', perm: 'data.write' },
  { section: 'الإدارة', perm: 'staff.manage' },
  { path: '/staff', icon: '◐', label: 'الموظفون', desc: 'الحسابات والصلاحيات', sub: 'إدارة حسابات الموظفين وصلاحياتهم', perm: 'staff.manage' },
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
  const { session, role, staff } = useAuth()
  const email = session?.user?.email || ''
  const name = staff?.name || email.split('@')[0] || 'المدير'

  return (
    <nav className={`sidebar ${open ? 'open' : ''}`}>
      <div className="sidebar-brand">
        <div className="sidebar-logo">
          <img className="sidebar-logo-img" src={COMPANY.logoLight} alt={COMPANY.nameEn} />
          <div className="sidebar-tagline">{COMPANY.systemName}</div>
        </div>
        <div className="sidebar-company">
          <div className="sidebar-company-name">{COMPANY.legalName}</div>
          <div className="sidebar-company-cr">
            {COMPANY.cr} • مسقط، عُمان
          </div>
        </div>
      </div>

      <div className="sidebar-nav">
        {NAV.filter((item) => !item.perm || can(role, item.perm)).map((item) =>
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
      </div>

      <div className="sidebar-user">
        <div className="sidebar-user-row">
          <div className="avatar">{name[0]?.toUpperCase()}</div>
          <div className="sidebar-user-info">
            <div className="sidebar-user-name">{name}</div>
            <div className="sidebar-user-email">
              {ROLES[role]?.label ? `${ROLES[role].label} • ` : ''}
              {email}
            </div>
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
          <img className="pill-mark" src={COMPANY.mark} alt="" /> <span>{COMPANY.name}</span>
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
          <Suspense fallback={<Loading />}>
            <Outlet />
          </Suspense>
        </main>
        <footer className="footer">
          <div>
            {COMPANY.legalName} • {COMPANY.cr} • {COMPANY.location}
          </div>
          <div>
            {COMPANY.systemName} — {COMPANY.nameEn} {COMPANY.version}
          </div>
        </footer>
      </div>
    </div>
  )
}
