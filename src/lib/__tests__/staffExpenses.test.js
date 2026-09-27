import { describe, expect, it } from 'vitest'
import { expenseTotals, toStaffExpenseRow, validateStaffExpense } from '../../api/staffExpenses.js'
import { checkFile } from '../../api/storage.js'
import { can } from '../permissions.js'

describe('staff expenses', () => {
  it('needs amount, date, description and the receipt', () => {
    expect(validateStaffExpense({}, { hasReceipt: false })).toEqual(['المبلغ', 'التاريخ', 'وصف المصروف', 'صورة الفاتورة أو الإيصال'])
    expect(validateStaffExpense({ amount: '12.5', date: '2026-10-01', description: 'طباعة' }, { hasReceipt: true })).toEqual([])
    expect(validateStaffExpense({ amount: '0', date: '2026-10-01', description: 'x' }, { hasReceipt: true })).toEqual(['المبلغ'])
  })

  it('maps the form to the table without status or owner (set by the database)', () => {
    const row = toStaffExpenseRow({ amount: '12.500', date: '2026-10-01', description: ' طباعة بنرات ', exhibition_id: '' })
    expect(row).toEqual({ exhibition_id: null, date: '2026-10-01', amount: 12.5, category: '', description: 'طباعة بنرات', vendor: '', payment_method: '' })
    expect(row).not.toHaveProperty('status')
    expect(row).not.toHaveProperty('user_id')
  })

  it('adds up each status', () => {
    const t = expenseTotals([
      { amount: 10, status: 'بانتظار المراجعة' },
      { amount: 20, status: 'معتمد' },
      { amount: 5, status: 'تم التعويض' },
      { amount: 7, status: 'مرفوض' },
    ])
    expect(t).toMatchObject({ all: 42, pending: 10, owed: 20, reimbursed: 5, rejected: 7 })
  })

  it('accepts receipt photos and PDFs up to 10 MB', () => {
    expect(checkFile({ type: 'image/jpeg', size: 2e6 }, 'الإيصال')).toBe('')
    expect(checkFile({ type: 'application/pdf', size: 2e6 }, 'الإيصال')).toBe('')
    expect(checkFile({ type: 'text/plain', size: 10 }, 'الإيصال')).toMatch(/صورة/)
    expect(checkFile({ type: 'image/png', size: 11 * 1024 * 1024 }, 'الإيصال')).toMatch(/10/)
  })

  it('lets admin and finance review everyone, marketing only their own', () => {
    expect(can('admin', 'expenses.review')).toBe(true)
    expect(can('finance', 'expenses.review')).toBe(true)
    expect(can('marketing', 'expenses.review')).toBe(false)
  })
})
