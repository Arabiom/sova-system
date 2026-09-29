// Obligations (migration 021): money the company must pay later — refunds owed to
// participants, postponed cheques, debts… Each keeps its original due date, the current one
// and every postponement.

import { num, todayISO } from '../lib/format.js'
import { supabase, unwrap } from './client.js'
import { recordPayment } from './payments.js'
import { REFUND_TYPE } from '../lib/constants.js'

export const OBLIGATION_KINDS = ['إرجاع مبلغ لمشارك', 'شيك مؤجل', 'دفعة مؤجلة لمورّد', 'دين / قرض', 'أخرى']
export const REFUND_KIND = OBLIGATION_KINDS[0]
export const CHEQUE_KIND = OBLIGATION_KINDS[1]
export const [OPEN, PAID] = ['قائم', 'مدفوع']

const table = () => supabase.from('obligations')

/** All obligations, soonest due first; [] before migration 021 is run. */
export async function listObligations() {
  const { data, error } = await table().select('*').order('due_date', { ascending: true, nullsFirst: false })
  if (error) {
    if (['42P01', 'PGRST205'].includes(error.code)) return []
    return unwrap(Promise.resolve({ data, error }))
  }
  return data
}

export function validateObligation(form) {
  const errors = []
  if (!form.party?.trim() && !form.exhibitor_id) errors.push('لمن (الجهة أو المشارك)')
  if (!(num(form.amount) > 0)) errors.push('المبلغ')
  if (!form.due_date) errors.push('تاريخ الاستحقاق')
  return errors
}

export function toObligationRow(form) {
  return {
    kind: form.kind || OBLIGATION_KINDS.at(-1),
    party: form.party?.trim() || '',
    exhibitor_id: form.exhibitor_id || null,
    exhibition_id: form.exhibition_id || null,
    description: form.description?.trim() || '',
    amount: num(form.amount),
    cheque_no: form.cheque_no?.trim() || '',
    due_date: form.due_date || null,
    notes: form.notes?.trim() || '',
  }
}

/** Add (the due date becomes the original one) or edit an obligation. */
export async function saveObligation(form, id) {
  const row = toObligationRow(form)
  if (id) return unwrap(table().update(row).eq('id', id))
  return unwrap(table().insert({ ...row, original_due: row.due_date }))
}

/** Postpone to a new date, keeping the history: [{ from, to, reason, at }]. */
export async function postponeObligation(ob, to, reason) {
  const history = [...(Array.isArray(ob.postponements) ? ob.postponements : []), { from: ob.due_date, to, reason: reason?.trim() || '', at: todayISO() }]
  return unwrap(table().update({ due_date: to, postponements: history }).eq('id', ob.id))
}

/**
 * Mark as paid. A refund owed to a participant is also recorded as a refund on their account
 * (it leaves the collected total and appears in the payment log with its own number).
 */
export async function payObligation(ob, { method = 'تحويل بنكي', date = todayISO() } = {}) {
  let refund_invoice = ''
  if (ob.kind === REFUND_KIND && ob.exhibitor_id) {
    const row = await recordPayment({ exhibitor_id: ob.exhibitor_id, amount: ob.amount, type: REFUND_TYPE, method, date, note: `التزام: ${ob.description || ob.party || ''}`.trim() })
    refund_invoice = row.invoice_no
  }
  await unwrap(table().update({ status: PAID, paid_at: date, refund_invoice }).eq('id', ob.id))
  return refund_invoice
}

/** Undo "paid" (only for obligations not linked to a recorded refund). */
export const reopenObligation = (ob) => unwrap(table().update({ status: OPEN, paid_at: null }).eq('id', ob.id))

export const deleteObligation = (id) => unwrap(table().delete().eq('id', id))

/** Where an open obligation stands today: 'late', 'soon' (within 7 days), 'later', or '' when paid. */
export function obligationState(ob, today) {
  if (ob.status === PAID) return ''
  if (!ob.due_date) return 'later'
  if (ob.due_date < today) return 'late'
  const days = (Date.parse(ob.due_date) - Date.parse(today)) / 86_400_000
  return days <= 7 ? 'soon' : 'later'
}
