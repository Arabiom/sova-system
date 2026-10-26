import { createContext, useContext, useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { tr } from '../lib/i18n.js'
import { can, canEditRecord } from '../lib/permissions.js'

// The database library is large. Public pages (the official site, the booking form) do not wait
// for it: it is loaded the first time someone opens the internal system.
const loadSupabase = () => import('../lib/supabase.js').then((m) => m.supabase)
const PUBLIC_PATHS = ['/', '/book', '/book/'] // «/book/» is the booking page's own file (scripts/public-pages.mjs)

/** A saved sign-in on this device (enough for the site to say «لوحة التحكم» instead of «دخول»). */
function hasSavedSession() {
  try {
    return Object.keys(localStorage).some((k) => /^sb-.+-auth-token$/.test(k))
  } catch {
    return false
  }
}

const AuthContext = createContext({ session: null, loading: true, role: null, staff: null })

export function AuthProvider({ children }) {
  const { pathname } = useLocation()
  const [started, setStarted] = useState(() => !PUBLIC_PATHS.includes(pathname))
  if (!started && !PUBLIC_PATHS.includes(pathname)) setStarted(true)
  const [session, setSession] = useState({ value: null, loading: true })
  const [staff, setStaff] = useState({ userId: null, value: null, error: '' })

  useEffect(() => {
    if (!started) return
    let live = true
    let subscription
    loadSupabase().then((supabase) => {
      if (!live) return
      supabase.auth.getSession().then(({ data }) => live && setSession({ value: data.session, loading: false }))
      subscription = supabase.auth.onAuthStateChange((_event, s) => live && setSession({ value: s, loading: false })).data.subscription
    })
    return () => {
      live = false
      subscription?.unsubscribe()
    }
  }, [started])

  const userId = session.value?.user?.id || null
  useEffect(() => {
    if (!userId) return
    let cancelled = false
    // Staff role and company settings (VAT on/off) load together, before any page renders.
    Promise.all([import('../api/staff.js'), import('../api/settings.js')])
      .then(([{ fetchMyStaff }, { applySettings, DEFAULT_SETTINGS, fetchSettings }]) => Promise.all([fetchMyStaff(userId), fetchSettings().catch(() => DEFAULT_SETTINGS), applySettings]))
      .then(
        ([value, settings, applySettings]) => {
          if (cancelled) return
          applySettings(settings)
          setStaff({ userId, value, error: '' })
        },
        (err) => !cancelled && setStaff({ userId, value: null, error: err.message }),
      )
    return () => {
      cancelled = true
    }
  }, [userId])

  const staffReady = !userId || staff.userId === userId
  const value = {
    // on a public page before the system was opened: whether this device is signed in
    session: started ? session.value : hasSavedSession() ? { saved: true } : null,
    loading: session.loading || !staffReady,
    staff: staffReady ? staff.value : null,
    // an account waiting for the admin (migration 043) has no role yet
    staffError: staffReady ? (staff.value?.role === 'pending' ? tr('حسابك بانتظار تفعيل المدير — سيصلك الدخول بعد أن يمنحك صلاحية.') : staff.error) : '',
    role: staffReady && staff.value?.role !== 'pending' ? staff.value?.role || null : null,
  }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)

/** `const allowed = useCan('payments.write')` */
export function useCan(permission) {
  const { role } = useContext(AuthContext)
  return can(role, permission)
}

export const signIn = async (email, password) => (await loadSupabase()).auth.signInWithPassword({ email: email.trim(), password })
export const signOut = async () => (await loadSupabase()).auth.signOut()

/** `const canEdit = useCanEdit(); canEdit(exhibitor)` — false for another marketer's records. */
export function useCanEdit() {
  const { role, session } = useContext(AuthContext)
  const userId = session?.user?.id
  return (record) => canEditRecord(role, userId, record)
}
