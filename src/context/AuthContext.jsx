import { createContext, useContext, useEffect, useState } from 'react'
import { fetchMyStaff } from '../api/staff.js'
import { applySettings, DEFAULT_SETTINGS, fetchSettings } from '../api/settings.js'
import { supabase } from '../lib/supabase.js'
import { can, canEditRecord } from '../lib/permissions.js'

const AuthContext = createContext({ session: null, loading: true, role: null, staff: null })

export function AuthProvider({ children }) {
  const [session, setSession] = useState({ value: null, loading: true })
  const [staff, setStaff] = useState({ userId: null, value: null, error: '' })

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession({ value: data.session, loading: false }))
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession({ value: s, loading: false }))
    return () => data.subscription.unsubscribe()
  }, [])

  const userId = session.value?.user?.id || null
  useEffect(() => {
    if (!userId) return
    let cancelled = false
    // Staff role and company settings (VAT on/off) load together, before any page renders.
    Promise.all([fetchMyStaff(userId), fetchSettings().catch(() => DEFAULT_SETTINGS)]).then(
      ([value, settings]) => {
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
    session: session.value,
    loading: session.loading || !staffReady,
    staff: staffReady ? staff.value : null,
    staffError: staffReady ? staff.error : '',
    role: staffReady ? staff.value?.role || null : null,
  }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)

/** `const allowed = useCan('payments.write')` */
export function useCan(permission) {
  const { role } = useContext(AuthContext)
  return can(role, permission)
}

export const signIn = (email, password) => supabase.auth.signInWithPassword({ email: email.trim(), password })
export const signOut = () => supabase.auth.signOut()

/** `const canEdit = useCanEdit(); canEdit(exhibitor)` — false for another marketer's records. */
export function useCanEdit() {
  const { role, session } = useContext(AuthContext)
  const userId = session?.user?.id
  return (record) => canEditRecord(role, userId, record)
}
