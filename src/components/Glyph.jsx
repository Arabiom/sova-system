import { EMOJI_ICON, splitLeadingIcon } from '../lib/icons.js'
import { hasIcon } from '../lib/iconShapes.js'
import Icon from './Icon.jsx'

/** An icon given as an emoji ("🏛️"), an icon name ("landmark") or any element. */
export function Glyph({ e, size = 18 }) {
  if (typeof e !== 'string') return e ?? null
  const name = hasIcon(e) ? e : EMOJI_ICON[e] || EMOJI_ICON[e.replace(/️/g, '')]
  return name ? <Icon name={name} size={size} /> : <span className="glyph-emoji">{e}</span>
}

/** A label whose leading emoji becomes a line icon: "📊 نظرة عامة" → [icon] نظرة عامة. */
export function IconText({ text, size = 16 }) {
  const { icon, text: rest } = splitLeadingIcon(text)
  if (!icon) return text
  return (
    <span className="icon-text">
      <Icon name={icon} size={size} />
      <span>{rest}</span>
    </span>
  )
}
