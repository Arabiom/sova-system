/** Dashboard metric tile. `flat` renders the compact variant used on the finance pages. */
export default function StatCard({ label, value, sub, accent = 'var(--gold)', icon, onClick, flat }) {
  if (flat) {
    return (
      <div className="stat-flat" style={{ '--accent': accent }}>
        <div className="stat-flat-label">
          {icon} {label}
        </div>
        <div className="stat-flat-value num">{value}</div>
        {sub && <div className="stat-sub">{sub}</div>}
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
        <div className="stat-card-label">{label}</div>
        <div className="stat-card-icon">{icon}</div>
      </div>
      <div className="stat-card-value num">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
      {onClick && <div className="stat-card-hint">اضغط للتفاصيل ↗</div>}
    </div>
  )
}
