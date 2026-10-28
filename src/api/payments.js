import { isConfirmed, newReference } from '../lib/finance.js'
import { num, todayISO } from '../lib/format.js'
import { fetchAll, supabase, unwrap } from './client.js'
import { adjustPaid } from './exhibitors.js'
import { RECEIPT_BUCKET } from './staffExpenses.js'
import { tr } from '../lib/i18n.js'
import { openFile, uploadFile } from './storage.js'
import { PAYMENT_CONFIRMED, PAYMENT_PENDING, REFUND_TYPE } from '../lib/constants.js'

const table = () => supabase.from('payments')

/**
 * Payment log, newest first. Payments still waiting for confirmation are left out
 * (they are not money collected yet) unless `includePending` is set.
 */
export async function listPayments(columns = '*', { includePending = false } = {}) {
  // the status is always read: without it a payment still waiting would pass as confirmed
  const cols = columns === '*' || /\bstatus\b/.test(columns) ? columns : `${columns},status`
  const rows = await unwrap(fetchAll(() => table().select(cols).order('created_at', { ascending: false })))
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

/**
 * A payment already recorded for this exhibitor with the same amount on the same day — most
 * likely the same money entered twice. null when there is none (or it cannot be read).
 */
export async function findSamePayment({ exhibitor_id, amount, type, date }) {
  if (!exhibitor_id || !(num(amount) > 0)) return null
  const { data, error } = await table()
    .select('id, invoice_no, amount, date')
    .eq('exhibitor_id', exhibitor_id)
    .eq('amount', signedAmount(type || 'كامل', amount))
    .eq('date', date || todayISO())
    .limit(1)
  return error ? null : data?.[0] || null
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
  // only a payment still waiting moves the total — a second click (or a colleague) changes nothing
  const rows = await unwrap(
    table()
      .update({
        status: PAYMENT_CONFIRMED,
        confirmed_by: userId || null,
        confirmed_at: new Date().toISOString(),
        // the money arrived: a transfer marked «not yet» is now done
        ...(payment.transfer_status === TRANSFER_NOT_YET ? { transfer_status: TRANSFER_DONE } : {}),
      })
      .eq('id', payment.id)
      .eq('status', PAYMENT_PENDING)
      .select('id'),
  )
  if (rows?.length) await adjustPaid(payment.exhibitor_id, num(payment.amount))
}

/** Edit a recorded payment (same exhibitor); a confirmed one moves the paid total by the difference. */
export async function updatePayment(payment, form) {
  const type = form.type || payment.type || 'كامل'
  const amount = signedAmount(type, form.amount)
  // changed only if nobody changed its amount meanwhile, so the total moves by the right difference
  const rows = await unwrap(
    table()
      .update({ amount, method: form.method || payment.method, type, date: form.date || payment.date, note: form.note || '' })
      .eq('id', payment.id)
      .eq('amount', num(payment.amount))
      .select('id'),
  )
  if (!rows?.length) throw new Error(tr('تغيّرت هذه الدفعة من مستخدم آخر — حدّث الصفحة ثم أعد التعديل'))
  const delta = amount - num(payment.amount)
  if (delta && isConfirmed(payment)) await adjustPaid(payment.exhibitor_id, delta)
}

/** Delete a payment; a confirmed one is taken back off the exhibitor's paid total. */
export async function deletePayment(payment) {
  const rows = await unwrap(table().delete().eq('id', payment.id).select('id'))
  if (rows?.length && isConfirmed(payment)) await adjustPaid(payment.exhibitor_id, -num(payment.amount))
}
