import { createContext, useCallback, useContext, useRef, useState } from 'react'
import { tr } from '../lib/i18n.js'
import Icon from '../components/Icon.jsx'

const ToastContext = createContext(() => {})

const ICONS = { success: 'checkCircle', error: 'stop', warn: 'warning', info: 'info' }

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
        <div key={toast.key} className={`toast toast-${toast.type}`} role="status">
          <span className="toast-icon">
            <Icon name={ICONS[toast.type] || ICONS.success} size={18} />
          </span>
          <span>{String(tr(toast.msg)).replace(/^(\p{Extended_Pictographic}\uFE0F?\s*)+/u, '')}</span>
        </div>
      )}
    </ToastContext.Provider>
  )
}

/** `const toast = useToast(); toast('تم الحفظ'); toast('خطأ', 'error')` */
export const useToast = () => useContext(ToastContext)
