import { percent } from '../lib/format.js'

const toneFor = (pct) => (pct > 70 ? 'var(--suc-l)' : pct > 40 ? 'var(--gold)' : 'var(--wrn-l)')

export function ProgressBar({ pct, color, height = 6 }) {
  return (
    <div className="progress" style={{ height }}>
      <div className="progress-fill" style={{ width: `${Math.min(100, pct)}%`, background: color || toneFor(pct) }} />
    </div>
  )
}

/** "label ........ val/max (pct%)" with a bar underneath. */
export function ProgressRow({ label, sub, val, max, color }) {
  const pct = Math.min(100, percent(val, max))
  const tone = color || toneFor(pct)
  return (
    <div className="progress-row">
      <div className="progress-row-head">
        <div>
          <div className="progress-row-label">{label}</div>
          {sub && <div className="progress-row-sub">{sub}</div>}
        </div>
        <div className="progress-row-value">
          <span style={{ color: tone }}>{val}</span>
          <span className="muted">/{max}</span>
          <div style={{ color: tone }}>{pct}%</div>
        </div>
      </div>
      <ProgressBar pct={pct} color={tone} height={7} />
    </div>
  )
}

/** Horizontal share bar used in the reports breakdowns. */
export function ShareRow({ label, valueText, value, total, color }) {
  const pct = percent(value, total)
  return (
    <div className="share-row">
      <div className="share-row-head">
        <span>{label}</span>
        <strong>
          {valueText} ({pct}%)
        </strong>
      </div>
      <ProgressBar pct={pct} color={color} />
    </div>
  )
}
