import { tr } from '../lib/i18n.js'

/** White card with an optional header row (icon, title, subtitle, action on the left). */
export default function Panel({ icon, title, subtitle, action, children, bodyClass = '', className = '' }) {
  return (
    <section className={`panel ${className}`}>
      {title && (
        <header className="panel-header">
          <div className="panel-title-wrap">
            {icon && <div className="panel-icon">{icon}</div>}
            <div>
              <div className="panel-title">{tr(title)}</div>
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
