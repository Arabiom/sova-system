import { newReference } from '../lib/finance.js'
import { num, todayISO } from '../lib/format.js'
import { supabase, unwrap } from './client.js'
import { adjustPaid } from './exhibitors.js'

const table = () => supabase.from('payments')

export const listPayments = (columns = '*') =>
  unwrap(table().select(columns).order('created_at', { ascending: false }))

/** Record a payment and add it to the exhibitor's paid total. Returns the new invoice number. */
export async function recordPayment(form) {
  const invoice_no = newReference('INV')
  await unwrap(
    table().insert({
      exhibitor_id: form.exhibitor_id,
      amount: num(form.amount),
      method: form.method || 'نقد',
      type: form.type || 'كامل',
      date: form.date || todayISO(),
      note: form.note || '',
      invoice_no,
    }),
  )
  await adjustPaid(form.exhibitor_id, num(form.amount))
  return invoice_no
}

/** Delete a payment and take it back off the exhibitor's paid total. */
export async function deletePayment(payment) {
  await unwrap(table().delete().eq('id', payment.id))
  await adjustPaid(payment.exhibitor_id, -num(payment.amount))
}
