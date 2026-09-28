// Import a client list (Excel / CSV) into the client database: recognise the columns, clean the
// values, and sort every row into new / repeated in the file / already in the database /
// incomplete — before anything is saved. Nothing is guessed: values are kept as written.

import { CLIENT_STATUSES } from './constants.js'
import { downloadCsv } from './csv.js'
import { phoneKey } from './format.js'
import { tr } from './i18n.js'

/** Client fields a file can fill, with the header names each is recognised by. */
export const CLIENT_FIELDS = [
  { key: 'name', label: 'اسم المشروع / العلامة', headers: ['اسم المشروع', 'المشروع', 'اسم العميل', 'العميل', 'العلامة التجارية', 'العلامة', 'البراند', 'اسم الشركة', 'الشركة', 'اسم المحل', 'المحل', 'brand', 'business', 'company', 'name'] },
  { key: 'contact_name', label: 'اسم المسؤول', headers: ['اسم المسؤول', 'المسؤول', 'الاسم', 'اسم صاحب المشروع', 'صاحب المشروع', 'اسم المشارك', 'المشارك', 'contact', 'contact name', 'owner'] },
  { key: 'phone', label: 'الهاتف', headers: ['رقم الهاتف', 'الهاتف', 'رقم الجوال', 'الجوال', 'رقم التواصل', 'التواصل', 'الرقم', 'phone', 'mobile', 'tel'] },
  { key: 'whatsapp', label: 'واتساب', headers: ['واتساب', 'رقم الواتساب', 'الواتساب', 'whatsapp'] },
  { key: 'email', label: 'البريد', headers: ['البريد', 'البريد الإلكتروني', 'الإيميل', 'الايميل', 'email', 'e-mail'] },
  { key: 'instagram', label: 'إنستقرام', headers: ['إنستقرام', 'انستقرام', 'انستغرام', 'إنستغرام', 'الحساب', 'instagram', 'insta'] },
  { key: 'sector', label: 'القطاع', headers: ['القطاع', 'النشاط', 'نوع النشاط', 'التصنيف', 'المجال', 'sector', 'category', 'activity'] },
  { key: 'city', label: 'المدينة', headers: ['المدينة', 'الولاية', 'المنطقة', 'city'] },
  { key: 'source', label: 'المصدر', headers: ['المصدر', 'مصدر العميل', 'source'] },
  { key: 'status', label: 'الحالة', headers: ['الحالة', 'status'] },
  { key: 'notes', label: 'ملاحظات', headers: ['ملاحظات', 'ملاحظة', 'notes', 'note'] },
]

export const IMPORT_STATES = {
  new: 'جديد',
  duplicate: 'مكرر في الملف',
  exists: 'موجود مسبقاً',
  invalid: 'ناقص',
}

const clean = (v) => (v === null || v === undefined ? '' : String(v).replace(/\s+/g, ' ').trim())
const normHeader = (v) => clean(v).replace(/[:\uFF1A*]/g, '').replace(/\s*\(.*?\)\s*/g, '').trim().toLowerCase()

/** Split CSV text into rows (quoted fields, commas or semicolons, Excel's BOM). */
export function parseCsv(text) {
  const src = String(text || '').replace(/^\uFEFF/, '')
  const firstLine = src.split(/\r?\n/, 1)[0] || ''
  const sep = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ','
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        cell += '"'
        i++
      } else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"') quoted = true
    else if (c === sep) {
      row.push(cell)
      cell = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += c
  }
  if (cell || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((r) => r.some((v) => clean(v)))
}

/**
 * Find the header row (the first of the first 15 rows naming at least two known fields) and
 * which column holds each field. Without one, the data starts on the first row and the
 * columns are chosen by hand.
 */
export function detectColumns(rows) {
  for (let r = 0; r < Math.min(rows.length, 15); r++) {
    const cells = rows[r].map(normHeader)
    const cols = {}
    for (const field of CLIENT_FIELDS) {
      const wanted = field.headers.map(normHeader)
      const idx = cells.findIndex((c, i) => c && wanted.includes(c) && !Object.values(cols).includes(i))
      if (idx >= 0) cols[field.key] = idx
    }
    if (Object.keys(cols).length >= 2) return { headerRow: r, cols }
  }
  return { headerRow: -1, cols: {} }
}

/** Column choices for the mapping selects: the header text, else "Column N". */
export function columnOptions(rows, headerRow) {
  const width = Math.max(0, ...rows.slice(0, 50).map((r) => r.length))
  return Array.from({ length: width }, (_, i) => ({
    index: i,
    label: headerRow >= 0 && clean(rows[headerRow][i]) ? clean(rows[headerRow][i]) : tr('عمود {0}', [i + 1]),
  }))
}

/** One client per non-empty data row, values as written (only spaces and the email's case tidied). */
export function readClientRows(rows, headerRow, cols) {
  const out = []
  rows.forEach((r, i) => {
    if (i <= headerRow) return
    const get = (key) => (cols[key] === undefined || cols[key] === '' ? '' : clean(r[cols[key]]))
    const client = { line: i + 1 }
    for (const f of CLIENT_FIELDS) client[f.key] = get(f.key)
    client.email = client.email.toLowerCase()
    if (Object.values(client).slice(1).some(Boolean)) out.push(client)
  })
  return out
}

/** Why a phone number looks wrong ('' when fine). Omani numbers have 8 digits. */
export function phoneWarning(phone) {
  if (!phone) return ''
  const key = phoneKey(phone)
  if (!key) return tr('رقم غير صحيح')
  if (key.length < 8) return tr('رقم ناقص')
  if (key.length > 8 && key.length < 10) return tr('رقم زائد')
  return ''
}

/**
 * Sort the rows before saving:
 * - invalid: no business name, contact name or phone number;
 * - duplicate: the same phone (or, without a phone, the same name) as an earlier row of the file;
 * - exists: the phone (or name) of a client already in the database;
 * - new: everything else — ticked for import.
 * The business name falls back to the contact name; an unknown status becomes «نشط».
 */
export function classifyClients(rows, existing = []) {
  const byPhone = new Map(existing.filter((c) => phoneKey(c.phone)).map((c) => [phoneKey(c.phone), c]))
  for (const c of existing) {
    const w = phoneKey(c.whatsapp)
    if (w && !byPhone.has(w)) byPhone.set(w, c)
  }
  const byName = new Map(existing.filter((c) => c.name).map((c) => [c.name.trim().toLowerCase(), c]))
  const seenPhone = new Map()
  const seenName = new Map()

  return rows.map((raw) => {
    const row = { ...raw, name: raw.name || raw.contact_name, status: CLIENT_STATUSES.includes(raw.status) ? raw.status : CLIENT_STATUSES[0] }
    const warnings = []
    const warn = phoneWarning(row.phone)
    if (warn) warnings.push(warn)
    if (raw.status && raw.status !== row.status) warnings.push(tr('الحالة «{0}» غير معروفة — سُجّلت «{1}»', [raw.status, row.status]))
    const key = phoneKey(row.phone) || phoneKey(row.whatsapp)
    const nameKey = row.name.toLowerCase()

    let state = 'new'
    let reason = ''
    if (!row.name && !key) {
      state = 'invalid'
      reason = tr('بدون اسم ولا رقم')
    } else if (key && seenPhone.has(key)) {
      state = 'duplicate'
      reason = tr('نفس رقم السطر {0}', [seenPhone.get(key)])
    } else if (!key && seenName.has(nameKey)) {
      state = 'duplicate'
      reason = tr('نفس اسم السطر {0}', [seenName.get(nameKey)])
    } else if (key && byPhone.has(key)) {
      state = 'exists'
      reason = tr('الرقم مسجل باسم «{0}»', [byPhone.get(key).name])
    } else if (!key && byName.has(nameKey)) {
      state = 'exists'
      reason = tr('الاسم مسجل مسبقاً')
    }
    if (key && !seenPhone.has(key)) seenPhone.set(key, row.line)
    if (nameKey && !seenName.has(nameKey)) seenName.set(nameKey, row.line)
    return { ...row, state, reason, warnings, include: state === 'new' }
  })
}

/** How many rows fall in each state. */
export const countStates = (rows) =>
  Object.fromEntries(Object.keys(IMPORT_STATES).map((s) => [s, rows.filter((r) => r.state === s).length]))

/** A blank file with the columns the import understands. */
export function downloadClientTemplate() {
  downloadCsv(`${tr('نموذج-العملاء')}.csv`, [], CLIENT_FIELDS.map((f) => ({ label: f.headers[0], value: () => '' })))
}
