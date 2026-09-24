/** Parse any numeric-ish value, treating blanks and garbage as 0. */
export const num = (value) => +value || 0

/** 1234.5 → "١٬٢٣٤٫٥٠٠ ر.ع" (Omani rial, three decimals). */
export function formatOMR(value) {
  return (
    num(value).toLocaleString('ar-OM', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + ' ر.ع'
  )
}

/** Plain three-decimal amount for documents: 1234.5 → "1234.500". */
export const fixed3 = (value) => num(value).toFixed(3)

/** "2026-03-14" → "2026-03" */
export const monthOf = (date) => (date ? String(date).slice(0, 7) : '')

/**
 * Wrap a left-to-right fragment (dates, codes) in Unicode directional isolates so that
 * it keeps its order inside Arabic text: "مسقط — 2026-03" instead of "مسقط — 03-2026".
 */
export const isolateLtr = (text) => (text ? `\u2066${text}\u2069` : '')

export const formatDate = (date) => (date ? new Date(date).toLocaleDateString('ar-OM') : '—')

export const todayISO = () => new Date().toISOString().slice(0, 10)

export const percent = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0)

/** Short label used everywhere an exhibition is referenced: "مسقط — 2026-03". */
export const exhibitionLabel = (ex) => (ex ? `${ex.city} — ${isolateLtr(monthOf(ex.date_from))}` : '—')
