import { COMPANY } from './constants.js'
import { inArabic, tr } from './i18n.js'
import { formatDayMonthYear } from './dates.js'
import { exhibitionTitle, fixed3, num, phoneKey } from './format.js'
import { paymentDeadline } from './finance.js'

/**
 * Number for wa.me links: an 8-digit Omani number gets the 968 country code; a number that
 * already carries a country code ("+968…", "00971…", "966…") is kept as it is.
 */
export function normalizePhone(phone) {
  const digits = String(phone || '').replace(/[^\d]/g, '').replace(/^00/, '')
  if (!digits) return ''
  return digits.startsWith('968') || digits.length > 8 ? digits : `968${digits}`
}

/** Why a number can't receive a message, or '' when it can. */
export function phoneProblem(phone) {
  const digits = normalizePhone(phone)
  if (!digits) return tr('بدون رقم')
  if (digits.startsWith('968') && digits.length !== 11) return tr('رقم ناقص أو زائد')
  if (digits.length < 10 || digits.length > 15) return tr('رقم غير صحيح')
  return ''
}

export const whatsappUrl = (phone, text) =>
  `https://wa.me/${normalizePhone(phone)}?text=${encodeURIComponent(text)}`

/** Ways to open a chat: wa.me (phone or desktop), one reused WhatsApp Web tab, or the desktop app. */
export const OPEN_MODES = [
  { id: 'wa', label: tr('تلقائي (wa.me)'), hint: tr('يفتح تطبيق واتساب في الجوال، ويسأل في الكمبيوتر') },
  { id: 'web', label: tr('واتساب ويب — نافذة واحدة'), hint: tr('في الكمبيوتر: كل رسالة تُفتح في نفس النافذة بدل نافذة جديدة لكل رقم') },
  { id: 'app', label: tr('تطبيق واتساب للكمبيوتر'), hint: tr('يفتح المحادثة مباشرة في التطبيق المثبّت على الكمبيوتر') },
]

export function chatUrl(phone, text, mode = 'wa') {
  const p = normalizePhone(phone)
  const t = encodeURIComponent(text)
  if (mode === 'web') return `https://web.whatsapp.com/send?phone=${p}&text=${t}`
  if (mode === 'app') return `whatsapp://send?phone=${p}&text=${t}`
  return whatsappUrl(phone, text)
}

/** Open one chat with the text ready. Must be called straight from a click so it isn't blocked. */
export function openChat(phone, text, mode = 'wa') {
  const url = chatUrl(phone, text, mode)
  if (mode === 'app') window.location.href = url
  else window.open(url, mode === 'web' ? 'sova-whatsapp' : '_blank', mode === 'web' ? undefined : 'noopener')
}

export function openWhatsApp(phone, text) {
  window.open(whatsappUrl(phone, text), '_blank', 'noopener')
}

export function daysUntil(date, now = new Date()) {
  return Math.ceil((new Date(date) - now) / 86_400_000)
}

// ─── Variables ──────────────────────────────────────────────────────────────────────

/** Placeholders written as {name} in a message; each recipient gets their own value. */
export const VARIABLES = [
  { key: 'الاسم', hint: tr('اسم المسؤول') },
  { key: 'العلامة', hint: tr('اسم المشروع / العلامة التجارية') },
  { key: 'المعرض', hint: tr('اسم المعرض') },
  { key: 'المناسبة', hint: tr('مناسبة المعرض') },
  { key: 'التاريخ', hint: tr('من – إلى') },
  { key: 'المول', hint: tr('مكان المعرض') },
  { key: 'المدينة', hint: tr('مدينة المعرض') },
  { key: 'أوقات_العمل', hint: tr('أوقات المعرض') },
  { key: 'الأيام_المتبقية', hint: tr('كم يوم على الافتتاح') },
  { key: 'آخر_موعد_للدفع', hint: tr('قبل الافتتاح بـ 10 أيام') },
  { key: 'الموقع', hint: tr('رقم الموقع / البوث') },
  { key: 'مساحة_البوث', hint: tr('حجم البوث') },
  { key: 'قيمة_العقد', hint: tr('للمدير والمالية فقط'), money: true },
  { key: 'المدفوع', hint: tr('للمدير والمالية فقط'), money: true },
  { key: 'المتبقي', hint: tr('للمدير والمالية فقط'), money: true },
  { key: 'رقم_التواصل', hint: tr('رابط واتساب الشركة') },
  { key: 'الشركة', hint: tr('اسم الشركة') },
]

const MONEY_KEYS = VARIABLES.filter((v) => v.money).map((v) => v.key)
const EXHIBITION_KEYS = ['المعرض', 'المناسبة', 'التاريخ', 'المول', 'المدينة', 'أوقات_العمل', 'الأيام_المتبقية', 'آخر_موعد_للدفع']
const VARIABLE_RE = /\{([^{}\n]{1,30})\}/g

/** The variables a text uses, in order, each once. */
export const variablesIn = (body) => [...new Set([...String(body || '').matchAll(VARIABLE_RE)].map((m) => m[1].trim()))]

export const usesMoney = (body) => variablesIn(body).some((k) => MONEY_KEYS.includes(k))

const omr = (value) => `${fixed3(value)} ر.ع`
const hasBooth = (booth) => booth && !['—', '-'].includes(String(booth).trim())

/**
 * Values for one recipient. `person` is an exhibitor, a booking or a client in the shape of
 * toRecipient(); money values are only filled in when `money` is true.
 */
export function recipientVars(person, exhibition, options = {}) {
  // Messages to participants are Arabic whatever the interface language.
  return inArabic(() => arabicVars(person, exhibition, options))
}

function arabicVars(person, exhibition, { money = false, now = new Date() } = {}) {
  const ex = exhibition || null
  const vars = {
    'الاسم': person?.name || person?.brand || '',
    'العلامة': person?.brand || person?.name || '',
    'الموقع': hasBooth(person?.booth) ? person.booth : 'سيُحدد قريباً',
    'مساحة_البوث': person?.booth_size || '—',
    'رقم_التواصل': `wa.me/${COMPANY.whatsapp}`,
    'الشركة': COMPANY.legalName,
  }
  if (ex) {
    const days = ex.date_from ? daysUntil(ex.date_from, now) : 0
    Object.assign(vars, {
      'المعرض': exhibitionTitle(ex),
      'المناسبة': ex.occasion || '',
      'التاريخ': [formatDayMonthYear(ex.date_from), formatDayMonthYear(ex.date_to)].filter(Boolean).join(' – '),
      'المول': ex.mall || '',
      'المدينة': ex.city || '',
      'أوقات_العمل': ex.hours || '',
      'الأيام_المتبقية': days > 0 ? `${days} يوم` : 'أقل من يوم',
      'آخر_موعد_للدفع': formatDayMonthYear(paymentDeadline(ex)),
    })
  }
  if (money) {
    Object.assign(vars, {
      'قيمة_العقد': omr(person?.contract),
      'المدفوع': omr(person?.paid),
      'المتبقي': omr(num(person?.contract) - num(person?.paid)),
    })
  }
  return vars
}

/** Replace every {variable} with its value; unknown ones are left as written. */
export const fillTemplate = (body, vars) =>
  String(body || '')
    .replace(VARIABLE_RE, (whole, key) => (key.trim() in vars ? vars[key.trim()] : whole))
    // An empty value at the end of "title — {المناسبة}" leaves a dangling dash.
    .replace(/[ \t]+[—–-][ \t]*$/gm, '')

/**
 * What stops a message from going out as written, per recipient:
 * unknown variables, amounts for someone not allowed to see them, and exhibition details
 * when no exhibition is known.
 */
export function messageProblems(body, vars, { money = false } = {}) {
  const problems = []
  for (const key of variablesIn(body)) {
    if (MONEY_KEYS.includes(key) && !money) problems.push(tr('{0} غير متاح لصلاحيتك', [`{${key}}`]))
    else if (EXHIBITION_KEYS.includes(key) && !(key in vars)) problems.push(tr('{0}: لم يُحدد المعرض', [`{${key}}`]))
    else if (!(key in vars) && !MONEY_KEYS.includes(key)) problems.push(tr('{0} متغير غير معروف', [`{${key}}`]))
  }
  return problems
}

/** Empty values that would leave a gap in the text (e.g. an exhibition without a mall). */
export const emptyValues = (body, vars) => variablesIn(body).filter((k) => k in vars && !String(vars[k]).trim())

// ─── Recipients ─────────────────────────────────────────────────────────────────────

/** One shape for everyone a message can go to. */
export function toRecipient(source, row) {
  if (source === 'client') {
    return {
      key: `client:${row.id}`,
      source,
      id: row.id,
      name: row.contact_name || '',
      brand: row.name || '',
      phone: row.whatsapp || row.phone || '',
      sector: row.sector || '',
      city: row.city || '',
      status: row.status || '',
      exhibition_id: null,
    }
  }
  return {
    key: `${source}:${row.id}`,
    source,
    id: row.id,
    name: row.manager || '',
    brand: row.brand || '',
    phone: row.phone || '',
    sector: row.category || '',
    status: row.status || '',
    booth: row.booth,
    booth_size: row.booth_size,
    contract: row.contract,
    paid: row.paid,
    exhibition_id: row.exhibition_id,
  }
}

/** Numbers typed or pasted one per line, optionally "name - number" / "number name". */
export function parseManualList(text) {
  const seen = new Set()
  const out = []
  for (const line of String(text || '').split(/\n|؛|;/)) {
    const phoneMatch = line.match(/\+?\(?\d[\d\s()-]{5,}\d/)
    if (!phoneMatch) continue
    const phone = phoneMatch[0].trim()
    const key = phoneKey(phone)
    if (!key || seen.has(key)) continue
    seen.add(key)
    const name = line.replace(phoneMatch[0], '').replace(/^[\s,،:–-]+|[\s,،:–-]+$/g, '').trim()
    out.push({ key: `manual:${key}`, source: 'manual', id: null, name, brand: name, phone, exhibition_id: null })
  }
  return out
}

/** Keep the first recipient of each phone number; returns [unique, duplicates]. */
export function uniqueByPhone(recipients) {
  const seen = new Map()
  const duplicates = []
  for (const r of recipients) {
    const key = phoneKey(r.phone)
    if (!key) continue
    if (seen.has(key)) duplicates.push(r)
    else seen.set(key, r)
  }
  return [[...seen.values()], duplicates]
}

// ─── Formatting ─────────────────────────────────────────────────────────────────────

export const FORMATS = [
  { id: 'bold', label: 'B', title: tr('عريض'), mark: '*' },
  { id: 'italic', label: 'I', title: tr('مائل'), mark: '_' },
  { id: 'strike', label: 'S', title: tr('يتوسطه خط'), mark: '~' },
  { id: 'mono', label: '</>', title: tr('خط ثابت'), mark: '```' },
]

/** Wrap the selected part of `text` in a WhatsApp format mark; returns the new text and cursor. */
export function wrapSelection(text, start, end, mark) {
  const selected = text.slice(start, end) || 'نص'
  const next = `${text.slice(0, start)}${mark}${selected}${mark}${text.slice(end)}`
  return { text: next, start: start + mark.length, end: start + mark.length + selected.length }
}

/** Insert `piece` at the cursor. */
export function insertAt(text, start, end, piece) {
  return { text: `${text.slice(0, start)}${piece}${text.slice(end)}`, cursor: start + piece.length }
}

/** WhatsApp formatting shown in the preview: *bold* _italic_ ~strike~ ```mono```. */
export function previewParts(text) {
  const re = /```([\s\S]+?)```|\*([^*\n]+)\*|_([^_\n]+)_|~([^~\n]+)~/g
  const parts = []
  let last = 0
  for (const m of String(text || '').matchAll(re)) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index) })
    const [kind, value] = m[1] != null ? ['mono', m[1]] : m[2] != null ? ['bold', m[2]] : m[3] != null ? ['italic', m[3]] : ['strike', m[4]]
    parts.push({ text: value, kind })
    last = m.index + m[0].length
  }
  if (last < String(text || '').length) parts.push({ text: text.slice(last) })
  return parts
}

// ─── Ready-made templates ───────────────────────────────────────────────────────────

const SIGN = `*فريق ${COMPANY.legalName}*`

export const BUILTIN_TEMPLATES = [
  {
    id: 'reminder',
    label: tr('⏰ تذكير بموعد المعرض'),
    color: 'var(--gold)',
    body: `السلام عليكم ورحمة الله وبركاته 🌟

*${COMPANY.name} — تذكير بموعد المعرض*

عزيزنا / {الاسم}

⏰ *تبقى {الأيام_المتبقية} على انطلاق المعرض!*

🏛️ *{المعرض}*
📅 التاريخ: *{التاريخ}*
📍 الموقع: *{المول}*
🔢 رقم البوث: *{الموقع}*

📌 *تعليمات مهمة:*
• يرجى الحضور قبل ساعة من الافتتاح لترتيب البوث
• يُمنع التصوير داخل البوثات الأخرى
• يجب الحفاظ على نظافة المنطقة المحيطة

نتمنى لكم تجربة ناجحة ومميزة 🎊
${SIGN}`,
  },
  {
    id: 'confirmed',
    label: tr('✅ تأكيد الحجز'),
    color: 'var(--suc)',
    body: `السلام عليكم ورحمة الله وبركاته 🌟

*${COMPANY.legalName}*

نرحب بكم في عائلة ${COMPANY.name}! 🎉

✅ *تم قبول طلب حجزكم بنجاح*

📋 *تفاصيل الحجز:*
• العلامة التجارية: *{العلامة}*
• المعرض: *{المعرض}*
• التاريخ: *{التاريخ}*
• الموقع: *{المول}*
• رقم البوث: *{الموقع}*
• حجم البوث: *{مساحة_البوث}*

💰 *المالية:*
• قيمة العقد: *{قيمة_العقد}*
• المدفوع: *{المدفوع}*
• المتبقي: *{المتبقي}*

📞 للاستفسار: {رقم_التواصل}

نتطلع لرؤيتكم في المعرض 🏛️
${SIGN}`,
  },
  {
    id: 'payment',
    label: tr('💰 تذكير بالدفع'),
    color: 'var(--wrn)',
    body: `السلام عليكم ورحمة الله وبركاته

*${COMPANY.name} — تذكير بالدفع*

عزيزنا / {الاسم}

نود تذكيركم بأن هناك مبلغاً متبقياً لاستكمال حجزكم في:

🏛️ *{المعرض}*
📅 {التاريخ}

💰 *المبلغ المتبقي: {المتبقي}*

الرجاء إتمام الدفع قبل *{آخر_موعد_للدفع}* (قبل الافتتاح بـ 10 أيام) لضمان مكانكم.

طرق الدفع:
• نقداً
• تحويل بنكي
• فيزا / ماستركارد

📞 للتواصل: {رقم_التواصل}

شكراً لتعاونكم 🙏
${SIGN}`,
  },
  {
    id: 'invitation',
    label: tr('📣 دعوة للمشاركة'),
    color: '#0EA5E9',
    body: `السلام عليكم ورحمة الله وبركاته 🌟

عزيزنا / {الاسم}

يسعدنا دعوتكم للمشاركة في:

🏛️ *{المعرض}* — {المناسبة}
📅 {التاريخ}
📍 {المول}

المواقع محدودة، والأولوية للحجز المبكر.
للحجز والاستفسار راسلونا على هذا الرقم.

${SIGN}`,
  },
  {
    id: 'site',
    label: tr('📍 إبلاغ برقم الموقع'),
    color: '#0D9488',
    body: `السلام عليكم ورحمة الله وبركاته

عزيزنا / {الاسم}

نود إبلاغكم بأن موقعكم في *{المعرض}* هو:

🔢 *رقم الموقع: {الموقع}*
📐 المساحة: {مساحة_البوث}
📅 {التاريخ}
📍 {المول}

📞 للاستفسار: {رقم_التواصل}

${SIGN}`,
  },
  {
    id: 'welcome',
    label: tr('🌟 رسالة ترحيب'),
    color: '#7C3AED',
    body: `السلام عليكم ورحمة الله وبركاته

*أهلاً بكم في ${COMPANY.legalName}* 🌟

شكراً على تواصلكم معنا!

نحن سعداء باهتمامكم بالمشاركة في:
🏛️ *{المعرض}*
📅 {التاريخ}
📍 {المول}

سيتواصل معكم فريقنا خلال 24 ساعة لإتمام إجراءات التسجيل.

📞 للاستفسار الفوري: {رقم_التواصل}

${SIGN}
${COMPANY.cr}`,
  },
  {
    id: 'thanks',
    label: tr('🙏 شكر بعد المعرض'),
    color: '#DB2777',
    body: `السلام عليكم ورحمة الله وبركاته

عزيزنا / {الاسم}

نشكركم على مشاركتكم معنا في *{المعرض}* 🌟
سعدنا بوجودكم، ونتطلع لرؤيتكم في معارضنا القادمة.

يسعدنا سماع رأيكم وملاحظاتكم لنطوّر تجربتكم في كل معرض.

${SIGN}`,
  },
  { id: 'custom', label: tr('✏️ رسالة جديدة فارغة'), color: 'var(--ink)', body: '' },
]

const builtin = (id) => BUILTIN_TEMPLATES.find((t) => t.id === id).body
const build = (id, person, exhibition, now) => fillTemplate(builtin(id), recipientVars(person, exhibition, { money: true, now }))

// Single messages sent from other pages (bookings, clients, finance).
export const confirmationMessage = (exhibitor, exhibition) => build('confirmed', toRecipient('exhibitor', exhibitor), exhibition)
export const paymentReminderMessage = (exhibitor, exhibition) => build('payment', toRecipient('exhibitor', exhibitor), exhibition)
export const exhibitionReminderMessage = (exhibitor, exhibition, now = new Date()) =>
  build('reminder', toRecipient('exhibitor', exhibitor), exhibition, now)
export const welcomeMessage = (person, exhibition) => build('welcome', toRecipient('booking', person), exhibition)
export const invitationMessage = (client, exhibition) => build('invitation', toRecipient('client', client), exhibition)
