// Expenses paid by staff for the company, each with its invoice / receipt (migration 008).

import { num, todayISO } from '../lib/format.js'
import { fetchAll, supabase, unwrap } from './client.js'
import { openFile, removeFile, uploadFile } from './storage.js'

export const RECEIPT_BUCKET = 'expense-receipts'
export const EXPENSE_STATUSES = ['بانتظار المراجعة', 'معتمد', 'مرفوض', 'تم التعويض']
export const [EXPENSE_PENDING, EXPENSE_APPROVED, EXPENSE_REJECTED, EXPENSE_REIMBURSED] = EXPENSE_STATUSES

/** Suggestions for the "what for" field; any other wording is accepted. */
export const STAFF_EXPENSE_CATEGORIES = [
  'مواصلات ووقود',
  'طباعة وتصميم',
  'تجهيزات ومشتريات للمعرض',
  'ضيافة',
  'إعلانات وتسويق',
  'رسوم وتصاريح',
  'اتصالات وإنترنت',
  'أخرى',
]

const table = () => supabase.from('staff_expenses')

export const listStaffExpenses = () => unwrap(fetchAll(() => table().select('*').order('date', { ascending: false }).order('created_at', { ascending: false })))

/** Problems that stop an expense being saved (empty list = OK). */
export function validateStaffExpense(form, { hasReceipt }) {
  const errors = []
  if (!(num(form.amount) > 0)) errors.push('المبلغ')
  if (!form.date) errors.push('التاريخ')
  if (!form.description?.trim()) errors.push('وصف المصروف')
  if (!hasReceipt) errors.push('صورة الفاتورة أو الإيصال')
  return errors
}

export function toStaffExpenseRow(form) {
  return {
    exhibition_id: form.exhibition_id || null,
    date: form.date || todayISO(),
    amount: num(form.amount),
    category: form.category?.trim() || '',
    description: form.description.trim(),
    vendor: form.vendor?.trim() || '',
    payment_method: form.payment_method || '',
  }
}

/**
 * Add or edit the signed-in employee's expense. A newly chosen receipt file is uploaded into
 * their own folder; the one it replaces is deleted afterwards.
 */
export async function saveStaffExpense(form, { userId, receiptFile, id, oldReceipt }) {
  let receipt_path = oldReceipt || null
  if (receiptFile) {
    receipt_path = await uploadFile(RECEIPT_BUCKET, userId, receiptFile, { what: 'الإيصال', migration: '008' })
  }
  const row = { ...toStaffExpenseRow(form), receipt_path }
  // A new expense always starts awaiting review (the database insists on it too).
  await unwrap(id ? table().update(row).eq('id', id) : table().insert({ ...row, status: EXPENSE_PENDING }))
  if (receiptFile && oldReceipt) await removeFile(RECEIPT_BUCKET, oldReceipt)
}

/** Admin/finance review: approve, reject (with a note) or mark reimbursed. */
export const reviewStaffExpense = (id, status, { reviewerId, note = '' } = {}) =>
  unwrap(
    table()
      .update({ status, review_note: note, reviewed_by: reviewerId || null, reviewed_at: new Date().toISOString() })
      .eq('id', id),
  )

export async function deleteStaffExpense(expense) {
  await unwrap(table().delete().eq('id', expense.id))
  await removeFile(RECEIPT_BUCKET, expense.receipt_path)
}

export const openReceipt = (path) => openFile(RECEIPT_BUCKET, path, { migration: '008' })

/** Totals per status, for the summary cards. */
export function expenseTotals(rows) {
  const sum = (status) => rows.filter((r) => !status || r.status === status).reduce((t, r) => t + num(r.amount), 0)
  return {
    all: sum(),
    pending: sum(EXPENSE_PENDING),
    approved: sum(EXPENSE_APPROVED),
    reimbursed: sum(EXPENSE_REIMBURSED),
    rejected: sum(EXPENSE_REJECTED),
    // approved but not yet paid back to the employee
    owed: sum(EXPENSE_APPROVED),
  }
}
