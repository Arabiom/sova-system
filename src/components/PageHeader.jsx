import { tr } from '../lib/i18n.js'

/**
 * Page title with its actions. `embedded` (a page shown as a tab inside another page) keeps
 * only the actions, as a bar, since the host page already has the title.
 */
export default function PageHeader({ title, subtitle, children, embedded = false }) {
  if (embedded) return children ? <div className="page-actions page-actions-bar mb-16">{children}</div> : null
  return (
    <div className="page-header">
      <div>
        <h1 className="page-title">{tr(title)}</h1>
        {subtitle && <div className="page-subtitle">{tr(subtitle)}</div>}
      </div>
      {children && <div className="page-actions">{children}</div>}
    </div>
  )
}
