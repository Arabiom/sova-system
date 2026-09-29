/**
 * variant: primary | dark | outline | ghost | danger | success | whatsapp
 * size: sm | md | lg
 */
import { Glyph, IconText } from './Glyph.jsx'

export default function Button({ variant = 'primary', size = 'md', full, icon, children, className = '', type = 'button', ...rest }) {
  const classes = ['btn', `btn-${variant}`, size !== 'md' && `btn-${size}`, full && 'btn-full', className].filter(Boolean)
  return (
    <button type={type} className={classes.join(' ')} {...rest}>
      {icon && (
        <span className="btn-icon">
          <Glyph e={icon} size={16} />
        </span>
      )}
      {typeof children === 'string' ? <IconText text={children} size={16} /> : children}
    </button>
  )
}
