import { isConfirmed, newReference } from '../lib/finance.js'
import { num, todayISO } from '../lib/format.js'
import { supabase, unwrap } from './client.js'
import { adjustPaid } from './exhibitors.js'
import { RECEIPT_BUCKET } from './staffExpenses.js'
import { openFile, uploadFile } from './storage.js'
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
  // Transfer status and receipt (migration 025) — only sent when there is one.
  if (form.transfer_status) row.transfer_status = form.transfer_status
  if (form.receipt_path) row.receipt_path = form.receipt_path
  // Marketing may add a payment but not read it back through a write, so no .select() here.
  await unwrap(table().insert(row))
  if (!pending) await adjustPaid(form.exhibitor_id, amount)
  return row
}

export const TRANSFER_DONE = 'تم التحويل'
export const TRANSFER_NOT_YET = 'لم يُحوَّل بعد'

/** A payment's transfer receipt: in the recorder's folder of the receipts bucket. */
export const uploadPaymentReceipt = (userId, file) =>
  uploadFile(RECEIPT_BUCKET, `${userId}/payments`, file, { what: 'الإيصال', migration: '008' })
export const openPaymentReceipt = (path) => openFile(RECEIPT_BUCKET, path, { migration: '008' })

/** Attach (or replace) the transfer receipt of a recorded payment. */
export async function attachPaymentReceipt(payment, file, userId) {
  const receipt_path = await uploadPaymentReceipt(userId, file)
  await unwrap(table().update({ receipt_path }).eq('id', payment.id))
}

/** Finance confirms the money arrived: the payment now counts and joins the paid total. */
export async function confirmPayment(payment, userId) {
  await unwrap(
    table()
      .update({
        status: PAYMENT_CONFIRMED,
        confirmed_by: userId || null,
        confirmed_at: new Date().toISOString(),
        // the money arrived: a transfer marked «not yet» is now done
        ...(payment.transfer_status === TRANSFER_NOT_YET ? { transfer_status: TRANSFER_DONE } : {}),
      })
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
