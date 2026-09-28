// Arabic / English interface. The Arabic text in the code is the key: tr('لوحة التحكم') shows
// "Dashboard" in English and the text itself in Arabic. Values stored in the database
// (statuses, sectors, payment methods…) stay Arabic; only their display goes through tr().
// Invoices, contracts and WhatsApp messages to participants stay Arabic.

import EN from './i18n.en.js'

export const LANGUAGES = [
  { id: 'ar', label: 'العربية', dir: 'rtl' },
  { id: 'en', label: 'English', dir: 'ltr' },
]

const STORAGE_KEY = 'sova.lang'

function readLang() {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'en' ? 'en' : 'ar'
  } catch {
    return 'ar'
  }
}

let lang = readLang()

export const currentLang = () => lang

/** Build something (an Arabic document) with the interface in Arabic, whatever the chosen language. */
export function inArabic(build) {
  const chosen = lang
  lang = 'ar'
  try {
    return build()
  } finally {
    lang = chosen
  }
}
export const isEnglish = () => lang === 'en'

/** Locale for numbers and dates in the interface. */
export const uiLocale = () => (lang === 'en' ? 'en-GB' : 'ar-OM')

/** Switch language: remembered on this device, and the page reloads in the new language. */
export function setLang(next) {
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch {
    // Private window: the choice lasts until the tab closes.
  }
  lang = next
  applyDocumentLang()
  window.location.reload()
}

export function applyDocumentLang() {
  const info = LANGUAGES.find((l) => l.id === lang)
  document.documentElement.lang = lang
  document.documentElement.dir = info.dir
}

const fill = (text, params) =>
  params ? String(text).replace(/\{(\d+)\}/g, (whole, i) => (params[i] ?? '') + '') : String(text)

/**
 * Text in the interface language. `params` fill {0}, {1}… in the text.
 * Anything without a translation (a name, a value typed by a user) is shown as it is.
 */
export function tr(text, params) {
  if (text == null) return ''
  // numbers, React elements… pass through untouched
  if (typeof text !== 'string') return text
  if (lang === 'ar') return fill(text, params)
  return fill(EN[text] ?? translateParts(text), params)
}

// Values joined with "، " (several sectors: "أزياء، أقمشة") are translated one by one.
function translateParts(text) {
  if (!text.includes('، ')) return text
  const parts = text.split('، ')
  return parts.every((p) => EN[p]) ? parts.map((p) => EN[p]).join(', ') : text
}
