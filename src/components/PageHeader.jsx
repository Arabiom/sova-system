import { tr } from '../lib/i18n.js'
import { splitLeadingIcon, splitTrailingIcon } from '../lib/icons.js'
import Icon from './Icon.jsx'

/** "المالية 💼" / "💼 المالية" → the title with a line icon before it. */
function titleWithIcon(text) {
  const lead = splitLeadingIcon(text)
  const { icon, text: rest } = lead.icon ? lead : splitTrailingIcon(text)
  if (!icon) return text
  return (
    <span className="page-title-wrap">
      <span className="page-title-icon">
        <Icon name={icon} size={22} />
      </span>
      {rest}
    </span>
  )
}

/**
 * Page title with its actions. `embedded` (a page shown as a tab inside another page) keeps
 * only the actions, as a bar, since the host page already has the title.
 */
export default function PageHeader({ title, subtitle, children, embedded = false }) {
  if (embedded) return children ? <div className="page-actions page-actions-bar mb-16">{children}</div> : null
  return (
    <div className="page-header">
      <div>
        <h1 className="page-title">{titleWithIcon(tr(title))}</h1>
        {subtitle && <div className="page-subtitle">{tr(subtitle)}</div>}
      </div>
      {children && <div className="page-actions">{children}</div>}
    </div>
  )
}
