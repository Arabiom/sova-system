import { describe, expect, it } from 'vitest'
import { commitments, commitmentState } from '../finance.js'

const today = '2026-10-18'
// Arabi's salary: September paid 40 of 325 (late), October in its window 23–28, ends December.
const companyExpenses = [
  { id: 'ar', date: '2026-09-01', recurring: true, description: 'راتب عرابي', category: 'رواتب وأجور', amount: 325, paid: false, pay_from: '2026-09-23', pay_to: '2026-09-28', due_date: '2026-09-28', recurring_end: '2026-12-01', generated_until: '2026-10', payments: [{ id: 'p', amount: 40, date: '2026-09-28' }] },
  { id: 'ar10', series_id: 'ar', period: '2026-10', date: '2026-10-01', description: 'راتب عرابي', amount: 325, paid: false, pay_from: '2026-10-23', pay_to: '2026-10-28', due_date: '2026-10-28', payments: [] },
  { id: 'rent', date: '2026-09-01', recurring: true, description: 'إيجار', amount: 40, paid: true, pay_to: '2026-09-25', generated_until: '2026-10', payments: [] },
  { id: 'rent10', series_id: 'rent', period: '2026-10', date: '2026-10-01', description: 'إيجار', amount: 40, paid: false, pay_to: '2026-10-25', payments: [] },
  { id: 'old', date: '2026-01-01', recurring: true, description: 'منتهٍ', amount: 99, paid: true, recurring_end: '2026-06-01', generated_until: '2026-06', payments: [] },
]
const expenses = [
  { id: 'e1', item: 'شيك المعرض', amount: 840, paid: false, due_date: '2026-12-20', exhibition_id: 'nz' },
  { id: 'e2', item: 'بلا موعد', amount: 10, paid: false, exhibition_id: 'nz' },
  { id: 'e3', item: 'مدفوع', amount: 50, paid: true, due_date: '2026-09-09', exhibition_id: 'nz' },
]
const staffExpenses = [
  { id: 'c1', status: 'معتمد', amount: 2, description: 'مطالبة', date: '2026-10-11' },
  { id: 'c2', status: 'بانتظار المراجعة', amount: 7, description: 'لم تُعتمد', date: '2026-10-12' },
]
const obligations = [{ id: 'o1', status: 'قائم', amount: 100, due_date: '2026-10-01', party: 'مورد', kind: 'شيك مؤجل' }]

describe('commitments', () => {
  const r = commitments({ companyExpenses, expenses, staffExpenses, obligations }, today)
  const by = (label) => r.items.filter((x) => x.label.includes(label))

  it('late: what was due before today (the rest of a part-paid salary, an overdue cheque)', () => {
    expect(r.items.filter((x) => x.state === 'late').map((x) => [x.label, x.amount])).toEqual([
      ['راتب عرابي', 285], // oldest first
      ['مورد', 100],
    ])
    expect(r.late).toBe(385)
  })

  it('this month: due now plus what falls due later this month', () => {
    expect(by('مطالبة')[0].state).toBe('now') // an approved claim is owed already
    expect(by('إيجار').filter((x) => !x.projected)[0]).toMatchObject({ state: 'month', due: '2026-10-25', amount: 40 })
    expect(r.thisMonth).toBe(2 + 40 + 325)
  })

  it('projects the fixed months not added yet until each one ends, on its own pay days', () => {
    const arabi = by('راتب عرابي').filter((x) => x.projected)
    expect(arabi.map((x) => [x.period, x.from, x.due, x.amount])).toEqual([
      ['2026-11', '2026-11-23', '2026-11-28', 325],
      ['2026-12', '2026-12-23', '2026-12-28', 325],
    ])
    // rent has no end: the next 3 months
    expect(by('إيجار').filter((x) => x.projected).map((x) => x.due)).toEqual(['2026-11-25', '2026-12-25', '2027-01-25'])
    expect(by('منتهٍ')).toEqual([])
  })

  it('leaves out what is paid and claims still under review; keeps undated ones apart', () => {
    expect(by('مدفوع')).toEqual([])
    expect(by('لم تُعتمد')).toEqual([])
    expect(r.undated).toBe(10)
  })

  it('month by month adds up to the total', () => {
    expect(r.months.map((m) => [m.month, m.total])).toEqual([
      ['2026-10', 367],
      ['2026-11', 365],
      ['2026-12', 1205],
      ['2027-01', 40],
    ])
    expect(r.total).toBe(r.late + r.undated + r.months.reduce((t, m) => t + m.total, 0))
  })

  it('states', () => {
    expect(commitmentState({ due: '2026-10-17' }, today)).toBe('late')
    expect(commitmentState({ from: '2026-10-15', due: '2026-10-28' }, today)).toBe('now')
    expect(commitmentState({ due: '2026-10-30' }, today)).toBe('month')
    expect(commitmentState({ due: '2026-11-02' }, today)).toBe('later')
    expect(commitmentState({}, today)).toBe('none')
  })
})
