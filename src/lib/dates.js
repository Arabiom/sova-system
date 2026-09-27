// Dates typed as day/month/year (the way they are written in Oman), stored as ISO yyyy-mm-dd.

/** "27/12/2026" (also 27-12-2026, 27.12.2026, 2/7/2026) → "2026-12-27"; '' when not a real date. */
export function parseDayMonthYear(text) {
  const m = String(text).trim().match(/^(\d{1,2})[/.\-\s](\d{1,2})[/.\-\s](\d{4})$/)
  if (!m) return ''
  const [day, month, year] = [+m[1], +m[2], +m[3]]
  const d = new Date(Date.UTC(year, month - 1, day))
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return ''
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** "2026-12-27" → "27/12/2026". */
export function formatDayMonthYear(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ''
}

/**
 * Digits typed on a keypad get the slashes added as typing goes on: 27 → 27/1 → 27/12/2026.
 * Text written another way (2/7/2026, 27/1/2026, 27-12-2026) is left as typed.
 */
export function autoSlash(text) {
  if (/[^\d/]/.test(text)) return text
  const parts = text.split('/')
  const ours = parts.length === 1 || (parts[0].length === 2 && (parts.length === 2 || parts[1].length === 2))
  if (!ours || parts.length > 3) return text
  const digits = parts.join('').slice(0, 8)
  if (digits.length <= 2) return digits
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`
}
