import { useEffect, useState } from 'react'

const CURRENT = typeof __BUILD__ === 'undefined' ? '' : __BUILD__

/**
 * True once the site has been updated since this page was opened: version.json (written at each
 * build) no longer matches this page's build. Checked on load, every few minutes and whenever the
 * tab comes back into view, so everyone on the team ends up on the latest version.
 */
export function useUpdateAvailable(every = 5 * 60_000) {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (!CURRENT || import.meta.env.DEV) return undefined
    let stopped = false
    const check = () =>
      fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((v) => {
          if (!stopped && v?.build && v.build !== CURRENT) setReady(true)
        })
        .catch(() => {})
    check()
    const id = setInterval(check, every)
    const onShow = () => document.visibilityState === 'visible' && check()
    document.addEventListener('visibilitychange', onShow)
    return () => {
      stopped = true
      clearInterval(id)
      document.removeEventListener('visibilitychange', onShow)
    }
  }, [every])
  return ready
}
