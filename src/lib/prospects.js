// «البحث والفرص» — possible exhibitors, sponsors and partners, venues and events found in public
// sources (migration 035). Every entry keeps the link it was found at; none is a client until
// someone checks it and turns it into one.
import { downloadCsv } from './csv.js'
import { phoneKey } from './format.js'
import { tr } from './i18n.js'

export const PROSPECT_KINDS = ['عارض محتمل', 'راعٍ أو شريك', 'موقع أو فعالية', 'أخرى']
export const PROSPECT_STATUSES = ['جديد', 'تم التحقق', 'تم التواصل', 'مهتم', 'غير مهتم', 'غير مناسب', 'أصبح عميلاً']
export const PROSPECT_BADGE = {
  جديد: 'badge-info',
  'تم التحقق': 'badge-neutral',
  'تم التواصل': 'badge-warning',
  مهتم: 'badge-success',
  'غير مهتم': 'badge-danger',
  'غير مناسب': 'badge-neutral',
  'أصبح عميلاً': 'badge-success',
}
/** Only these can become clients (a venue or an event is not one). */
export const CLIENT_KINDS = ['عارض محتمل', 'راعٍ أو شريك']

/** Fields a file can fill, with the header names each is recognised by. */
export const PROSPECT_FIELDS = [
  {
    key: 'name',
    label: 'الاسم',
    headers: ['الاسم', 'اسم المشروع', 'المشروع', 'اسم الجهة', 'الجهة', 'اسم المحل', 'المحل', 'اسم المتجر', 'المتجر', 'العلامة التجارية', 'البراند', 'اسم الشركة', 'الشركة', 'اسم المصنع', 'المصنع', 'name', 'business', 'company', 'company name', 'store', 'brand'],
  },
  { key: 'kind', label: 'النوع', headers: ['النوع', 'نوع الفرصة', 'kind', 'type'] },
  { key: 'category', label: 'النشاط', headers: ['النشاط', 'القطاع', 'التصنيف', 'المجال', 'نوع النشاط', 'category', 'sector', 'activity'] },
  { key: 'products', label: 'المنتجات', headers: ['المنتجات', 'نبذة', 'نبذة عن المنتجات', 'نبذة عن المشروع', 'الوصف', 'وصف المنتجات', 'products', 'description', 'about'] },
  { key: 'city', label: 'المدينة', headers: ['المدينة', 'الولاية', 'المحافظة', 'المنطقة', 'العنوان', 'city', 'area', 'address', 'location'] },
  { key: 'instagram', label: 'إنستغرام', headers: ['إنستغرام', 'انستغرام', 'إنستقرام', 'انستقرام', 'الحساب', 'instagram', 'insta'] },
  { key: 'website', label: 'الموقع الإلكتروني', headers: ['الموقع', 'الموقع الإلكتروني', 'website', 'site', 'web'] },
  { key: 'phone', label: 'الهاتف', headers: ['الهاتف', 'رقم الهاتف', 'الجوال', 'رقم الجوال', 'واتساب', 'رقم الواتساب', 'رقم التواصل', 'التواصل', 'الرقم', 'phone', 'mobile', 'whatsapp', 'tel'] },
  { key: 'email', label: 'البريد', headers: ['البريد', 'البريد الإلكتروني', 'الإيميل', 'الايميل', 'email', 'e-mail'] },
  { key: 'source_url', label: 'رابط المصدر', headers: ['المصدر', 'رابط المصدر', 'مصدر المعلومة', 'الرابط', 'source', 'source_url', 'link', 'url'] },
  { key: 'notes', label: 'ملاحظات', headers: ['ملاحظات', 'ملاحظة', 'notes', 'note'] },
]

const clean = (v) => (v === null || v === undefined ? '' : String(v).replace(/\s+/g, ' ').trim())
const normHeader = (v) => clean(v).replace(/[:\uFF1A*]/g, '').replace(/\s*\(.*?\)\s*/g, '').trim().toLowerCase()

/** An Instagram account as stored: the handle only, lower case, from "@x", "x" or a profile link. */
export function instagramHandle(value) {
  const v = clean(value)
  if (!v) return ''
  const fromUrl = v.match(/instagram\.com\/([A-Za-z0-9._]+)/i)
  return (fromUrl ? fromUrl[1] : v.replace(/^@/, '')).toLowerCase()
}

/**
 * Which column holds each field: the first of the first 15 rows naming the name column and at
 * least one other. Without one, headerRow is -1 and the columns are chosen by hand.
 */
export function detectProspectColumns(rows) {
  for (let r = 0; r < Math.min(rows.length, 15); r++) {
    const cells = rows[r].map(normHeader)
    const found = {}
    for (const f of PROSPECT_FIELDS) {
      const wanted = f.headers.map(normHeader)
      const free = (i) => !Object.values(found).includes(i)
      let idx = cells.findIndex((c, i) => c && wanted.includes(c) && free(i))
      // a combined header such as «اسم المشروع / النشاط» is known by its parts
      if (idx < 0) idx = cells.findIndex((c, i) => c && free(i) && c.split(/\s*[/|،,]\s*/).some((part) => wanted.includes(part)))
      if (idx >= 0) found[f.key] = idx
    }
    if (found.name !== undefined && Object.keys(found).length >= 2) return { headerRow: r, cols: found }
  }
  return { headerRow: -1, cols: {} }
}

// ── Sorting each row (only where the file leaves a field empty — what it says is kept) ──────
const KIND_WORDS = [
  ['موقع أو فعالية', ['مول', 'مجمع تجاري', 'قاعة', 'فندق', 'مركز المعارض', 'مركز عمان للمؤتمرات', 'مهرجان', 'mall', 'hall', 'hotel', 'festival', 'convention']],
  ['راعٍ أو شريك', ['بنك', 'مصرف', 'اتصالات', 'عمانتل', 'أوريدو', 'تأمين', 'هيئة', 'وزارة', 'غرفة تجارة', 'bank', 'telecom', 'insurance', 'authority', 'ministry']],
]
const SECTOR_WORDS = [
  ['عطور وبخور', ['عطر', 'عطور', 'بخور', 'عود', 'لبان', 'دخون', 'perfume', 'oud', 'incense', 'fragrance']],
  ['أزياء', ['عباي', 'أزياء', 'ازياء', 'ملابس', 'فساتين', 'فستان', 'خياط', 'جلابي', 'دشداش', 'مصار', 'fashion', 'abaya', 'cloth', 'dress', 'tailor']],
  ['أقمشة', ['قماش', 'أقمشة', 'اقمشة', 'fabric', 'textile']],
  ['تجميل', ['تجميل', 'مكياج', 'صالون', 'عناية', 'بشرة', 'رموش', 'أظافر', 'beauty', 'salon', 'cosmetic', 'makeup', 'skin']],
  ['حلويات وقهوة', ['حلوى', 'حلويات', 'حلاوة', 'كيك', 'قهوة', 'مخبز', 'تمور', 'تمر', 'شوكولا', 'sweets', 'cake', 'coffee', 'bakery', 'dates', 'chocolate', 'halwa']],
  ['مطاعم وأغذية', ['مطعم', 'مطاعم', 'وجبات', 'اكل', 'مأكولات', 'مواد غذائية', 'غذائية', 'كافيه', 'كوفي', 'restaurant', 'café', 'cafe', 'food', 'grill']],
  ['زهور وهدايا', ['زهور', 'ورد', 'هدايا', 'هدية', 'تغليف', 'flower', 'gift']],
  ['إكسسوار', ['إكسسوار', 'اكسسوار', 'مجوهرات', 'ذهب', 'فضة', 'ساعات', 'شنط', 'حقائب', 'accessor', 'jewel', 'gold', 'bag']],
  ['منتجات أطفال', ['أطفال', 'اطفال', 'ألعاب', 'العاب', 'مواليد', 'kids', 'toys', 'baby']],
  ['حرف يدوية', ['يدوي', 'حرف', 'فخار', 'سعف', 'تطريز', 'handmade', 'craft', 'pottery']],
  ['منتجات منزلية', ['منزلي', 'منزلية', 'أسر منتجة', 'الأسر المنتجة', 'home made', 'homemade']],
  ['تصوير وطباعة', ['تصوير', 'طباعة', 'print', 'photo']],
  ['قاعات وضيافة', ['قاعات أفراح', 'قاعة أفراح', 'ضيافة', 'كوش', 'تنسيق حفلات', 'wedding', 'catering']],
  ['سياحة وسفر', ['سياحة', 'سفر', 'رحلات', 'travel', 'tour']],
]
const PLACES = ['مسقط', 'مطرح', 'السيب', 'بوشر', 'العامرات', 'قريات', 'نزوى', 'بهلاء', 'إزكي', 'سمائل', 'صحار', 'صلالة', 'البريمي', 'عبري', 'إبراء', 'صور', 'الرستاق', 'بركاء', 'المصنعة', 'السويق', 'خصب']
const PLACES_EN = { muscat: 'مسقط', muttrah: 'مطرح', seeb: 'السيب', bawshar: 'بوشر', nizwa: 'نزوى', bahla: 'بهلاء', sohar: 'صحار', salalah: 'صلالة', buraimi: 'البريمي', ibri: 'عبري', ibra: 'إبراء', sur: 'صور', rustaq: 'الرستاق', barka: 'بركاء' }
/** Arabic compared loosely: no diacritics or tatweel, one alef, ى as ي, ة as ه. */
const loose = (t) =>
  String(t)
    .toLowerCase()
    .replace(/[\u064B-\u0652\u0640]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
const firstMatch = (text, table) => {
  const t = loose(text)
  return table.find(([, words]) => words.some((w) => t.includes(loose(w))))?.[0] || ''
}

/** The kind a row looks like from its words (exhibitor when nothing says otherwise). */
export const guessKind = (text) => firstMatch(String(text).toLowerCase(), KIND_WORDS) || 'عارض محتمل'
/** The sector a row looks like from its words, or ''. */
export const guessSector = (text) => firstMatch(String(text).toLowerCase(), SECTOR_WORDS)
/** The standard sectors the sorting uses, and an exhibition can be made for. */
export const SECTORS = SECTOR_WORDS.map(([s]) => s)
/** Every standard sector the text speaks of (a shop selling abayas and perfume has two). */
let looseSectorWords // normalised once: the sorting runs over thousands of clients
export function sectorsIn(text) {
  const t = loose(text)
  if (!t.trim()) return []
  looseSectorWords ||= SECTOR_WORDS.map(([s, words]) => [s, words.map(loose)])
  return looseSectorWords.filter(([, words]) => words.some((w) => t.includes(w))).map(([s]) => s)
}
/** The Omani town named anywhere in the text, or ''. */
export function guessCity(text) {
  const t = String(text)
  const ar = PLACES.find((p) => t.includes(p))
  if (ar) return ar
  const lower = t.toLowerCase()
  const en = Object.keys(PLACES_EN).find((k) => new RegExp(`\\b${k}\\b`).test(lower))
  return en ? PLACES_EN[en] : ''
}

/**
 * Rows of a sheet → prospects, sorted: each empty kind, activity, city or Instagram account is
 * filled from the row's own words (and listed in `guessed`); what the file says is kept as is.
 */
export function readProspectRows(rows, found = detectProspectColumns(rows)) {
  const { headerRow, cols } = found
  if (cols.name === undefined) throw new Error(tr('لم أجد صف العناوين — يجب أن يحتوي الملف على عمود «الاسم» وعمود آخر على الأقل'))
  const out = []
  rows.forEach((row, i) => {
    if (i <= headerRow) return
    const p = { line: i + 1 }
    for (const f of PROSPECT_FIELDS) p[f.key] = cols[f.key] === undefined || cols[f.key] === '' ? '' : clean(row[cols[f.key]])
    if (!Object.values(p).slice(1).some(Boolean)) return
    const all = row.map(clean).filter(Boolean).join(' ')
    const guessed = []
    if (!PROSPECT_KINDS.includes(p.kind)) {
      p.kind = guessKind(`${p.name} ${p.category} ${p.notes}`)
      if (p.kind !== PROSPECT_KINDS[0]) guessed.push('kind')
    }
    // a free-written activity («عبايات وشيلات») becomes a standard sector; its words stay as the products note
    const sorted = p.category && !SECTORS.includes(p.category) ? guessSector(p.category) : ''
    if (sorted) {
      if (!p.products) p.products = p.category
      p.category = sorted
      guessed.push('category')
    }
    if (!p.category) {
      p.category = guessSector(`${p.products} ${p.name} ${p.notes} ${all}`)
      if (p.category) guessed.push('category')
    }
    const city = guessCity(p.city || all)
    if (city && city !== p.city) {
      if (!p.city) guessed.push('city')
      p.city = p.city && !PLACES.includes(p.city) ? city : p.city || city
    }
    if (!p.instagram) {
      const handle = all.match(/instagram\.com\/[A-Za-z0-9._]+/i)?.[0]
      if (handle) {
        p.instagram = handle
        guessed.push('instagram')
      }
    }
    p.instagram = instagramHandle(p.instagram)
    p.email = p.email.toLowerCase()
    p.guessed = guessed
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
  ...(p.products ? { products: p.products } : {}),
  city: p.city,
  source: tr('البحث والفرص'),
  status: 'محتمل',
  notes: [p.notes, p.source_url && `${tr('المصدر')}: ${p.source_url}`].filter(Boolean).join('\n'),
  contact_source: 'قائمة مستوردة',
})

/** How well a prospect fits our exhibitions (1–3, from the research), as shown. */
export const FIT_LABELS = { 3: 'مناسب جداً', 2: 'مناسب', 1: 'ضعيف' }
export const FIT_STARS = { 3: '★★★', 2: '★★☆', 1: '★☆☆' }

/** Best first: the fit (unrated last), then the newest; «غير مناسب» and clients at the end. */
export function sortProspects(list) {
  const late = (p) => (p.status === 'غير مناسب' || p.status === 'أصبح عميلاً' ? 1 : 0)
  return [...list].sort((a, b) => late(a) - late(b) || (b.fit || 0) - (a.fit || 0) || String(b.created_at).localeCompare(String(a.created_at)))
}

/**
 * Is the daily research working? Off without a code; «late» when it has a code but has not
 * reported for more than 36 hours (it runs every morning).
 */
export function researchHealth(runs = [], feedSince = null, now = new Date()) {
  const last = runs.reduce((m, r) => (!m || r.run_at > m ? r.run_at : m), null)
  if (!feedSince) return { state: 'off', last }
  const since = last || feedSince
  const hours = (now - new Date(since)) / 36e5
  return { state: hours > 36 ? 'late' : 'ok', last, days: Math.floor(hours / 24) }
}

/**
 * The research switch (migration 038): on/off, and whether a «ابحث الآن» request is waiting
 * for the next hourly check (asked after the last run). Without 038, the research is on.
 */
export function researchSwitch(plan, runs = []) {
  const on = plan?.enabled !== false
  const last = runs.reduce((m, r) => (!m || r.run_at > m ? r.run_at : m), null)
  const requested = Boolean(on && plan?.run_requested_at && (!last || plan.run_requested_at > last))
  return { on, requested, supported: plan ? 'enabled' in plan : false }
}
