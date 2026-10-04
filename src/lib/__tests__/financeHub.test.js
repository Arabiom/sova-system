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

describe('fixed monthly company expenses', async () => {
  const { toCompanyExpenseRow, monthlyFixedTotal } = await import('../../api/companyExpenses.js')
  it('sends the monthly fields only when set or switched off', () => {
    const base = { description: 'إيجار', amount: 150, date: '2026-09-30' }
    expect('recurring' in toCompanyExpenseRow(base)).toBe(false)
    expect(toCompanyExpenseRow({ ...base, recurring: true, recurring_end: '2027-06' })).toMatchObject({ recurring: true, recurring_end: '2027-06-01' })
    expect(toCompanyExpenseRow({ ...base, recurring: false, wasRecurring: true })).toMatchObject({ recurring: false, recurring_end: null })
    expect(toCompanyExpenseRow({ ...base, recurring: true, recurring_every: 3 }).recurring_every).toBe(3)
    expect('recurring_every' in toCompanyExpenseRow({ ...base, recurring: true, recurring_every: 1 })).toBe(false)
  })
  it('requires how often when recurring', async () => {
    const { validateCompanyExpense } = await import('../../api/companyExpenses.js')
    const base = { description: 'تأمين', amount: 90, date: '2026-09-30', recurring: true }
    expect(validateCompanyExpense(base)).toContain('مدة التكرار (شهر أو 3 أو 6 أشهر)')
    expect(validateCompanyExpense({ ...base, recurring_every: 3 })).toEqual([])
  })
  it('adds up what runs every month', () => {
    expect(monthlyFixedTotal([{ recurring: true, amount: 150 }, { recurring: true, amount: '300' }, { amount: 20 }, { series_id: 'x', amount: 150 }])).toBe(450)
    expect(monthlyFixedTotal([{ recurring: true, amount: 90, recurring_every: 3 }, { recurring: true, amount: 600, recurring_every: 6 }])).toBe(130)
  })
  it('marks them in the unified list', () => {
    const rows = allExpenses({ companyExpenses: [{ id: 'a', date: '2026-09-30', description: 'إيجار', amount: 150, recurring: true }, { id: 'b', date: '2026-10-30', description: 'إيجار', amount: 150, paid: false, series_id: 'a', period: '2026-10' }] })
    expect(rows.map((r) => [r.recurring, r.series_id, r.period])).toEqual([
      [false, 'a', '2026-10'],
      [true, null, ''],
    ])
  })
})

describe('payment window of a company expense', async () => {
  const { paymentWindowState, toCompanyExpenseRow } = await import('../../api/companyExpenses.js')
  const x = { paid: false, pay_from: '2026-10-01', pay_to: '2026-10-05' }
  it('upcoming, open, late, paid', () => {
    expect(paymentWindowState(x, '2026-09-29')).toBe('upcoming')
    expect(paymentWindowState(x, '2026-10-01')).toBe('open')
    expect(paymentWindowState(x, '2026-10-05')).toBe('open')
    expect(paymentWindowState(x, '2026-10-06')).toBe('late')
    expect(paymentWindowState({ ...x, paid: true }, '2026-10-06')).toBe('')
    expect(paymentWindowState({ paid: false, due_date: '2026-10-05' }, '2026-10-03')).toBe('open')
    expect(paymentWindowState({ paid: false }, '2026-10-03')).toBe('')
  })
  it('the due date is the end of the window; the window is sent only when set', () => {
    const base = { description: 'إيجار', amount: 150, date: '2026-09-29' }
    expect(toCompanyExpenseRow({ ...base, paid: false, pay_from: '2026-10-01', pay_to: '2026-10-05' })).toMatchObject({ due_date: '2026-10-05', pay_from: '2026-10-01', pay_to: '2026-10-05' })
    expect('pay_from' in toCompanyExpenseRow(base)).toBe(false)
  })
})

describe('obligations', async () => {
  const { obligationState, toObligationRow, validateObligation } = await import('../../api/obligations.js')
  const ob = { id: 'o1', kind: 'شيك مؤجل', party: 'مطبعة', amount: 120, due_date: '2026-10-10', status: 'قائم' }
  it('late, due soon, open, paid', () => {
    expect(obligationState(ob, '2026-10-11')).toBe('late')
    expect(obligationState(ob, '2026-10-04')).toBe('soon')
    expect(obligationState(ob, '2026-09-20')).toBe('later')
    expect(obligationState({ ...ob, status: 'مدفوع' }, '2026-10-11')).toBe('')
  })
  it('needs a party, an amount and a date', () => {
    expect(validateObligation({})).toEqual(['لمن (الجهة أو المشارك)', 'المبلغ', 'تاريخ الاستحقاق'])
    expect(validateObligation({ exhibitor_id: 'e1', amount: 5, due_date: '2026-10-01' })).toEqual([])
    expect(toObligationRow({ party: ' x ', amount: '5', due_date: '2026-10-01' })).toMatchObject({ party: 'x', amount: 5, exhibitor_id: null })
  })
  it('are listed with the expenses but not counted as expenses; paid ones go to the ledger unless recorded as a refund', () => {
    const rows = allExpenses({ obligations: [ob] })
    expect(rows[0]).toMatchObject({ kind: 'obligation', counted: false, paid: false, amount: 120 })
    const paid = { ...ob, status: 'مدفوع', paid_at: '2026-10-09' }
    expect(ledger({ obligations: [paid] }).map((r) => [r.kind, r.amount])).toEqual([['obligation', -120]])
    expect(ledger({ obligations: [{ ...paid, refund_invoice: 'RFD-1' }] })).toEqual([])
  })
})

describe('is the plan sound?', async () => {
  const { planHealth, combineFinancials } = await import('../finance.js')
  const base = { capacity: 20, booked: 8, fullRevenue: 4000, sponsorship: 0, contract: 1600, expensesTotal: 1200, breakEven: 6 }
  it('good: signed contracts already cover the expenses', () => {
    expect(planHealth(base)).toMatchObject({ level: 'good', netNow: 400, netFull: 2800, margin: 70, toSell: 0, coveredNow: true })
  })
  it('watch: profitable at full sale but more sites must sell', () => {
    expect(planHealth({ ...base, booked: 3, contract: 600 })).toMatchObject({ level: 'watch', toSell: 3, netNow: -600 })
  })
  it('watch: covered but a thin margin', () => {
    expect(planHealth({ ...base, expensesTotal: 3700, contract: 3800, booked: 19, breakEven: 19 }).level).toBe('watch')
  })
  it('risk: even a full sale loses; missing: nothing to judge', () => {
    expect(planHealth({ ...base, expensesTotal: 5000 })).toMatchObject({ level: 'risk', netFull: -1000 })
    expect(planHealth({ ...base, expensesTotal: 0 }).level).toBe('missing')
    expect(planHealth({ ...base, capacity: 0 }).level).toBe('missing')
  })
  it('combines exhibitions (and company expenses on top)', () => {
    const c = combineFinancials([base, { ...base, fullRevenue: 2000, contract: 400, expensesTotal: 300, booked: 2 }], 500)
    expect(c).toMatchObject({ capacity: 40, booked: 10, fullRevenue: 6000, contract: 2000, expensesTotal: 2000, breakEven: 14 })
  })
})

describe('exhibitions still in planning', () => {
  it('leave the company totals until they become «قادم»', async () => {
    const { withoutPlanning, companyOverview } = await import('../finance.js')
    const data = {
      exhibitions: [{ id: 'a', status: 'قادم' }, { id: 'p', status: 'تخطيط' }],
      exhibitors: [{ id: 'e1', exhibition_id: 'a', contract: 100, paid: 50 }, { id: 'e2', exhibition_id: 'p', contract: 300, paid: 0 }],
      payments: [{ id: 'p1', exhibitor_id: 'e1', amount: 50 }, { id: 'p2', exhibitor_id: 'e2', amount: 20 }],
      expenses: [{ id: 'x1', exhibition_id: 'a', amount: 40, paid: true }, { id: 'x2', exhibition_id: 'p', amount: 500, paid: true }],
      sponsors: [],
      companyExpenses: [{ id: 'c1', amount: 10, paid: true }],
      staffExpenses: [{ id: 's1', exhibition_id: 'p', amount: 5, status: 'تم التعويض' }],
    }
    const live = withoutPlanning(data)
    const o = companyOverview(live)
    expect(o.contracts).toBe(100)
    expect(o.collected).toBe(50)
    expect(o.expensesAll).toBe(50)
    expect(live.planned).toEqual([{ exhibition: data.exhibitions[1], contracts: 300, expenses: 500 }])
    const later = withoutPlanning({ ...data, exhibitions: [{ id: 'a', status: 'قادم' }, { id: 'p', status: 'قادم' }] })
    expect(companyOverview(later).contracts).toBe(400)
    expect(later.planned).toEqual([])
  })
})

describe('cash agrees everywhere', () => {
  it('overview cash = ledger final balance = sum of monthly net', async () => {
    const { companyOverview, ledger, monthlyFlow } = await import('../finance.js')
    const data = {
      exhibitors: [{ id: 'e1', contract: 300, paid: 150 }],
      payments: [
        { id: 'p1', exhibitor_id: 'e1', amount: 200, date: '2026-08-02' },
        { id: 'p2', exhibitor_id: 'e1', amount: -50, date: '2026-09-03', type: 'إرجاع' },
        { id: 'p3', exhibitor_id: 'e1', amount: 40, date: '2026-09-04', status: 'بانتظار التأكيد' },
      ],
      sponsors: [{ id: 's1', amount: 100, status: 'مدفوع', created_at: '2026-08-10' }, { id: 's2', amount: 70, status: 'متفق عليه', created_at: '2026-08-11' }],
      expenses: [{ id: 'x1', amount: 80, paid: true, due_date: '2026-08-15' }, { id: 'x2', amount: 30, paid: false }],
      companyExpenses: [{ id: 'c1', amount: 25, paid: true, date: '2026-09-01' }],
      staffExpenses: [{ id: 'st1', amount: 10, status: 'تم التعويض', date: '2026-09-02' }],
      obligations: [
        { id: 'o1', amount: 60, status: 'مدفوع', paid_at: '2026-09-05', kind: 'شيك مؤجل' },
        { id: 'o2', amount: 50, status: 'مدفوع', paid_at: '2026-09-03', refund_invoice: 'INV-9', kind: 'إرجاع مبلغ لمشارك' },
        { id: 'o3', amount: 15, status: 'قائم', due_date: '2026-11-01' },
      ],
    }
    const o = companyOverview(data)
    const end = ledger(data)[0].balance
    const flowNet = monthlyFlow(data).reduce((t, m) => t + m.net, 0)
    expect(o.cash).toBe(75)
    expect(end).toBe(75)
    expect(Math.round(flowNet * 1000) / 1000).toBe(75)
    expect(o.obligationsOpen).toBe(15)
  })
})
