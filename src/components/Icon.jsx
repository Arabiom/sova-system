// One consistent set of line icons (24×24, drawn with the text colour) in place of emoji in
// the interface chrome — menu, tabs, cards, buttons, headings.

import { ICON_SHAPES } from '../lib/iconShapes.js'

/** A line icon by name (see the list above); size in px, colour from the text. */
export default function Icon({ name, size = 18, className = '', title }) {
  const shapes = ICON_SHAPES[name]
  if (!shapes) return null
  return (
    <svg
      className={`icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title && <title>{title}</title>}
      {shapes.map((s, i) =>
        typeof s === 'string' ? (
          <path key={i} d={s} />
        ) : s.c ? (
          <circle key={i} cx={s.c[0]} cy={s.c[1]} r={s.c[2]} />
        ) : (
          <rect key={i} x={s.r[0]} y={s.r[1]} width={s.r[2]} height={s.r[3]} rx={s.r[4] || 0} />
        ),
      )}
    </svg>
  )
}

