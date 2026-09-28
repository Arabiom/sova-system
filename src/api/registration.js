// Participant registration (استمارة تسجيل المشاركين): one step from the filled-in form to a
// client record, an exhibitor with their site, the payment received and the tax invoice.

import { BOOTH_AREA, EXHIBITOR_STATUSES } from '../lib/constants.js'
import { DISCOUNT_ITEM, registrationTotals, withoutVat } from '../lib/finance.js'
import { num, todayISO } from '../lib/format.js'
import { supabase, unwrap } from './client.js'
import { findOrCreateClient } from './clients.js'
import { createExhibitor, updateExhibitor } from './exhibitors.js'
import { recordPayment } from './payments.js'
import { tr } from '../lib/i18n.js'

/** Extras actually chosen, as stored on the exhibitor: [{ name, price, qty }]. */
export function chosenExtras(form) {
  const list = Object.entries(form.extras || {})
    .filter(([, qty]) => num(qty) > 0)
    .map(([name, qty]) => ({ name, price: num(form.extraPrices?.[name]), qty: num(qty) }))
  if (num(form.otherAmount) > 0 || form.otherExtras?.trim()) {
    list.push({ name: form.otherExtras?.trim() || 'إضافات أخرى', price: num(form.otherAmount), qty: 1 })
  }
  // A discount (manager / finance) is kept as a negative line, so the invoice shows the full
  // package price and the discount given.
  if (num(form.discount) > 0) list.push({ name: DISCOUNT_ITEM, price: -num(form.discount), qty: 1 })
  return list
}

/** Most sectors one participant may tick on the form. */
export const MAX_SECTORS = 3

/** Sectors ticked on the form, as stored on the exhibitor ("أزياء، أقمشة"). */
export const sectorsText = (form) => (Array.isArray(form.categories) ? form.categories.join('، ') : form.category || '')

/** Problems that stop the form being saved (empty list = OK). `amount` is what was paid including VAT. */
export function validateRegistration(form) {
  const errors = []
  if (!form.exhibition_id) errors.push('اختر المعرض')
  if (!form.manager?.trim()) errors.push('الاسم الكامل')
  if (!form.brand?.trim()) errors.push('اسم المشروع')
  if (!form.phone?.trim()) errors.push('رقم التواصل')
  if (!sectorsText(form)) errors.push('القطاع')
  if (Array.isArray(form.categories) && form.categories.length > MAX_SECTORS) errors.push(tr('القطاع ({0} كحد أقصى)', [MAX_SECTORS]))
  if (!form.package) errors.push('نظام البوث')
  if (num(form.amount) < 0) errors.push('المبلغ المدفوع لا يكون سالباً')
  if (num(form.discount) < 0) errors.push('الخصم لا يكون سالباً')
  if (num(form.amount) > 0 && !form.method) errors.push('طريقة السداد')
  if (!form.terms_accepted) errors.push('موافقة المشارك على الشروط والأحكام')
  return errors
}

/**
 * Save a registration. `pending` = the payment waits for finance to confirm it (marketing).
 * Returns { exhibitor, payment, totals, siteLost } for the invoice; siteLost = the chosen site was
 * booked by someone else in the same moment, so the participant was saved without a site.
 */
export async function registerParticipant(form, { pending, boothPrice }) {
  const extras = chosenExtras(form)
  const totals = registrationTotals({ boothPrice, extras })
  // The form takes what the participant actually paid, VAT included; payments are kept before VAT.
  const amount = withoutVat(form.amount)
  const fullyPaid = totals.subtotal > 0 && amount >= totals.subtotal - 0.0005
  const category = sectorsText(form)

  // Check the site is still free before saving anything (someone else may have just booked it).
  let site = null
  if (form.site_id) {
    site = await unwrap(supabase.from('exhibition_sites').select('id,number,exhibitor_id').eq('id', form.site_id).maybeSingle())
    if (!site || site.exhibitor_id) throw new Error(tr('هذا الموقع حُجز لمشارك آخر للتو. اختر موقعاً غيره.'))
  }

  const client_id = await findOrCreateClient({ brand: form.brand, manager: form.manager, phone: form.phone, category })
  const exhibitor = await createExhibitor({
    exhibition_id: form.exhibition_id,
    client_id,
    brand: form.brand.trim(),
    manager: form.manager.trim(),
    phone: form.phone.trim(),
    email: '',
    category,
    civil_id: form.civil_id?.trim() || '',
    products: form.products?.trim() || '',
    booth_type: form.package,
    extras,
    terms_accepted: true,
    booth: site ? String(site.number) : form.booth_number?.trim() || '—',
    booth_size: BOOTH_AREA,
    contract: totals.subtotal,
    paid: 0,
    status: fullyPaid && !pending ? EXHIBITOR_STATUSES[2] : EXHIBITOR_STATUSES[0],
    notes: form.notes?.trim() || '',
  })

  // Take the site only if it is still free at this moment.
  let siteLost = false
  if (site) {
    const taken = await unwrap(
      supabase.from('exhibition_sites').update({ exhibitor_id: exhibitor.id }).eq('id', site.id).is('exhibitor_id', null).select('id'),
    )
    if (!taken.length) {
      siteLost = true
      await updateExhibitor(exhibitor.id, { booth: '—' })
      exhibitor.booth = '—'
    }
  }

  let payment = null
  if (amount > 0) {
    payment = await recordPayment(
      {
        exhibitor_id: exhibitor.id,
        amount,
        method: form.method,
        type: fullyPaid ? 'كامل' : 'مقدمة',
        date: form.date || todayISO(),
        note: 'استمارة تسجيل',
        transfer_ref: form.transfer_ref?.trim() || '',
      },
      { pending },
    )
    if (!pending) exhibitor.paid = amount
  }
  return { exhibitor, payment, totals, siteLost }
}

/** After finance confirms a payment: a participant who has now paid in full is confirmed. */
export async function confirmIfPaid(exhibitorId) {
  const e = await unwrap(supabase.from('exhibitors').select('paid,contract,status').eq('id', exhibitorId).maybeSingle())
  if (e && num(e.contract) > 0 && num(e.paid) >= num(e.contract) && e.status !== EXHIBITOR_STATUSES[2]) {
    await updateExhibitor(exhibitorId, { status: EXHIBITOR_STATUSES[2] })
  }
}
