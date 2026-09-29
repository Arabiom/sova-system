import { describe, expect, it } from 'vitest'
import { addMonths, commissionOf, contractExpenseRow, contractStatus, contractTotal, endAfter, monthsOf, validateContract } from '../../api/contracts.js'
import { companyPlan, contractsInPeriod, monthsBetween, upcomingFixed } from '../plan.js'

describe('contract dates', () => {
  it('ends the day before the same date n months on', () => {
    expect(endAfter('2026-10-01', 3)).toBe('2026-12-31')
    expect(endAfter('2026-10-15', 1)).toBe('2026-11-14')
    expect(endAfter('2026-01-31', 1)).toBe('2026-02-27')
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
  })
  it('counts monthly payments, a part month as one', () => {
    expect(monthsOf('2026-10-01', '2026-12-31')).toBe(3)
    expect(monthsOf('2026-10-15', '2027-01-14')).toBe(3)
    expect(monthsOf('2026-10-15', '2027-01-20')).toBe(4)
    expect(monthsOf('2026-10-01', '2026-10-10')).toBe(1)
  })
  it('status and total', () => {
    const c = { start_date: '2026-10-01', end_date: '2026-12-31', pay_type: 'شهري', amount: 250 }
    expect(contractStatus(c, '2026-09-29')).toBe('قادم')
    expect(contractStatus(c, '2026-11-01')).toBe('ساري')
    expect(contractStatus(c, '2027-01-01')).toBe('منتهي')
    expect(contractTotal(c)).toBe(750)
    expect(contractTotal({ ...c, pay_type: 'مبلغ مقطوع', amount: 600 })).toBe(600)
    expect(contractTotal({ ...c, pay_type: 'عمولة فقط', amount: 0 })).toBe(0)
  })
})

describe('contract pay as a company expense', () => {
  it('monthly salary: fixed monthly, last one in the last month, window = the month', () => {
    const e = contractExpenseRow({ name: 'سارة', title: 'مصممة', start_date: '2026-10-01', end_date: '2026-12-31', pay_type: 'شهري', amount: 250 })
    expect(e).toMatchObject({ amount: 250, recurring: true, recurring_end: '2026-12-01', date: '2026-10-01', pay_to: '2026-10-31', paid: false, category: 'رواتب وأجور' })
    expect(e.description).toContain('سارة — مصممة')
  })
  it('one month: not recurring; lump sum: one expense due by the end; commission only: none', () => {
    expect(contractExpenseRow({ name: 'x', start_date: '2026-10-01', end_date: '2026-10-31', pay_type: 'شهري', amount: 100 }).recurring).toBe(false)
    expect(contractExpenseRow({ name: 'x', start_date: '2026-10-01', end_date: '2026-12-31', pay_type: 'مبلغ مقطوع', amount: 600 })).toMatchObject({ amount: 600, recurring: false, due_date: '2026-12-31' })
    expect(contractExpenseRow({ name: 'x', start_date: '2026-10-01', end_date: '2026-12-31', pay_type: 'عمولة فقط' })).toBe(null)
  })
  it('validates', () => {
    expect(validateContract({ name: 'x', start_date: '2026-10-01', end_date: '2026-12-31', pay_type: 'عمولة فقط', commission_pct: 10 })).toEqual(['حساب الموظف في النظام (لحساب مبيعاته)'])
    expect(validateContract({ name: 'x', start_date: '2026-10-01', end_date: '2026-12-31', pay_type: 'شهري', amount: 0 })).toEqual(['المبلغ'])
  })
})

describe('commission', () => {
  const c = { user_id: 'u2', start_date: '2026-10-01', end_date: '2026-12-31', commission_pct: 10, commission_base: 'المحصّل', commission_recorded: 5 }
  const exhibitors = [
    { id: 'a', created_by: 'u2', created_at: '2026-10-05T10:00:00Z', contract: 200 },
    { id: 'b', created_by: 'u2', created_at: '2026-09-20T10:00:00Z', contract: 300 }, // before the contract
    { id: 'c', created_by: 'u9', created_at: '2026-10-05T10:00:00Z', contract: 400 }, // someone else
  ]
  const payments = [
    { exhibitor_id: 'a', amount: 150 },
    { exhibitor_id: 'a', amount: 50, status: 'بانتظار التأكيد' },
    { exhibitor_id: 'b', amount: 300 },
  ]
  it('on what their participants paid, minus what is already recorded', () => {
    expect(commissionOf(c, exhibitors, payments)).toMatchObject({ base: 150, earned: 15, recorded: 5, due: 10 })
  })
  it('or on the contracts they signed', () => {
    expect(commissionOf({ ...c, commission_base: 'قيمة العقود' }, exhibitors, payments)).toMatchObject({ base: 200, earned: 20 })
  })
})

describe('company plan', () => {
  it('months of the period', () => {
    expect(monthsBetween('2026-10-01', '2026-12-31')).toEqual(['2026-10', '2026-11', '2026-12'])
  })
  it('fixed expenses still to be added in the period', () => {
    const rows = upcomingFixed([{ id: 'r', recurring: true, recurring_every: 1, date: '2026-09-30', generated_until: '2026-09', amount: 150, description: 'إيجار' }], '2026-10-01', '2026-12-31')
    expect(rows.map((r) => r.date)).toEqual(['2026-10-30', '2026-11-30', '2026-12-30'])
    const q = upcomingFixed([{ id: 'q', recurring: true, recurring_every: 3, date: '2026-07-10', generated_until: '2026-07', amount: 90, recurring_end: '2026-10-31' }], '2026-10-01', '2027-03-31')
    expect(q.map((r) => r.date)).toEqual(['2026-10-10'])
  })
  it('team pay falling in the period', () => {
    const [t] = contractsInPeriod([{ id: 'k', start_date: '2026-09-01', end_date: '2026-11-30', pay_type: 'شهري', amount: 250 }], '2026-10-01', '2026-12-31')
    expect(t.fixed).toBe(500)
  })
  it('income from the exhibitions held in the period, every expense once, net', () => {
    const p = companyPlan(
      {
        exhibitions: [
          { id: 'n', date_from: '2026-11-10', status: 'قادم', booths: 10 },
          { id: 'old', date_from: '2026-08-10', status: 'منتهي' },
        ],
        exhibitors: [{ id: 'e1', exhibition_id: 'n', contract: 1000 }, { id: 'e2', exhibition_id: 'old', contract: 999 }],
        payments: [{ exhibitor_id: 'e1', amount: 400, date: '2026-10-02' }],
        expenses: [{ exhibition_id: 'n', amount: 300, paid: false }],
        staffExpenses: [
          { exhibition_id: 'n', amount: 20, status: 'معتمد', date: '2026-10-03' },
          { exhibition_id: null, amount: 15, status: 'معتمد', date: '2026-10-04' },
        ],
        companyExpenses: [{ id: 'r', date: '2026-10-01', amount: 250, recurring: true, recurring_end: '2026-12-01', generated_until: null, description: 'راتب' }],
        obligations: [{ amount: 60, status: 'قائم', due_date: '2026-11-15' }],
        contracts: [{ id: 'k', start_date: '2026-10-01', end_date: '2026-12-31', pay_type: 'شهري', amount: 250 }],
      },
      '2026-10-01',
      '2026-12-31',
    )
    expect(p.income).toMatchObject({ contracts: 1000, collected: 400, remaining: 600, expected: 1000 })
    expect(p.spend).toMatchObject({ exhibitions: 320, company: 250, fixed: 500, claims: 15, total: 1085 })
    expect(p.teamFixed).toBe(750)
    expect(p.net).toBe(-85)
    expect(p.obligationsTotal).toBe(60)
    expect(p.months.map((m) => [m.month, m.income, m.out])).toEqual([
      ['2026-10', 0, 265],
      ['2026-11', 1000, 570],
      ['2026-12', 0, 250],
    ])
  })
})
