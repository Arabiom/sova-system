import { useEffect, useState } from 'react'
import { tr } from '../lib/i18n.js'

const KEY = 'sova.theme'
const dark = () => window.matchMedia?.('(prefers-color-scheme: dark)').matches

/** What the page shows now: the choice saved on this device, else the device's own setting. */
function current() {
  const t = document.documentElement.dataset.theme
  return t === 'dark' || t === 'light' ? t : dark() ? 'dark' : 'light'
}

/** The night / day switch in the top bar; the choice is kept on this device. */
export default function ThemeSwitch() {
  const [theme, setTheme] = useState(current)
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    const follow = () => setTheme(current())
    mq?.addEventListener?.('change', follow)
    return () => mq?.removeEventListener?.('change', follow)
  }, [])
  const flip = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset.theme = next
    try {
      localStorage.setItem(KEY, next)
    } catch {
      /* private window: works for this visit only */
    }
    setTheme(next)
  }
  const label = theme === 'dark' ? tr('الوضع النهاري') : tr('الوضع الليلي')
  return (
    <button type="button" className="theme-switch" onClick={flip} aria-label={label} title={label}>
      {theme === 'dark' ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4.2" />
          <path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7z" />
        </svg>
      )}
    </button>
  )
}
