// «البحث والفرص» — possible exhibitors, sponsors and partners, venues and events found in public
// sources (migration 035). Every entry keeps the link it was found at; none is a client until
// someone checks it and turns it into one.
import { downloadCsv } from './csv.js'
import { phoneKey } from './format.js'
import { tr } from './i18n.js'

export const PROSPECT_KINDS = ['عارض محتمل', 'راعٍ أو شريك', 'موقع أو فعالية', 'أخرى']
export const PROSPECT_STATUSES = ['جديد', 'تم التحقق', 'تم التواصل', 'مهتم', 'غير مهتم', 'أصبح عميلاً']
export const PROSPECT_BADGE = {
  جديد: 'badge-info',
  'تم التحقق': 'badge-neutral',
  'تم التواصل': 'badge-warning',
  مهتم: 'badge-success',
  'غير مهتم': 'badge-danger',
  'أصبح عميلاً': 'badge-success',
}
/** Only these can become clients (a venue or an event is not one). */
export const CLIENT_KINDS = ['عارض محتمل', 'راعٍ أو شريك']

/** Fields a file can fill, with the header names each is recognised by. */
export const PROSPECT_FIELDS = [
  { key: 'name', headers: ['الاسم', 'اسم المشروع', 'المشروع', 'اسم الجهة', 'الجهة', 'name', 'business'] },
  { key: 'kind', headers: ['النوع', 'نوع الفرصة', 'kind', 'type'] },
  { key: 'category', headers: ['النشاط', 'القطاع', 'التصنيف', 'category', 'sector'] },
  { key: 'city', headers: ['المدينة', 'الولاية', 'city'] },
  { key: 'instagram', headers: ['إنستغرام', 'انستغرام', 'إنستقرام', 'انستقرام', 'instagram'] },
  { key: 'website', headers: ['الموقع', 'الموقع الإلكتروني', 'website', 'site'] },
  { key: 'phone', headers: ['الهاتف', 'رقم الهاتف', 'الجوال', 'phone'] },
  { key: 'email', headers: ['البريد', 'البريد الإلكتروني', 'email'] },
  { key: 'source_url', headers: ['المصدر', 'رابط المصدر', 'مصدر المعلومة', 'source', 'source_url'] },
  { key: 'notes', headers: ['ملاحظات', 'ملاحظة', 'notes'] },
]

const clean = (v) => (v === null || v === undefined ? '' : String(v).replace(/\s+/g, ' ').trim())
const normHeader = (v) => clean(v).replace(/[:：*]/g, '').toLowerCase()

/** An Instagram account as stored: the handle only, lower case, from "@x", "x" or a profile link. */
export function instagramHandle(value) {
  const v = clean(value)
  if (!v) return ''
  const fromUrl = v.match(/instagram\.com\/([A-Za-z0-9._]+)/i)
  return (fromUrl ? fromUrl[1] : v.replace(/^@/, '')).toLowerCase()
}

/** Rows of a sheet → prospects (the first row naming at least two known fields is the header). */
export function readProspectRows(rows) {
  let headerRow = -1
  let cols = {}
  for (let r = 0; r < Math.min(rows.length, 15) && headerRow < 0; r++) {
    const cells = rows[r].map(normHeader)
    const found = {}
    for (const f of PROSPECT_FIELDS) {
      const idx = cells.findIndex((c, i) => c && f.headers.map(normHeader).includes(c) && !Object.values(found).includes(i))
      if (idx >= 0) found[f.key] = idx
    }
    if (found.name !== undefined && Object.keys(found).length >= 2) {
      headerRow = r
      cols = found
    }
  }
  if (headerRow < 0) throw new Error(tr('لم أجد صف العناوين — يجب أن يحتوي الملف على عمود «الاسم» وعمود آخر على الأقل'))
  const out = []
  rows.forEach((row, i) => {
    if (i <= headerRow) return
    const p = { line: i + 1 }
    for (const f of PROSPECT_FIELDS) p[f.key] = cols[f.key] === undefined ? '' : clean(row[cols[f.key]])
    p.instagram = instagramHandle(p.instagram)
    p.email = p.email.toLowerCase()
    if (!Object.values(p).slice(1).some(Boolean)) return
    if (!PROSPECT_KINDS.includes(p.kind)) p.kind = PROSPECT_KINDS[0]
    out.push(p)
  })
  return out
}

/**
 * Sort rows before saving: invalid (no name), duplicate (same number, account or name as an
 * earlier row), exists (already a prospect or a client), new. Nothing else is changed.
 */
export function classifyProspects(rows, prospects = [], clients = []) {
  const known = { phone: new Map(), insta: new Map(), name: new Map() }
  const remember = (rec, label, line) => {
    const k = phoneKey(rec.phone)
    if (k && !known.phone.has(k)) known.phone.set(k, { label, line })
    const h = instagramHandle(rec.instagram)
    if (h && !known.insta.has(h)) known.insta.set(h, { label, line })
    const n = clean(rec.name).toLowerCase()
    if (n && !known.name.has(n)) known.name.set(n, { label, line })
  }
  for (const p of prospects) remember(p, tr('في قائمة الفرص'))
  for (const c of clients) remember(c, tr('عميل مسجل'))
  return rows.map((row) => {
    const hit = known.phone.get(phoneKey(row.phone)) || known.insta.get(row.instagram) || known.name.get(clean(row.name).toLowerCase())
    let state = 'new'
    let reason = ''
    if (!row.name) {
      state = 'invalid'
      reason = tr('بدون اسم')
    } else if (hit) {
      state = hit.line ? 'duplicate' : 'exists'
      reason = hit.line ? tr('نفس السطر {0}', [hit.line]) : hit.label
    }
    if (state === 'new') remember(row, '', row.line)
    return { ...row, state, reason, noSource: !/^https?:\/\//i.test(row.source_url) }
  })
}

/** A blank file with the columns the import understands. */
export function downloadProspectTemplate() {
  downloadCsv(`${tr('نموذج-الفرص')}.csv`, [], PROSPECT_FIELDS.map((f) => ({ label: f.headers[0], value: () => '' })))
}

/** The client a prospect becomes (its number came from a list, so campaigns ask for consent). */
export const prospectToClient = (p) => ({
  name: p.name,
  phone: p.phone,
  email: p.email,
  instagram: p.instagram ? `@${p.instagram}` : '',
  sector: p.category,
  city: p.city,
  source: tr('البحث والفرص'),
  status: 'محتمل',
  notes: [p.notes, p.source_url && `${tr('المصدر')}: ${p.source_url}`].filter(Boolean).join('\n'),
  contact_source: 'قائمة مستوردة',
})
