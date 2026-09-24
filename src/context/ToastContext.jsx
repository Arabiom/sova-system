import { createContext, useCallback, useContext, useRef, useState } from 'react'

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
          <span>{ICONS[toast.type] || ICONS.success}</span> {toast.msg}
        </div>
      )}
    </ToastContext.Provider>
  )
}

/** `const toast = useToast(); toast('تم الحفظ'); toast('خطأ', 'error')` */
export const useToast = () => useContext(ToastContext)
