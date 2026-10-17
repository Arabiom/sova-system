// The Instagram bio link page (/links/): contact buttons only — no prices, no React, so it
// opens instantly. Contact details come from the company constants used across the site.
import { COMPANY } from '../lib/constants.js'
import './links.css'

/**
 * «المعارض القادمة»: kept hidden until the official approvals are in. Set to true to list the
 * upcoming exhibitions from the same public list as the booking page (names, places, dates).
 */
const SHOW_EVENTS = false

const FROM_INSTAGRAM = 'السلام عليكم، أتواصل معكم من إنستغرام'
const MESSAGES = {
  main: `${FROM_INSTAGRAM} وأرغب بالاستفسار عن خدماتكم`,
  exhibition: `${FROM_INSTAGRAM} وأرغب بالاستفسار عن تنظيم معرض لجهتنا`,
  booth: `${FROM_INSTAGRAM} وأرغب بالاستفسار عن تصميم جناح وتنفيذه`,
  rental: `${FROM_INSTAGRAM} وأرغب بالاستفسار عن تأجير الخيام والتجهيزات`,
  trips: `${FROM_INSTAGRAM} وأرغب بالاستفسار عن رحلات الأعمال`,
}

const wa = (text) => `https://wa.me/${COMPANY.whatsapp}?text=${encodeURIComponent(text)}`
const phones = [COMPANY.phone, COMPANY.phone2]
const igName = COMPANY.instagram.replace('@', '')

const all = (sel) => document.querySelectorAll(sel)
document.querySelector('[data-logo]').src = COMPANY.logoLight
all('[data-wa]').forEach((a) => (a.href = wa(MESSAGES[a.dataset.wa])))
all('[data-tel]').forEach((a) => (a.href = `tel:+968${phones[a.dataset.tel]}`))
all('[data-num]').forEach((el) => {
  el.textContent = phones[el.dataset.num]
  el.dir = 'ltr'
})
all('[data-mail]').forEach((a) => (a.href = `mailto:${COMPANY.email}`))
all('[data-ig]').forEach((a) => (a.href = `https://www.instagram.com/${igName}/`))
all('[data-ig-name]').forEach((el) => {
  el.textContent = COMPANY.instagram
  el.dir = 'ltr'
})

/**
 * Each button press as an analytics event, once the site has an analytics tool (Google
 * Analytics or Plausible); nothing is sent without one.
 */
document.addEventListener('click', (e) => {
  const name = e.target.closest('[data-track]')?.dataset.track
  if (!name) return
  const props = { page: 'links', source: new URLSearchParams(location.search).get('utm_source') || 'direct' }
  if (typeof window.gtag === 'function') window.gtag('event', name, props)
  if (typeof window.plausible === 'function') window.plausible(name, { props })
})

if (SHOW_EVENTS) showEvents()

// ── «سجّل بياناتك»: a request into «طلبات الحجز» through the public submit_booking function
// (migration 026), called directly as a visitor: no account session, nothing else to load.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
const REFUSED = {
  invalid_name: 'اكتب اسمك',
  invalid_phone: 'رقم الجوال غير صحيح — 8 أرقام على الأقل',
  too_long: 'أحد الحقول أطول من المسموح',
  too_many: 'استلمنا عدة طلبات من هذا الرقم خلال ساعة — سنتواصل معك قريباً',
}

async function sendLead(row) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/submit_booking`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(row),
  })
  if (res.ok) return
  const body = await res.json().catch(() => ({}))
  const known = Object.keys(REFUSED).find((k) => String(body.message || '').includes(k))
  const err = new Error(known ? REFUSED[known] : 'تعذّر إرسال الطلب حالياً.')
  err.code = known ? '' : body.code || String(res.status)
  throw err
}

const form = document.querySelector('[data-lead-form]')
const errorBox = document.querySelector('[data-lead-error]')
const errorText = document.querySelector('[data-lead-error-text]')
const fallback = document.querySelector('[data-lead-wa]')

const fail = (text, field, waText) => {
  errorText.textContent = text
  fallback.hidden = !waText
  if (waText) fallback.href = wa(waText)
  errorBox.hidden = false
  field?.focus()
}

form.addEventListener('submit', async (e) => {
  e.preventDefault()
  errorBox.hidden = true
  const f = form.elements
  if (f.website.value) return // a bot filled the hidden field
  const name = f.name.value.trim()
  const phone = f.phone.value.trim()
  const brand = f.brand.value.trim()
  const service = f.service.value
  if (name.length < 2) return fail('اكتب اسمك', f.name)
  if (phone.replace(/\D/g, '').length < 8) return fail('رقم الجوال غير صحيح — 8 أرقام على الأقل', f.phone)
  if (!service) return fail('اختر الخدمة المطلوبة', f.service[0])
  const note = f.note.value.trim()
  const message = [`من صفحة إنستغرام — ${service}`, `التواصل المفضّل: ${f.via.value}`, note].filter(Boolean).join('\n')
  const button = form.querySelector('button[type=submit]')
  button.disabled = true
  button.textContent = 'جاري الإرسال...'
  try {
    await sendLead({ p_kind: 'استفسار', p_brand: brand, p_manager: name, p_phone: phone, p_email: '', p_category: service, p_exhibition_id: null, p_package: '', p_message: message })
    form.hidden = true
    document.querySelector('[data-lead-done]').hidden = false
  } catch (err) {
    // Not lost: the same details can go by WhatsApp in one tap.
    const waText = [`${FROM_INSTAGRAM} وأرغب بالاستفسار عن: ${service}`, `الاسم: ${name}`, brand && `الجهة: ${brand}`, `الجوال: ${phone}`, `التواصل المفضّل: ${f.via.value}`, note].filter(Boolean).join('\n')
    const offline = err instanceof TypeError // no connection
    fail(offline ? 'تعذّر الاتصال. تحقق من الإنترنت، أو أرسل بياناتك على الواتساب.' : `${err.message.replace(/\.?$/, '')}${err.code ? ` (${err.code})` : ''}. أرسل بياناتك على الواتساب وسنتواصل معك.`, null, waText)
  } finally {
    button.disabled = false
    button.textContent = 'إرسال'
  }
})

async function showEvents() {
  const { listPublicExhibitions } = await import('../api/publicBooking.js')
  const list = await listPublicExhibitions().catch(() => [])
  if (!list.length) return
  const day = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('ar-OM', { day: 'numeric', month: 'long', year: 'numeric' })
  const box = document.querySelector('[data-events]')
  for (const ex of list) {
    const a = document.createElement('a')
    a.className = 'btn btn-line'
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
    a.dataset.track = 'event'
    const title = ex.name?.trim() || `${COMPANY.brand} ${ex.city || ''}`.trim()
    a.href = wa(`${FROM_INSTAGRAM} وأرغب بالاستفسار عن ${title}`)
    const t = document.createElement('span')
    t.className = 'txt'
    t.textContent = title
    const s = document.createElement('span')
    s.className = 'sub'
    s.textContent = [ex.mall || ex.city, ex.date_from && `${day(ex.date_from)}${ex.date_to && ex.date_to !== ex.date_from ? ` – ${day(ex.date_to)}` : ''}`].filter(Boolean).join(' · ')
    a.append(t, s)
    box.append(a)
  }
  document.getElementById('events').hidden = false
}
