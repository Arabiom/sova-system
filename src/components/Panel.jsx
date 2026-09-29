import { tr } from '../lib/i18n.js'
import { splitLeadingIcon } from '../lib/icons.js'
import { Glyph } from './Glyph.jsx'

/** White card with an optional header row (icon, title, subtitle, action on the left). */
export default function Panel({ icon, title, subtitle, action, children, bodyClass = '', className = '' }) {
  // A title written with an emoji ("💳 سجل المدفوعات") shows that emoji as the header icon.
  const split = splitLeadingIcon(typeof title === 'string' ? tr(title) : title)
  const headIcon = icon || split.icon
  return (
    <section className={`panel ${className}`}>
      {title && (
        <header className="panel-header">
          <div className="panel-title-wrap">
            {headIcon && (
              <div className="panel-icon">
                <Glyph e={headIcon} size={18} />
              </div>
            )}
            <div>
              <div className="panel-title">{split.icon ? split.text : tr(title)}</div>
              {subtitle && <div className="panel-subtitle">{tr(subtitle)}</div>}
            </div>
          </div>
          {action}
        </header>
      )}
      <div className={bodyClass}>{children}</div>
    </section>
  )
}
