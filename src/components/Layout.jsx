import { Suspense, useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { countPendingBookings, watchBookings } from '../api/bookings.js'
import { signOut, useAuth } from '../context/AuthContext.jsx'
import { COMPANY } from '../lib/constants.js'
import { can, ROLES } from '../lib/permissions.js'
import { Loading } from './Feedback.jsx'
import LanguageSwitch from './LanguageSwitch.jsx'
import { Glyph } from './Glyph.jsx'
import Icon from './Icon.jsx'
import { useActivityTracker } from '../lib/useActivityTracker.js'
import { tr, uiLocale } from '../lib/i18n.js'

/** The line icon of each page (menu and top bar). */
const NAV_ICONS = {
  '/dashboard': 'dashboard',
  '/team': 'checkSquare',
  '/register': 'userPlus',
  '/exhibitions': 'landmark',
  '/bookings': 'inbox',
  '/clients': 'contact',
  '/exhibitors': 'store',
  '/finance': 'briefcase',
  '/expenses': 'receipt',
  '/whatsapp': 'message',
  '/staff': 'shield',
}

const NAV = [
  { section: tr('الرئيسية') },
  { path: '/dashboard', icon: '⬡', label: tr('لوحة التحكم'), desc: tr('نظرة عامة شاملة'), sub: tr('نظرة شاملة على أداء الشركة') },
  { path: '/team', icon: '✅', label: tr('المهام والحضور'), desc: tr('مهام الفريق وساعات العمل'), sub: tr('مهام كل موظف، ومتى دخل وكم ساعة عمل، وفعالية الفريق') },
  { path: '/register', icon: '✚', label: tr('تسجيل مشارك'), desc: tr('استمارة وفاتورة'), sub: tr('استمارة تسجيل المشاركين والفاتورة'), perm: 'data.write' },
  { section: tr('المعارض') },
  { path: '/exhibitions', icon: '◈', label: tr('المعارض والمواعيد'), desc: tr('إدارة كل المعارض'), sub: tr('إدارة وتتبع كل المعارض') },
  { path: '/bookings', icon: '◎', label: tr('طلبات الحجز'), desc: tr('مراجعة وقبول الطلبات'), sub: tr('مراجعة وإدارة طلبات العارضين'), badge: true },
  { section: tr('العملاء والمشاركون') },
  { path: '/clients', icon: '◍', label: tr('العملاء'), desc: tr('قاعدة بيانات العملاء'), sub: tr('كل عملاء الشركة وسجل مشاركاتهم') },
  { path: '/exhibitors', icon: '◉', label: tr('العارضون والعقود'), desc: tr('إدارة العارضين'), sub: tr('قاعدة بيانات العارضين والعقود') },
  { section: tr('المالية') },
  { path: '/finance', icon: '💼', label: tr('المالية'), desc: tr('الإيرادات والمصروفات والفواتير'), sub: tr('كل أموال الشركة في مكان واحد: الدفعات، المتبقي، المصروفات، مطالبات الموظفين، والتقارير'), perm: 'money.view' },
  { path: '/expenses', icon: '🧾', label: tr('مصروفاتي'), desc: tr('فواتير ما تصرفه للشركة'), sub: tr('سجّل كل مبلغ تصرفه من أجل الشركة وأرفق فاتورته'), hideFor: 'money.view' },
  { section: tr('التواصل') },
  { path: '/whatsapp', icon: '◎', label: tr('واتساب'), desc: tr('إرسال الإشعارات'), sub: tr('إرسال الإشعارات للعارضين'), perm: 'data.write' },
  { section: tr('الإدارة'), perm: 'staff.manage' },
  { path: '/staff', icon: '◐', label: tr('الموظفون'), desc: tr('الحسابات والصلاحيات'), sub: tr('إدارة حسابات الموظفين وصلاحياتهم'), perm: 'staff.manage' },
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
  const name = staff?.name || email.split('@')[0] || tr('المدير')

  return (
    <nav className={`sidebar ${open ? 'open' : ''}`}>
      <div className="sidebar-brand">
        <div className="sidebar-logo">
          <img className="sidebar-logo-img" src={COMPANY.logoLight} alt={COMPANY.nameEn} />
          <div className="sidebar-tagline">{tr(COMPANY.systemName)}</div>
        </div>
        <div className="sidebar-company">
          <div className="sidebar-company-name">{tr(COMPANY.legalName)}</div>
          <div className="sidebar-company-cr">
            {tr(COMPANY.cr)}{' '}{tr('• مسقط، عُمان')}
          </div>
        </div>
      </div>

      <div className="sidebar-nav">
        {NAV.filter((item) => (!item.perm || can(role, item.perm)) && !(item.hideFor && can(role, item.hideFor))).map((item) =>
          item.section ? (
            <div key={item.section} className="nav-section">
              {tr(item.section)}
            </div>
          ) : (
            <NavLink key={item.path} to={item.path} onClick={onNavigate} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <div className="nav-icon">
                <Glyph e={NAV_ICONS[item.path] || item.icon} size={18} />
              </div>
              <div className="nav-text">
                <div className="nav-label">{tr(item.label)}</div>
                <div className="nav-desc">{tr(item.desc)}</div>
              </div>
              {item.badge && pendingCount > 0 && <span className="nav-badge">{tr(pendingCount)}</span>}
              {item.isNew && <span className="nav-new">NEW</span>}
            </NavLink>
          ),
        )}
      </div>

      <div className="sidebar-user">
        <div className="sidebar-user-row">
          <div className="avatar">{name[0]?.toUpperCase()}</div>
          <div className="sidebar-user-info">
            <div className="sidebar-user-name">{tr(name)}</div>
            <div className="sidebar-user-email">
              {ROLES[role]?.label ? `${ROLES[role].label} • ` : ''}
              {tr(email)}
            </div>
          </div>
          <div className="online-dot" title={tr('متصل')} />
        </div>
        <button className="logout-btn" onClick={signOut}>
          <Icon name="logout" size={16} /> {tr('تسجيل الخروج')}
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
        <button className="menu-btn" onClick={onMenu} aria-label={tr('القائمة')}>
          <Icon name="menu" size={20} />
        </button>
        <div className="topbar-icon">
          <Glyph e={NAV_ICONS[page.path] || page.icon} size={20} />
        </div>
        <div>
          <div className="topbar-title">{tr(page.label)}</div>
          <div className="topbar-sub">{tr(page.sub)}</div>
        </div>
      </div>
      <div className="topbar-meta">
        <LanguageSwitch />
        <div className="topbar-date">
          <div>{now.toLocaleDateString(uiLocale(), { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
          <div className="muted">{now.toLocaleTimeString(uiLocale(), { hour: '2-digit', minute: '2-digit' })}</div>
        </div>
        <div className="topbar-divider" />
        <div className="pill pill-success">
          <span className="dot" />{' '}{tr('متصل • Supabase')}
        </div>
        <div className="pill pill-gold">
          <img className="pill-mark" src={COMPANY.mark} alt="" /> <span>{tr(COMPANY.name)}</span>
        </div>
      </div>
    </header>
  )
}

export default function Layout() {
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const pendingCount = usePendingCount()
  const { role } = useAuth()
  useActivityTracker(Boolean(role))
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
            {tr(COMPANY.legalName)} • {tr(COMPANY.cr)} • {tr(COMPANY.location)}
          </div>
          <div>
            {tr(COMPANY.systemName)} — {tr(COMPANY.nameEn)} {tr(COMPANY.version)} <span className="muted" title={tr('تاريخ آخر تحديث للموقع')}>({typeof __BUILD__ === 'undefined' ? 'dev' : __BUILD__})</span>
          </div>
        </footer>
      </div>
    </div>
  )
}
