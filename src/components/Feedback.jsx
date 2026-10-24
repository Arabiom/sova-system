import { useEffect, useState } from 'react'
import { COMPANY } from '../lib/constants.js'
import { tr } from '../lib/i18n.js'
import { Glyph } from './Glyph.jsx'

export function EmptyState({ icon, text }) {
  return (
    <div className="empty">
      {icon && (
        <div className="empty-icon">
          <Glyph e={icon} size={28} />
        </div>
      )}
      <div>{tr(text)}</div>
    </div>
  )
}

/** Loading… — and, if it lasts (a dropped connection), a way to try again instead of waiting forever. */
export function Loading({ text = 'جاري التحميل...' }) {
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 15000)
    return () => clearTimeout(t)
  }, [])
  return (
    <div className="loading">
      {tr(text)}
      {slow && (
        <div className="mt-8">
          <div className="small muted mb-8">{tr('التحميل يتأخر — تحقق من الإنترنت')}</div>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => window.location.reload()}>
            {tr('🔄 إعادة المحاولة')}
          </button>
        </div>
      )}
    </div>
  )
}

export function Splash() {
  return (
    <div className="splash">
      <img className="splash-logo" src={COMPANY.logoLight} alt={COMPANY.nameEn} />
      <div className="splash-text">{tr('جاري التحميل...')}</div>
      <div className="splash-bar pulse" />
    </div>
  )
}
