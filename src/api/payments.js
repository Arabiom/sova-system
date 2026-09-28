import { isConfirmed, newReference } from '../lib/finance.js'
import { num, todayISO } from '../lib/format.js'
import { supabase, unwrap } from './client.js'
import { adjustPaid } from './exhibitors.js'
import { PAYMENT_CONFIRMED, PAYMENT_PENDING, REFUND_TYPE } from '../lib/constants.js'

const table = () => supabase.from('payments')

/**
 * Payment log, newest first. Payments still waiting for confirmation are left out
 * (they are not money collected yet) unless `includePending` is set.
 */
export async function listPayments(columns = '*', { includePending = false } = {}) {
  const rows = await unwrap(table().select(columns).order('created_at', { ascending: false }))
  return includePending ? rows : rows.filter(isConfirmed)
}

/** Stored amount: refunds are negative, everything else positive (whatever sign was typed). */
export const signedAmount = (type, amount) => (type === REFUND_TYPE ? -1 : 1) * Math.abs(num(amount))

/**
 * Record a payment (or refund). A confirmed payment is applied to the exhibitor's paid total
 * straight away; a pending one only when finance confirms it. Returns the saved row.
 */
export async function recordPayment(form, { pending = false } = {}) {
  const type = form.type || 'كامل'
  const amount = signedAmount(type, form.amount)
  const row = {
    exhibitor_id: form.exhibitor_id,
    amount,
    method: form.method || 'نقد',
    type,
    date: form.date || todayISO(),
    note: form.note || '',
    invoice_no: newReference(type === REFUND_TYPE ? 'RFD' : 'INV'),
    status: pending ? PAYMENT_PENDING : PAYMENT_CONFIRMED,
  }
  if (form.transfer_ref) row.transfer_ref = form.transfer_ref
  // Marketing may add a payment but not read it back through a write, so no .select() here.
  await unwrap(table().insert(row))
  if (!pending) await adjustPaid(form.exhibitor_id, amount)
  return row
}

/** Finance confirms the money arrived: the payment now counts and joins the paid total. */
export async function confirmPayment(payment, userId) {
  await unwrap(
    table()
      .update({ status: PAYMENT_CONFIRMED, confirmed_by: userId || null, confirmed_at: new Date().toISOString() })
      .eq('id', payment.id),
  )
  await adjustPaid(payment.exhibitor_id, num(payment.amount))
}

/** Edit a recorded payment (same exhibitor); a confirmed one moves the paid total by the difference. */
export async function updatePayment(payment, form) {
  const type = form.type || payment.type || 'كامل'
  const amount = signedAmount(type, form.amount)
  await unwrap(
    table()
      .update({ amount, method: form.method || payment.method, type, date: form.date || payment.date, note: form.note || '' })
      .eq('id', payment.id),
  )
  const delta = amount - num(payment.amount)
  if (delta && isConfirmed(payment)) await adjustPaid(payment.exhibitor_id, delta)
}

/** Delete a payment; a confirmed one is taken back off the exhibitor's paid total. */
export async function deletePayment(payment) {
  await unwrap(table().delete().eq('id', payment.id))
  if (isConfirmed(payment)) await adjustPaid(payment.exhibitor_id, -num(payment.amount))
}
