import { isEnglish, tr, uiLocale } from './i18n.js'

/** Parse any numeric-ish value, treating blanks and garbage as 0. */
export const num = (value) => +value || 0

/** 1234.5 → "1,234.500 ر.ع" (Omani rial, three decimals, English digits). */
export function formatOMR(value) {
  return (
    num(value).toLocaleString(uiLocale(), { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + (isEnglish() ? ' OMR' : ' ر.ع')
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

export const formatDate = (date) => (date ? new Date(date).toLocaleDateString(uiLocale()) : '—')

/** Today (yyyy-mm-dd) in Oman — not UTC, which is still yesterday until 4 am in Muscat. */
export const todayISO = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Muscat', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(date))
  const get = (t) => parts.find((p) => p.type === t).value
  return `${get('year')}-${get('month')}-${get('day')}`
}

export const percent = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0)

/** Display name of an exhibition: its own name when set, else "SOVA <city>". */
export const exhibitionTitle = (ex) => (ex ? ex.name?.trim() || `SOVA ${tr(ex.city)}` : '—')

/** Short label used everywhere an exhibition is referenced: "مسقط — 2026-03". */
export const exhibitionLabel = (ex) =>
  ex ? `${ex.name?.trim() || tr(ex.city)} — ${isolateLtr(monthOf(ex.date_from))}` : '—'

/** Digits only, without a leading 00/968 country prefix — used to match phone numbers. */
export function phoneKey(phone) {
  const digits = String(phone ?? '').replace(/\D/g, '').replace(/^00/, '')
  return digits.length > 8 && digits.startsWith('968') ? digits.slice(3) : digits
}
