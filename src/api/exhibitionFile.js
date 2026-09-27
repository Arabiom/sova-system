// Site map, expenses and sponsors of one exhibition, plus the Excel import.

import { num, todayISO } from '../lib/format.js'
import { formatRanges } from '../lib/sites.js'
import { supabase, unwrap } from './client.js'
import { findOrCreateClient } from './clients.js'
import { createExhibitor, updateExhibitor } from './exhibitors.js'
import { recordPayment } from './payments.js'

const sites = () => supabase.from('exhibition_sites')
const expenses = () => supabase.from('exhibition_expenses')
const sponsors = () => supabase.from('exhibition_sponsors')

// ── Sites ────────────────────────────────────────────────────────────────
export const listSites = (exhibitionId) => {
  const q = sites().select('*').order('number')
  return unwrap(exhibitionId ? q.eq('exhibition_id', exhibitionId) : q)
}

/** Add booths `numbers` with one tier/price. Existing numbers are rejected by the database. */
export const addSites = (exhibitionId, numbers, tier, price) =>
  unwrap(sites().insert(numbers.map((number) => ({ exhibition_id: exhibitionId, number, tier, price: num(price) }))))

/** Rename / reprice every booth of a tier. */
export const updateTier = (exhibitionId, oldTier, oldPrice, { tier, price }) =>
  unwrap(sites().update({ tier, price: num(price) }).eq('exhibition_id', exhibitionId).eq('tier', oldTier).eq('price', oldPrice))

export const deleteTier = (exhibitionId, tier, price) =>
  unwrap(sites().delete().eq('exhibition_id', exhibitionId).eq('tier', tier).eq('price', price))

export const deleteAllSites = (exhibitionId) => unwrap(sites().delete().eq('exhibition_id', exhibitionId))

/** Keep the exhibitor's booth label in step with the sites they hold ("16، 22"). */
async function syncBoothLabel(exhibitorId) {
  const held = await unwrap(sites().select('number').eq('exhibitor_id', exhibitorId))
  await updateExhibitor(exhibitorId, { booth: held.length ? formatRanges(held.map((s) => s.number)) : '—' })
}

/**
 * Give `site` to `exhibitor` (or free it when exhibitor is null).
 * With adjustContract, the site's price is added to / taken off the exhibitor's contract.
 */
export async function assignSite(site, exhibitor, { adjustContract = true, previous } = {}) {
  await unwrap(sites().update({ exhibitor_id: exhibitor?.id || null }).eq('id', site.id))
  if (previous) {
    if (adjustContract) await updateExhibitor(previous.id, { contract: Math.max(0, num(previous.contract) - num(site.price)) })
    await syncBoothLabel(previous.id)
  }
  if (exhibitor) {
    if (adjustContract) await updateExhibitor(exhibitor.id, { contract: num(exhibitor.contract) + num(site.price) })
    await syncBoothLabel(exhibitor.id)
  }
}

// ── Expenses ─────────────────────────────────────────────────────────────
export const listExpenses = (exhibitionId) =>
  unwrap(expenses().select('*').eq('exhibition_id', exhibitionId).order('due_date', { ascending: true, nullsFirst: false }))

export function toExpenseRow(form, exhibitionId) {
  return {
    exhibition_id: exhibitionId,
    item: form.item?.trim(),
    category: form.category || '',
    amount: num(form.amount),
    due_date: form.due_date || null,
    paid: Boolean(form.paid),
    notes: form.notes || '',
  }
}

export const saveExpense = (form, exhibitionId, id) =>
  unwrap(id ? expenses().update(toExpenseRow(form, exhibitionId)).eq('id', id) : expenses().insert(toExpenseRow(form, exhibitionId)))

export const setExpensePaid = (id, paid) => unwrap(expenses().update({ paid }).eq('id', id))
export const deleteExpense = (id) => unwrap(expenses().delete().eq('id', id))

// ── Sponsors ─────────────────────────────────────────────────────────────
export const listSponsors = (exhibitionId) =>
  unwrap(sponsors().select('*').eq('exhibition_id', exhibitionId).order('created_at'))

export function toSponsorRow(form, exhibitionId) {
  return {
    exhibition_id: exhibitionId,
    name: form.name?.trim(),
    contact_name: form.contact_name || '',
    phone: form.phone || '',
    amount: num(form.amount),
    status: form.status || 'متفق عليه',
    notes: form.notes || '',
  }
}

export const saveSponsor = (form, exhibitionId, id) =>
  unwrap(id ? sponsors().update(toSponsorRow(form, exhibitionId)).eq('id', id) : sponsors().insert(toSponsorRow(form, exhibitionId)))

export const deleteSponsor = (id) => unwrap(sponsors().delete().eq('id', id))

// ── Excel import ─────────────────────────────────────────────────────────
/**
 * Apply a plan from planImport(): create the site map, then one exhibitor per participant
 * (linked to its client), assign their booths and record what they have paid so far.
 * `onProgress(done, total)` is called after each participant.
 */
export async function applyImport(exhibitionId, plan, onProgress = () => {}) {
  const existing = await unwrap(sites().select('id').eq('exhibition_id', exhibitionId).limit(1))
  if (existing.length) throw new Error('هذا المعرض لديه خارطة مواقع بالفعل. احذف الخارطة الحالية أولاً ثم أعد الاستيراد.')

  await unwrap(sites().insert(plan.sites.map((s) => ({ exhibition_id: exhibitionId, number: s.number, tier: s.tier, price: s.price }))))

  const known = await unwrap(supabase.from('clients').select('id,name,phone'))
  let done = 0
  for (const p of plan.exhibitors) {
    const client_id = await findOrCreateClient({ brand: p.brand, manager: p.manager, phone: p.phone, category: p.category }, known)
    const exhibitor = await createExhibitor({
      client_id,
      exhibition_id: exhibitionId,
      brand: p.brand,
      manager: p.manager,
      phone: p.phone || '',
      email: '',
      category: p.category || '',
      booth: formatRanges(p.numbers),
      booth_size: '',
      contract: p.contract,
      paid: 0,
      status: p.contract > 0 && p.paid >= p.contract ? 'مؤكد' : 'مبدئي',
      notes: p.notes || '',
    })
    await unwrap(sites().update({ exhibitor_id: exhibitor.id }).eq('exhibition_id', exhibitionId).in('number', p.numbers))
    if (p.paid > 0) {
      await recordPayment({
        exhibitor_id: exhibitor.id,
        amount: p.paid,
        method: 'غير محدد',
        type: p.paid >= p.contract ? 'كامل' : 'مقدمة',
        date: todayISO(),
        note: 'رصيد مستورد من ملف Excel',
      })
    }
    onProgress(++done, plan.exhibitors.length)
  }
}
