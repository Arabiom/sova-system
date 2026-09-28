import { describe, expect, it } from 'vitest'
import { toCompanyExpenseRow, validateCompanyExpense } from '../../api/companyExpenses.js'
import { companyOverview, monthlyFlow, receivables } from '../finance.js'

const data = {
  exhibitors: [
    { id: 'a', exhibition_id: 'x', brand: 'أ', contract: 200, paid: 200 },
    { id: 'b', exhibition_id: 'x', brand: 'ب', contract: 150, paid: 50 },
    { id: 'c', exhibition_id: 'y', brand: 'ج', contract: 100, paid: 0 },
  ],
  payments: [
    { exhibitor_id: 'a', amount: 200, date: '2026-10-05', status: 'مؤكد' },
    { exhibitor_id: 'b', amount: 50, date: '2026-11-02' },
    { exhibitor_id: 'c', amount: 100, date: '2026-11-03', status: 'بانتظار التأكيد' },
  ],
  expenses: [
    { amount: 840, paid: true, due_date: '2026-10-20' },
    { amount: 60, paid: false, due_date: '2026-12-01' },
  ],
  sponsors: [{ amount: 300, status: 'مدفوع' }],
  companyExpenses: [
    { amount: 120, paid: true, date: '2026-10-01' },
    { amount: 30, paid: false, date: '2026-11-01' },
  ],
  staffExpenses: [
    { amount: 12.5, status: 'تم التعويض', reviewed_at: '2026-11-10T10:00:00Z' },
    { amount: 20, status: 'معتمد' },
    { amount: 99, status: 'بانتظار المراجعة' },
    { amount: 5, status: 'مرفوض' },
  ],
}

describe('company finance', () => {
  it('adds up income, receivables and every kind of expense', () => {
    const o = companyOverview(data)
    expect(o).toMatchObject({
      contracts: 450,
      collected: 250, // the pending 100 is not collected yet
      receivable: 200,
      awaiting: 100,
      sponsorship: 300,
      exhibitionExpenses: 900,
      exhibitionExpensesPaid: 840,
      company: 150,
      companyPaid: 120,
      staffClaims: 32.5, // approved + reimbursed only
      staffReimbursed: 12.5,
      staffOwed: 20,
      expensesAll: 1082.5,
      expensesPaidAll: 972.5,
      payable: 110,
      net: 450 + 300 - 1082.5,
      cash: 250 + 300 - 972.5,
    })
  })

  it('lists who still owes, largest first', () => {
    const r = receivables(data.exhibitors, [{ id: 'x', name: 'نزوى' }, { id: 'y', name: 'مسقط' }])
    expect(r.map((x) => [x.exhibitor.brand, x.remaining])).toEqual([
      ['ب', 100],
      ['ج', 100],
    ])
  })

  it('shows money in and out per month', () => {
    const flow = monthlyFlow(data)
    expect(flow.map((m) => m.month)).toEqual(['2026-11', '2026-10'])
    expect(flow[1]).toMatchObject({ in: 200, exhibitions: 840, company: 120, staff: 0, out: 960, net: -760 })
    expect(flow[0]).toMatchObject({ in: 50, staff: 12.5, company: 0, net: 37.5 })
  })

  it('validates and maps a company expense', () => {
    expect(validateCompanyExpense({})).toEqual(['البيان', 'المبلغ', 'التاريخ'])
    expect(toCompanyExpenseRow({ description: ' إيجار ', amount: '250', date: '2026-10-01', paid: false, due_date: '2026-10-05' })).toMatchObject({
      description: 'إيجار',
      amount: 250,
      paid: false,
      due_date: '2026-10-05',
      category: 'أخرى',
    })
    expect(toCompanyExpenseRow({ description: 'x', amount: 1, date: '2026-10-01', due_date: '2026-10-05' }).due_date).toBe(null)
  })
})
