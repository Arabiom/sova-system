import { STATUS_TONES } from '../lib/constants.js'

export default function StatusBadge({ status }) {
  if (!status) return null
  return <span className={`badge badge-${STATUS_TONES[status] || 'neutral'}`}>{status}</span>
}

export function Chip({ children }) {
  return <span className="chip">{children}</span>
}
