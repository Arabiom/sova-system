import { newReference } from '../lib/finance.js'
import { num, todayISO } from '../lib/format.js'
import { supabase, unwrap } from './client.js'
import { adjustPaid } from './exhibitors.js'
import { REFUND_TYPE } from '../lib/constants.js'

const table = () => supabase.from('payments')

export const listPayments = (columns = '*') =>
  unwrap(table().select(columns).order('created_at', { ascending: false }))

/** Stored amount: refunds are negative, everything else positive (whatever sign was typed). */
export const signedAmount = (type, amount) => (type === REFUND_TYPE ? -1 : 1) * Math.abs(num(amount))

/** Record a payment (or refund) and apply it to the exhibitor's paid total. Returns the invoice number. */
export async function recordPayment(form) {
  const type = form.type || 'كامل'
  const amount = signedAmount(type, form.amount)
  const invoice_no = newReference(type === REFUND_TYPE ? 'RFD' : 'INV')
  await unwrap(
    table().insert({
      exhibitor_id: form.exhibitor_id,
      amount,
      method: form.method || 'نقد',
      type,
      date: form.date || todayISO(),
      note: form.note || '',
      invoice_no,
    }),
  )
  await adjustPaid(form.exhibitor_id, amount)
  return invoice_no
}

/** Edit a recorded payment (same exhibitor); the exhibitor's paid total moves by the difference. */
export async function updatePayment(payment, form) {
  const type = form.type || payment.type || 'كامل'
  const amount = signedAmount(type, form.amount)
  await unwrap(
    table()
      .update({ amount, method: form.method || payment.method, type, date: form.date || payment.date, note: form.note || '' })
      .eq('id', payment.id),
  )
  const delta = amount - num(payment.amount)
  if (delta) await adjustPaid(payment.exhibitor_id, delta)
}

/** Delete a payment and take it back off the exhibitor's paid total. */
export async function deletePayment(payment) {
  await unwrap(table().delete().eq('id', payment.id))
  await adjustPaid(payment.exhibitor_id, -num(payment.amount))
}
