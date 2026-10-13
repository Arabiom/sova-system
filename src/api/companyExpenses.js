// Company expenses not tied to one exhibition: office rent, salaries, licences… (migration 012).

import { num, todayISO } from '../lib/format.js'
import { fetchAll, supabase, unwrap } from './client.js'
import { openFile, removeFile, uploadFile } from './storage.js'
import { RECEIPT_BUCKET } from './staffExpenses.js'

export const COMPANY_EXPENSE_CATEGORIES = [
  'إيجار مكتب',
  'إيجار مخزن',
  'رواتب وأجور',
  'كهرباء ومياه',
  'رسوم حكومية وتراخيص',
  'اتصالات وإنترنت',
  'اشتراكات وبرامج',
  'تسويق وإعلانات عامة',
  'تصميم وطباعة',
  'مواصلات ووقود',
  'صيانة وإصلاحات',
  'تأمين',
  'رسوم بنكية',
  'ضيافة',
  'عمولات استقطاب',
  'مستلزمات مكتبية',
  'أثاث ومعدات',
  'أخرى',
]

const table = () => supabase.from('company_expenses')
const paymentsTable = () => supabase.from('company_expense_payments')
const missing = (error) => ['42P01', 'PGRST205'].includes(error?.code)

/** What was paid of each company expense (migration 033); {} before it is run. */
async function paymentsByExpense() {
  const { data, error } = await fetchAll(() => paymentsTable().select('*').order('date', { ascending: true }), { tie: 'id' })
  if (error) return {}
  const out = {}
  for (const p of data || []) (out[p.expense_id] ||= []).push(p)
  return out
}

/**
 * All company expenses, newest first, each with `payments` (the parts paid so far, oldest
 * first); [] before migration 012 is run.
 */
export async function listCompanyExpenses() {
  const [{ data, error }, payments] = await Promise.all([fetchAll(() => table().select('*').order('date', { ascending: false })), paymentsByExpense()])
  if (error) {
    if (missing(error)) return []
    return unwrap(Promise.resolve({ data, error }))
  }
  return data.map((x) => ({ ...x, payments: payments[x.id] || [] }))
}

export function validateCompanyExpense(form) {
  const errors = []
  if (!form.description?.trim()) errors.push('البيان')
  if (!(num(form.amount) > 0)) errors.push('المبلغ')
  if (!form.date) errors.push('التاريخ')
  if (form.pay_from && form.pay_to && form.pay_to < form.pay_from) errors.push('نهاية فترة الدفع قبل بدايتها')
  if (form.recurring && ![1, 3, 6].includes(Number(form.recurring_every))) errors.push('مدة التكرار (شهر أو 3 أو 6 أشهر)')
  return errors
}

/**
 * Where an unpaid expense stands against its payment window:
 * 'upcoming' (window not open yet), 'open' (pay now), 'late' (window over), '' (paid / no dates).
 */
export function paymentWindowState(x, today) {
  if (x.paid !== false) return ''
  const from = x.pay_from || ''
  const to = x.pay_to || x.due_date || ''
  if (to && today > to) return 'late'
  if (from && today < from) return 'upcoming'
  if (from || to) return 'open'
  return ''
}

export function toCompanyExpenseRow(form) {
  const row = {
    date: form.date || todayISO(),
    category: form.category?.trim() || 'أخرى',
    description: form.description.trim(),
    amount: num(form.amount),
    paid: form.paid !== false,
    due_date: form.paid === false ? form.pay_to || form.due_date || null : null,
    notes: form.notes?.trim() || '',
  }
  // Payment window "from … to …" (migration 020): only sent when set or cleared, so a database
  // without the update still saves.
  if (form.pay_from || form.pay_to || form.hadWindow) {
    row.pay_from = form.pay_from || null
    row.pay_to = form.pay_to || null
  }
  // Fixed monthly (migration 019): only sent when set or being switched off, so a database
  // without the update still saves ordinary expenses.
  if (form.recurring || form.wasRecurring) {
    row.recurring = Boolean(form.recurring)
    row.recurring_end = form.recurring && form.recurring_end ? `${form.recurring_end}-01` : null
    // How often (migration 022): sent only when it differs from what is stored (monthly by
    // default), so a database without that update still saves monthly ones.
    const every = Number(form.recurring_every) || 1
    if (form.recurring && every !== (Number(form.origEvery) || 1)) row.recurring_every = every
  }
  return row
}

/**
 * Add the months due for every fixed monthly expense (a database function, migration 019).
 * Only admin / finance add anything; before the update is run nothing happens.
 */
export async function addDueMonthlyExpenses() {
  const { data, error } = await supabase.rpc('generate_recurring_company_expenses')
  return error ? 0 : data || 0
}

/** A fixed expense running in the month of `today`: started, and not past its last month. */
export const runningFixed = (x, today = todayISO()) =>
  Boolean(x.recurring) && String(x.date || '').slice(0, 7) <= today.slice(0, 7) && (!x.recurring_end || String(x.recurring_end).slice(0, 7) >= today.slice(0, 7))

/** Monthly equivalent of the fixed expenses running now (a 3-monthly one counts a third).
 *  Ended ones and those not started yet are left out. */
export const monthlyFixedTotal = (rows, today = todayISO()) =>
  Math.round(rows.filter((x) => runningFixed(x, today)).reduce((t, x) => t + num(x.amount) / (Number(x.recurring_every) || 1), 0) * 1000) / 1000

export async function saveCompanyExpense(form, { id, receiptFile, oldReceipt } = {}) {
  let receipt_path = oldReceipt || null
  if (receiptFile) receipt_path = await uploadFile(RECEIPT_BUCKET, 'company', receiptFile, { what: 'الفاتورة', migration: '012' })
  const row = { ...toCompanyExpenseRow(form), receipt_path }
  await unwrap(id ? table().update(row).eq('id', id) : table().insert(row))
  if (receiptFile && oldReceipt) await removeFile(RECEIPT_BUCKET, oldReceipt)
}

export const setCompanyExpensePaid = (id, paid) => unwrap(table().update({ paid }).eq('id', id))

/** Written in the notes of a fixed expense's own record closed at less than its amount. */
export const SETTLED_NOTE = 'تسوية نهائية'

/** Total paid so far of a company expense (its parts), whatever its «paid» mark. */
export const paidSoFar = (x) => Math.round((x.payments || []).reduce((t, p) => t + num(p.amount), 0) * 1000) / 1000

/**
 * Record a payment of a company expense — all of what is left or a part of it — with its date,
 * a note and the transfer receipt. The expense is marked paid once its parts reach the amount;
 * `settle` closes it now (the rest will not be paid: a deduction) — then its amount becomes what
 * was paid (not on a fixed expense's own record, whose amount the coming months are made from).
 * Before migration 033 a payment can only be the whole amount.
 */
export async function payCompanyExpense(x, { amount, date = todayISO(), note, receiptFile, settle = false } = {}) {
  const value = Math.round(num(amount) * 1000) / 1000
  if (!(value > 0)) throw new Error('أدخل المبلغ المدفوع')
  const receipt_path = receiptFile ? await uploadFile(RECEIPT_BUCKET, 'company', receiptFile, { what: 'إيصال الدفع', migration: '012' }) : null
  const { error } = await paymentsTable().insert({ expense_id: x.id, amount: value, date, note: note?.trim() || '', receipt_path })
  if (missing(error)) {
    // Before migration 033: the whole expense is marked paid at once.
    const patch = { paid: true }
    if (!x.recurring && value !== num(x.amount)) patch.amount = value
    if (note?.trim()) patch.notes = [x.notes, note.trim()].filter(Boolean).join(' • ')
    if (receipt_path) patch.receipt_path = receipt_path
    await unwrap(table().update(patch).eq('id', x.id))
    return
  }
  if (error) throw error
  const total = Math.round((paidSoFar(x) + value) * 1000) / 1000
  if (total >= num(x.amount) - 0.0005) await unwrap(table().update({ paid: true }).eq('id', x.id))
  else if (settle) {
    // A fixed expense's own record keeps its amount (the coming months are made from it), so
    // the settlement is written in its notes: only what was paid counts (settledOf).
    const patch = x.recurring
      ? { paid: true, notes: [x.notes, `${SETTLED_NOTE}: دُفع ${total.toFixed(3)} من ${num(x.amount).toFixed(3)}`].filter(Boolean).join(' • ') }
      : { paid: true, amount: total }
    await unwrap(table().update(patch).eq('id', x.id))
  }
}

/** Remove one recorded payment; the expense is open again if what is left falls short. */
export async function deleteExpensePayment(x, payment) {
  await unwrap(paymentsTable().delete().eq('id', payment.id))
  await removeFile(RECEIPT_BUCKET, payment.receipt_path)
  const left = paidSoFar({ payments: (x.payments || []).filter((p) => p.id !== payment.id) })
  if (left < num(x.amount) - 0.0005 && x.paid !== false) await unwrap(table().update(reopen(x)).eq('id', x.id))
}

/** Open again: unpaid, and no longer settled. */
const reopen = (x) => {
  const notes = String(x.notes || '').split(' • ').filter((n) => !n.startsWith(SETTLED_NOTE)).join(' • ')
  return notes === (x.notes || '') ? { paid: false } : { paid: false, notes }
}

/** Mark unpaid: its recorded payments are removed too, so nothing is counted as paid. */
export async function unpayCompanyExpense(x) {
  for (const p of x.payments || []) await deleteExpensePayment({ ...x, paid: false }, p)
  await unwrap(table().update(reopen(x)).eq('id', x.id))
}

export async function deleteCompanyExpense(x) {
  await unwrap(table().delete().eq('id', x.id))
  await removeFile(RECEIPT_BUCKET, x.receipt_path)
}

export const openCompanyReceipt = (path) => openFile(RECEIPT_BUCKET, path, { migration: '012' })
