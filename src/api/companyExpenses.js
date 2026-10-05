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

/** All company expenses, newest first; [] before migration 012 is run. */
export async function listCompanyExpenses() {
  const { data, error } = await fetchAll(() => table().select('*').order('date', { ascending: false }))
  if (error) {
    if (['42P01', 'PGRST205'].includes(error.code)) return []
    return unwrap(Promise.resolve({ data, error }))
  }
  return data
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

/**
 * Record that a company expense was paid: optionally a different amount for this time only
 * (not on a fixed expense's own record, whose amount is used for the coming months), the
 * transfer receipt, and a note.
 */
export async function payCompanyExpense(x, { amount, note, receiptFile } = {}) {
  const patch = { paid: true }
  if (amount != null && !x.recurring && num(amount) > 0 && num(amount) !== num(x.amount)) patch.amount = num(amount)
  if (note?.trim()) patch.notes = [x.notes, note.trim()].filter(Boolean).join(' • ')
  if (receiptFile) patch.receipt_path = await uploadFile(RECEIPT_BUCKET, 'company', receiptFile, { what: 'إيصال الدفع', migration: '012' })
  await unwrap(table().update(patch).eq('id', x.id))
  if (receiptFile && x.receipt_path) await removeFile(RECEIPT_BUCKET, x.receipt_path)
}

export async function deleteCompanyExpense(x) {
  await unwrap(table().delete().eq('id', x.id))
  await removeFile(RECEIPT_BUCKET, x.receipt_path)
}

export const openCompanyReceipt = (path) => openFile(RECEIPT_BUCKET, path, { migration: '012' })
