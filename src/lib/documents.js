// The company's papers: their kinds, and whether each is still valid.

/** The usual papers of an Omani company (another kind can be typed). */
export const DOC_TYPES = [
  'السجل التجاري',
  'ترخيص السجل التجاري',
  'شهادة الانتساب لغرفة تجارة وصناعة عُمان',
  'الشهادة الضريبية',
  'بطاقة ريادة الأعمال',
  'ترخيص البلدية',
  'عقد الإيجار',
  'البطاقة الشخصية للمفوّض بالتوقيع',
  'شهادة الحساب البنكي (IBAN)',
  'شهادة تسجيل العلامة التجارية',
  'أخرى',
]

/** Days until a date (negative when past), or null. */
export const daysUntil = (iso, today) => (iso ? Math.round((Date.parse(iso) - Date.parse(today)) / 864e5) : null)

/** valid · soon (within 30 days) · expired · none (no expiry date). */
export function docState(doc, today) {
  const d = daysUntil(doc.expiry_date, today)
  if (d === null) return { state: 'none', days: null }
  if (d < 0) return { state: 'expired', days: d }
  if (d <= 30) return { state: 'soon', days: d }
  return { state: 'valid', days: d }
}

/** Expired first, then those expiring soonest, then the rest by kind. */
export function sortDocuments(docs, today) {
  const rank = { expired: 0, soon: 1, valid: 2, none: 3 }
  return [...docs].sort((a, b) => {
    const sa = docState(a, today)
    const sb = docState(b, today)
    return rank[sa.state] - rank[sb.state] || (sa.days ?? 1e9) - (sb.days ?? 1e9) || a.doc_type.localeCompare(b.doc_type, 'ar')
  })
}
