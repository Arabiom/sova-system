import { useCallback, useEffect, useState } from 'react'
import { useToast } from '../context/ToastContext.jsx'

/**
 * Load data for a page. `loader` returns a promise (usually a Promise.all of API calls).
 * Returns `{ data, loading, reload }`; load errors are shown as a toast.
 * While reloading, the previous data stays on screen.
 */
export function useData(loader, initial) {
  const toast = useToast()
  const [state, setState] = useState({ data: initial, loading: true })
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let cancelled = false
    loader().then(
      (data) => !cancelled && setState({ data, loading: false }),
      (err) => {
        if (cancelled) return
        setState((s) => ({ ...s, loading: false }))
        toast(`تعذّر تحميل البيانات: ${err.message}`, 'error')
      },
    )
    return () => {
      cancelled = true
    }
    // `loader` is a module-level function per page; only an explicit reload should refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version])

  const reload = useCallback(() => setVersion((v) => v + 1), [])
  return { ...state, reload }
}
