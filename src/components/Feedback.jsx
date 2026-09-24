export function EmptyState({ icon, text }) {
  return (
    <div className="empty">
      {icon && <div className="empty-icon">{icon}</div>}
      <div>{text}</div>
    </div>
  )
}

export function Loading({ text = 'جاري التحميل...' }) {
  return <div className="loading">{text}</div>
}

export function Splash() {
  return (
    <div className="splash">
      <div className="logo-mark logo-lg">S</div>
      <div className="splash-text">SOVA SYSTEM LOADING...</div>
      <div className="splash-bar pulse" />
    </div>
  )
}
