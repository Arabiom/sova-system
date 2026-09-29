import { tr } from '../lib/i18n.js'
import { Glyph } from './Glyph.jsx'
import Icon from './Icon.jsx'

/** Dashboard metric tile. `flat` renders the compact variant used on the finance pages. */
export default function StatCard({ label, value, sub, accent = 'var(--gold)', icon, onClick, flat }) {
  if (flat) {
    return (
      <div
        className={`stat-flat ${onClick ? 'clickable' : ''}`}
        style={{ '--accent': accent }}
        onClick={onClick}
        role={onClick ? 'button' : undefined}
        tabIndex={onClick ? 0 : undefined}
        onKeyDown={onClick ? (e) => e.key === 'Enter' && onClick() : undefined}
      >
        <div className="stat-flat-label">
          {icon && (
            <span className="stat-flat-icon">
              <Glyph e={icon} size={15} />
            </span>
          )}
          {tr(label)}
        </div>
        <div className="stat-flat-value num">{tr(value)}</div>
        {sub && <div className="stat-sub">{tr(sub)}</div>}
      </div>
    )
  }
  return (
    <div
      className={`stat-card ${onClick ? 'clickable' : ''}`}
      style={{ '--accent': accent }}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => e.key === 'Enter' && onClick() : undefined}
    >
      <div className="stat-card-head">
        <div className="stat-card-label">{tr(label)}</div>
        <div className="stat-card-icon">
          <Glyph e={icon} size={20} />
        </div>
      </div>
      <div className="stat-card-value num">{tr(value)}</div>
      {sub && <div className="stat-sub">{tr(sub)}</div>}
      {onClick && (
        <div className="stat-card-hint">
          {tr('التفاصيل')} <Icon name="arrowOut" size={12} />
        </div>
      )}
    </div>
  )
}
