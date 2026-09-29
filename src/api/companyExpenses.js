// Company expenses not tied to one exhibition: office rent, salaries, licences… (migration 012).

import { num, todayISO } from '../lib/format.js'
import { supabase, unwrap } from './client.js'
import { openFile, removeFile, uploadFile } from './storage.js'
import { RECEIPT_BUCKET } from './staffExpenses.js'

export const COMPANY_EXPENSE_CATEGORIES = [
  'إيجار مكتب',
  'رواتب وأجور',
  'رسوم حكومية وتراخيص',
  'اتصالات وإنترنت',
  'اشتراكات وبرامج',
  'تسويق وإعلانات عامة',
  'مواصلات',
  'مستلزمات مكتبية',
  'أخرى',
]

const table = () => supabase.from('company_expenses')

/** All company expenses, newest first; [] before migration 012 is run. */
export async function listCompanyExpenses() {
  const { data, error } = await table().select('*').order('date', { ascending: false })
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
  return errors
}

export function toCompanyExpenseRow(form) {
  const row = {
    date: form.date || todayISO(),
    category: form.category?.trim() || 'أخرى',
    description: form.description.trim(),
    amount: num(form.amount),
    paid: form.paid !== false,
    due_date: form.paid === false ? form.due_date || null : null,
    notes: form.notes?.trim() || '',
  }
  // Fixed monthly (migration 019): only sent when set or being switched off, so a database
  // without the update still saves ordinary expenses.
  if (form.recurring || form.wasRecurring) {
    row.recurring = Boolean(form.recurring)
    row.recurring_end = form.recurring && form.recurring_end ? `${form.recurring_end}-01` : null
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

/** Monthly total of the fixed expenses still running. */
export const monthlyFixedTotal = (rows) => rows.filter((x) => x.recurring).reduce((t, x) => t + num(x.amount), 0)

export async function saveCompanyExpense(form, { id, receiptFile, oldReceipt } = {}) {
  let receipt_path = oldReceipt || null
  if (receiptFile) receipt_path = await uploadFile(RECEIPT_BUCKET, 'company', receiptFile, { what: 'الفاتورة', migration: '012' })
  const row = { ...toCompanyExpenseRow(form), receipt_path }
  await unwrap(id ? table().update(row).eq('id', id) : table().insert(row))
  if (receiptFile && oldReceipt) await removeFile(RECEIPT_BUCKET, oldReceipt)
}

export const setCompanyExpensePaid = (id, paid) => unwrap(table().update({ paid }).eq('id', id))

export async function deleteCompanyExpense(x) {
  await unwrap(table().delete().eq('id', x.id))
  await removeFile(RECEIPT_BUCKET, x.receipt_path)
}

export const openCompanyReceipt = (path) => openFile(RECEIPT_BUCKET, path, { migration: '012' })
