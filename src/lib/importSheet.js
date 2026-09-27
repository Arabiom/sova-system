// Turn a participants spreadsheet (the company's "تسجيل المشاركين" template) into an import plan:
// the site map plus one exhibitor per participant, grouped across the booths they hold.

import { num, phoneKey } from './format.js'

const HEADERS = {
  number: ['رقم الكشك', 'رقم الموقع', 'رقم البوث', 'الكشك', 'الموقع'],
  tier: ['لون الموقع', 'الفئة', 'فئة الموقع', 'اللون'],
  price: ['السعر', 'السعر (ر.ع)', 'سعر الموقع'],
  paid: ['المبلغ المدفوع', 'المدفوع'],
  manager: ['اسم المشارك', 'المشارك', 'الاسم', 'المسؤول'],
  brand: ['الشركة', 'العلامة التجارية', 'اسم الشركة', 'البراند'],
  phone: ['رقم الهاتف', 'الهاتف', 'الجوال', 'رقم الجوال'],
  category: ['نوع النشاط', 'النشاط', 'التصنيف'],
  paymentStatus: ['حالة الدفع'],
  notes: ['ملاحظات', 'ملاحظة'],
}

const clean = (v) => (v === null || v === undefined ? '' : String(v).replace(/\s+/g, ' ').trim().replace(/\s*[-–—]+$/, ''))
const normHeader = (v) => clean(v).replace(/\s*\(.*?\)\s*/g, '').trim()

/** Find the header row and map each known field to a column index. */
function locateColumns(rows) {
  for (let r = 0; r < Math.min(rows.length, 15); r++) {
    const cells = rows[r].map(normHeader)
    const cols = {}
    for (const [field, names] of Object.entries(HEADERS)) {
      const wanted = names.map(normHeader)
      const idx = cells.findIndex((c) => wanted.includes(c))
      if (idx >= 0) cols[field] = idx
    }
    if (cols.number !== undefined && cols.price !== undefined) return { headerRow: r, cols }
  }
  throw new Error('لم أجد صف العناوين. يجب أن يحتوي الملف على عمودي "رقم الكشك" و"السعر".')
}

/** Most common value (ties → the larger one). */
function mode(values) {
  const counts = new Map()
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0] ?? 0
}

/**
 * rows: 2-D array of cell values (first sheet).
 * Returns { sites, exhibitors, warnings, totals }.
 *   sites:      [{ number, tier, price }] — price is the tier's list price
 *   exhibitors: [{ brand, manager, phone, category, notes, numbers, contract, paid }]
 */
export function planImport(rows) {
  const { headerRow, cols } = locateColumns(rows)
  const get = (row, field) => (cols[field] === undefined ? '' : row[cols[field]])
  const warnings = []

  // 1. Read booth rows (skip totals / blanks).
  const bookings = []
  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r]
    const number = Number(get(row, 'number'))
    if (!Number.isInteger(number) || number <= 0) continue
    bookings.push({
      line: r + 1,
      number,
      tier: clean(get(row, 'tier')) || 'عام',
      price: num(get(row, 'price')),
      paid: num(get(row, 'paid')),
      manager: clean(get(row, 'manager')),
      brand: clean(get(row, 'brand')),
      phone: clean(get(row, 'phone')),
      category: clean(get(row, 'category')),
      paymentStatus: clean(get(row, 'paymentStatus')),
      notes: clean(get(row, 'notes')),
    })
  }
  if (!bookings.length) throw new Error('لم أجد أي صف فيه رقم كشك.')

  // 2. One entry per booth number; if a number repeats keep the row with a participant.
  const byNumber = new Map()
  for (const b of bookings) {
    const prev = byNumber.get(b.number)
    const taken = (x) => Boolean(x.manager || x.brand)
    if (!prev) byNumber.set(b.number, b)
    else {
      warnings.push(`الكشك رقم ${b.number} مكرر (السطر ${prev.line} والسطر ${b.line}) — اعتمدت ${taken(b) && !taken(prev) ? `السطر ${b.line}` : `السطر ${prev.line}`}.`)
      if (taken(b) && !taken(prev)) byNumber.set(b.number, b)
    }
  }
  const unique = [...byNumber.values()].sort((a, b) => a.number - b.number)

  // 3. List price per tier = the most common price among that tier's booths.
  const listPrice = new Map()
  for (const tier of new Set(unique.map((b) => b.tier))) {
    listPrice.set(tier, mode(unique.filter((b) => b.tier === tier && b.price > 0).map((b) => b.price)))
  }
  const sites = unique.map((b) => ({ number: b.number, tier: b.tier, price: listPrice.get(b.tier) || b.price }))

  // 4. Group booked booths into participants (same phone, else same company/name).
  const groups = new Map()
  for (const b of unique.filter((x) => x.manager || x.brand)) {
    const key = phoneKey(b.phone) || (b.brand || b.manager).toLowerCase()
    if (!groups.has(key)) {
      groups.set(key, { brand: b.brand || b.manager, manager: b.manager || b.brand, phone: b.phone, category: b.category, notes: [], numbers: [], contract: 0, paid: 0 })
    }
    const g = groups.get(key)
    g.numbers.push(b.number)
    g.contract += b.price
    g.paid += b.paid
    if (!g.category && b.category) g.category = b.category
    for (const note of [b.paymentStatus && `حالة الدفع: ${b.paymentStatus}`, b.notes]) {
      if (note && !g.notes.includes(note)) g.notes.push(note)
    }
    const digits = phoneKey(b.phone)
    if (b.phone && digits.length !== 8) warnings.push(`رقم هاتف "${b.phone}" (${b.brand || b.manager}) ليس 8 أرقام — تحقق منه.`)
    if (b.price < (listPrice.get(b.tier) || 0)) {
      warnings.push(`الكشك ${b.number} (${b.brand || b.manager}) بسعر ${b.price} بدل ${listPrice.get(b.tier)} — سُجّل الفرق كخصم في قيمة العقد.`)
    }
  }
  const exhibitors = [...groups.values()].map((g) => ({ ...g, notes: g.notes.join(' | ') }))

  return {
    sites,
    exhibitors,
    warnings: [...new Set(warnings)],
    totals: {
      sites: sites.length,
      fullRevenue: sites.reduce((t, s) => t + s.price, 0),
      booked: exhibitors.reduce((t, e) => t + e.numbers.length, 0),
      participants: exhibitors.length,
      contract: exhibitors.reduce((t, e) => t + e.contract, 0),
      paid: exhibitors.reduce((t, e) => t + e.paid, 0),
    },
  }
}

/** Read the first sheet of an .xlsx File into a 2-D array (library loaded on demand). */
export async function readFirstSheet(file) {
  const { default: readExcelFile } = await import('read-excel-file/browser')
  const sheets = await readExcelFile(file)
  if (!sheets.length) throw new Error('الملف لا يحتوي على أوراق.')
  return sheets[0].data
}

/**
 * Compare an import plan with the exhibitors already registered in the exhibition so that
 * importing (again) updates people instead of duplicating them.
 * Each participant gets `existing` (the matched exhibitor or null) and `paidToRecord`
 * (only the amount not already recorded in the system). `untouched` lists registered
 * exhibitors that the file does not mention.
 */
export function matchPlan(plan, existingExhibitors) {
  const used = new Set()
  const findMatch = (p) => {
    const key = phoneKey(p.phone)
    const name = (p.brand || '').trim().toLowerCase()
    return (
      existingExhibitors.find((e) => !used.has(e.id) && key && phoneKey(e.phone) === key) ||
      existingExhibitors.find((e) => !used.has(e.id) && name && (e.brand || '').trim().toLowerCase() === name) ||
      null
    )
  }
  const participants = plan.exhibitors.map((p) => {
    const existing = findMatch(p)
    if (existing) used.add(existing.id)
    const already = existing ? num(existing.paid) : 0
    return { ...p, existing, paidToRecord: Math.max(0, p.paid - already), paidAhead: Math.max(0, already - p.paid) }
  })
  return {
    participants,
    untouched: existingExhibitors.filter((e) => !used.has(e.id)),
    created: participants.filter((p) => !p.existing).length,
    updated: participants.filter((p) => p.existing).length,
  }
}
