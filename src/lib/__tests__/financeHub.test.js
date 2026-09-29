import { describe, expect, it } from 'vitest'
import { allExpenses, claimsOf, companyOverview, exhibitionFinancials, ledger } from '../finance.js'

const exhibition = { id: 'nz', booths: 10 }
const expenses = [
  { id: 'x1', exhibition_id: 'nz', item: 'شيك المساحة', amount: 300, paid: true, due_date: '2026-09-05' },
  { id: 'x2', exhibition_id: 'nz', item: 'طباعة', amount: 50, paid: false, due_date: '2026-10-01' },
]
const staffExpenses = [
  { id: 's1', exhibition_id: 'nz', description: 'بنرات', amount: 20, status: 'معتمد', date: '2026-09-10', user_id: 'u2' },
  { id: 's2', exhibition_id: 'nz', description: 'وقود', amount: 10, status: 'تم التعويض', date: '2026-09-11', reviewed_at: '2026-09-15T10:00:00Z', user_id: 'u2' },
  { id: 's3', exhibition_id: 'nz', description: 'ضيافة', amount: 7, status: 'بانتظار المراجعة', date: '2026-09-12', user_id: 'u2' },
  { id: 's4', exhibition_id: 'nz', description: 'مرفوض', amount: 99, status: 'مرفوض', date: '2026-09-12', user_id: 'u2' },
  { id: 's5', exhibition_id: null, description: 'إنترنت', amount: 15, status: 'معتمد', date: '2026-09-13', user_id: 'u2' },
]
const companyExpenses = [{ id: 'c1', date: '2026-09-01', description: 'إيجار', amount: 150, paid: true }]

describe('staff claims count in their exhibition', () => {
  it('only approved / reimbursed claims of that exhibition', () => {
    expect(claimsOf(staffExpenses, 'nz').map((x) => x.id)).toEqual(['s1', 's2'])
    expect(claimsOf(staffExpenses, null).map((x) => x.id)).toEqual(['s5'])
  })

  it('adds them to the exhibition costs and profit', () => {
    const f = exhibitionFinancials({ exhibition, expenses, staffExpenses, exhibitors: [{ id: 'e1', exhibition_id: 'nz', contract: 500 }] }, [])
    expect(f.claimsTotal).toBe(30)
    expect(f.expensesTotal).toBe(380)
    expect(f.expensesPaid).toBe(310)
    expect(f.netOnContracts).toBe(120)
  })

  it('are still counted once in the company totals', () => {
    const o = companyOverview({ expenses, staffExpenses, companyExpenses })
    expect(o.expensesAll).toBe(350 + 45 + 150)
  })
})

describe('all expenses in one list', () => {
  it('merges the three kinds, leaves rejected claims out, marks pending ones as not counted', () => {
    const rows = allExpenses({ expenses, companyExpenses, staffExpenses })
    expect(rows).toHaveLength(2 + 1 + 4)
    expect(rows.find((r) => r.key === 'claim:s3').counted).toBe(false)
    expect(rows.find((r) => r.key === 'claim:s2').paid).toBe(true)
    expect(rows.find((r) => r.key === 'company:c1')).toMatchObject({ kind: 'company', paid: true, exhibition_id: null })
    expect(rows.some((r) => r.key === 'claim:s4')).toBe(false)
  })
})

describe('ledger', () => {
  it('lists money actually moved, newest first, with a running balance', () => {
    const rows = ledger({
      payments: [
        { id: 'p1', exhibitor_id: 'e1', amount: 500, date: '2026-09-02' },
        { id: 'p2', exhibitor_id: 'e1', amount: 100, date: '2026-09-20', status: 'بانتظار التأكيد' },
        { id: 'p3', exhibitor_id: 'e1', amount: -40, date: '2026-09-21' },
      ],
      sponsors: [{ id: 'sp', name: 'راعٍ', amount: 200, status: 'مدفوع', created_at: '2026-09-03T08:00:00Z' }],
      expenses,
      companyExpenses,
      staffExpenses,
    })
    expect(rows.map((r) => [r.date, r.kind, r.amount])).toEqual([
      ['2026-09-21', 'refund', -40],
      ['2026-09-15', 'claim', -10],
      ['2026-09-05', 'exhibition', -300],
      ['2026-09-03', 'sponsor', 200],
      ['2026-09-02', 'payment', 500],
      ['2026-09-01', 'company', -150],
    ])
    expect(rows[0].balance).toBe(200)
    expect(rows.at(-1).balance).toBe(-150)
  })
})
