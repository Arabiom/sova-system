/**
 * variant: primary | dark | outline | ghost | danger | success | whatsapp
 * size: sm | md | lg
 */
export default function Button({ variant = 'primary', size = 'md', full, icon, children, className = '', type = 'button', ...rest }) {
  const classes = ['btn', `btn-${variant}`, size !== 'md' && `btn-${size}`, full && 'btn-full', className].filter(Boolean)
  return (
    <button type={type} className={classes.join(' ')} {...rest}>
      {icon && <span className="btn-icon">{icon}</span>}
      {children}
    </button>
  )
}
