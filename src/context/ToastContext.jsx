import { createContext, useCallback, useContext, useRef, useState } from 'react'
import { tr } from '../lib/i18n.js'

const ToastContext = createContext(() => {})

const ICONS = { success: '✅', error: '❌', warn: '⚠️', info: 'ℹ️' }

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null)
  const timer = useRef(null)

  const showToast = useCallback((msg, type = 'success') => {
    clearTimeout(timer.current)
    setToast({ msg, type, key: Date.now() })
    timer.current = setTimeout(() => setToast(null), 3500)
  }, [])

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      {toast && (
        <div key={toast.key} className={`toast toast-${toast.type} fade-in`} role="status">
          {!/^\p{Extended_Pictographic}/u.test(String(toast.msg)) && <span>{ICONS[toast.type] || ICONS.success}</span>} {tr(toast.msg)}
        </div>
      )}
    </ToastContext.Provider>
  )
}

/** `const toast = useToast(); toast('تم الحفظ'); toast('خطأ', 'error')` */
export const useToast = () => useContext(ToastContext)
