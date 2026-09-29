// Emoji (and the old menu glyphs) → line icon names, so labels written with an emoji show a
// proper icon in the interface. Emoji without an icon here are shown as they are.

export const EMOJI_ICON = {
  '📊': 'chart', '💵': 'banknote', '⏳': 'hourglass', '🧾': 'receipt', '👥': 'users', '🏛️': 'landmark', '🏛': 'landmark',
  '👔': 'userCheck', '🗓️': 'calendar', '🗓': 'calendar', '📅': 'calendar', '📆': 'calendar', '📒': 'book', '📈': 'trending',
  '💼': 'briefcase', '📋': 'clipboard', '🕓': 'clock', '🕘': 'history', '📌': 'pin', '🏦': 'wallet', '🏢': 'building',
  '🎯': 'target', '⚖️': 'scale', '⚖': 'scale', '🗺️': 'map', '🗺': 'map', '🤝': 'handshake', '⭐': 'star', '🌟': 'sparkles',
  '🏷️': 'tag', '🏷': 'tag', '💰': 'coins', '📱': 'message', '🖨️': 'printer', '🖨': 'printer', '⬇️': 'download', '⬇': 'download',
  '📥': 'inbox', '📬': 'inbox', '📎': 'clip', '🔄': 'refresh', '🗑️': 'trash', '🗑': 'trash', '✏️': 'pencil', '✏': 'pencil',
  '➕': 'plus', '✚': 'userPlus', '📍': 'mapPin', '💳': 'card', '📝': 'file', '📄': 'file', '📦': 'package', '🔁': 'repeat',
  '⏰': 'alarm', '✅': 'checkCircle', '⚠️': 'warning', '⚠': 'warning', '⛔': 'stop', 'ℹ️': 'info', 'ℹ': 'info',
  '🔍': 'search', '🔎': 'search', '📂': 'folder', '💾': 'save', '🏆': 'trophy', '📣': 'megaphone', '✉️': 'mail', '✉': 'mail',
  '⏱️': 'timer', '⏱': 'timer', '⬆️': 'arrowUp', '↩️': 'undo', '⏭': 'skip', '⏭️': 'skip', '🔒': 'lock', '🌐': 'globe',
  '💹': 'trending', '🧭': 'map', '🖼️': 'image', '📐': 'scale', '👤': 'userCheck', '🙏': 'sparkles', '📑': 'file',
  // old menu glyphs
  '⬡': 'dashboard', '◈': 'landmark', '◎': 'inbox', '◍': 'contact', '◉': 'store', '◐': 'shield', '☰': 'menu',
}

// A leading emoji (with its variation selector / joiners) or one of the menu glyphs.
const LEADING = /^((?:\p{Extended_Pictographic}|[⬡◈◎◍◉◐✚☰])(?:️)?(?:‍\p{Extended_Pictographic}️?)*)\s*/u

/** Split "📊 نظرة عامة" into { icon: 'chart', text: 'نظرة عامة' } (icon null when unknown). */
export function splitLeadingIcon(text) {
  if (typeof text !== 'string') return { icon: null, text }
  const m = text.match(LEADING)
  if (!m) return { icon: null, text }
  const icon = EMOJI_ICON[m[1]] || EMOJI_ICON[m[1].replace(/️/g, '')] || null
  return icon ? { icon, text: text.slice(m[0].length) } : { icon: null, text }
}

/** Same for a trailing emoji ("المالية 💼"). */
export function splitTrailingIcon(text) {
  if (typeof text !== 'string') return { icon: null, text }
  const m = text.match(/\s*((?:\p{Extended_Pictographic})️?)$/u)
  if (!m) return { icon: null, text }
  const icon = EMOJI_ICON[m[1]] || EMOJI_ICON[m[1].replace(/️/g, '')] || null
  return icon ? { icon, text: text.slice(0, -m[0].length) } : { icon: null, text }
}
