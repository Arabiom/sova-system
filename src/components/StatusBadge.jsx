import { STATUS_TONES } from '../lib/constants.js'
import { tr } from '../lib/i18n.js'

export default function StatusBadge({ status }) {
  if (!status) return null
  return <span className={`badge badge-${STATUS_TONES[status] || 'neutral'}`}>{tr(status)}</span>
}

export function Chip({ children }) {
  return <span className="chip">{tr(children)}</span>
}
