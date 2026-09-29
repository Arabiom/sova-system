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

export function Loading({ text = 'جاري التحميل...' }) {
  return <div className="loading">{tr(text)}</div>
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
