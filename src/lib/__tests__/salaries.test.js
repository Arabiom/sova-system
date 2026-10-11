import { beforeEach, describe, expect, it, vi } from 'vitest'

// A tiny in-memory stand-in for the database tables the contract code touches.
const db = { company_expenses: [], staff_contracts: [], company_settings: [{ id: 1, salary_pay_from: 23, salary_pay_to: 28 }], company_expense_payments: [] }
let next = 0
function query(t) {
  let rows = () => db[t]
  let op = null
  let patch = null
  const filters = []
  const match = (r) => filters.every(([k, v]) => r[k] === v)
  const run = () => {
    if (op === 'insert') {
      const added = patch.map((r) => ({ id: `n${++next}`, ...r }))
      db[t].push(...added)
      return added
    }
    const hit = rows().filter(match)
    if (op === 'update') hit.forEach((r) => Object.assign(r, patch))
    if (op === 'delete') db[t] = db[t].filter((r) => !hit.includes(r))
    return hit
  }
  const q = {
    select: () => q,
    eq: (k, v) => (filters.push([k, v]), q),
    insert: (r) => ((op = 'insert'), (patch = Array.isArray(r) ? r : [r]), q),
    update: (p) => ((op = 'update'), (patch = p), q),
    delete: () => ((op = 'delete'), q),
    maybeSingle: () => Promise.resolve({ data: run()[0] ?? null, error: null }),
    single: () => Promise.resolve({ data: run()[0], error: null }),
    then: (ok, ko) => Promise.resolve({ data: run(), error: null }).then(ok, ko),
  }
  rows = () => db[t]
  return q
}
vi.mock('../../api/client.js', () => ({
  supabase: { from: (t) => query(t) },
  unwrap: async (p) => {
    const { data, error } = await p
    if (error) throw error
    return data
  },
  fetchAll: async () => ({ data: [], error: null }),
}))

const { saveContract, deleteContract, contractOfExpense } = await import('../../api/contracts.js')
const { monthlyFixedTotal } = await import('../../api/companyExpenses.js')

const form = { name: 'أحمد', start_date: '2026-06-01', end_date: '2026-12-31', pay_type: 'شهري', amount: 300 }
const contract = () => db.staff_contracts[0]
const salaries = () => db.company_expenses

beforeEach(() => {
  db.company_expenses = []
  db.staff_contracts = []
  db.company_expense_payments = []
})

describe('salaries of team contracts', () => {
  it('a new monthly amount on a running salary starts from the next month not yet added', async () => {
    await saveContract(form)
    const first = salaries()[0]
    Object.assign(first, { paid: true, generated_until: '2026-09' }) // June paid, Jul–Sep added
    await saveContract({ ...form, amount: 350 }, { ...contract() })
    expect(first.amount).toBe(300)
    expect(first.recurring).toBe(false)
    const fresh = salaries()[1]
    expect(fresh).toMatchObject({ date: '2026-10-01', amount: 350, recurring: true, recurring_end: '2026-12-01', pay_from: '2026-10-23', pay_to: '2026-10-28', paid: false })
    expect(contract().expense_id).toBe(fresh.id)
    // months added from the earlier salary still belong to the contract
    expect(contractOfExpense([contract()], { id: 'old', series_id: first.id, category: 'رواتب وأجور', description: first.description })).toBe(contract())
  })

  it('refuses to move the start of a salary already paid (it would count months twice)', async () => {
    await saveContract(form)
    salaries()[0].paid = true
    await expect(saveContract({ ...form, start_date: '2026-07-01' }, { ...contract() })).rejects.toThrow(/عقداً جديداً/)
    expect(salaries()).toHaveLength(1)
  })

  it('moves the start freely before any salary is paid, without leaving the old one behind', async () => {
    await saveContract(form)
    await saveContract({ ...form, start_date: '2026-07-01' }, { ...contract() })
    expect(salaries()).toHaveLength(1)
    expect(salaries()[0].date).toBe('2026-07-01')
  })

  it('deleting a contract removes a salary not started yet, keeps one already paid', async () => {
    await saveContract(form)
    await deleteContract({ ...contract() })
    expect(salaries()).toHaveLength(0)
    await saveContract(form)
    salaries()[0].paid = true
    await deleteContract({ ...contract() })
    expect(salaries()).toHaveLength(1)
    expect(salaries()[0].recurring).toBe(false)
  })
})

describe('fixed monthly total', () => {
  it('counts only the fixed expenses running this month', () => {
    const rows = [
      { recurring: true, amount: 300, date: '2026-06-01', recurring_end: '2026-08-01' }, // ended
      { recurring: true, amount: 200, date: '2026-11-01' }, // not started
      { recurring: true, amount: 150, date: '2026-01-01' },
      { recurring: true, amount: 100, date: '2026-09-01', recurring_end: '2026-10-01' },
    ]
    expect(monthlyFixedTotal(rows, '2026-10-05')).toBe(250)
  })
})

describe('paying a salary in parts', async () => {
  const { payCompanyExpense, deleteExpensePayment, unpayCompanyExpense, paidSoFar } = await import('../../api/companyExpenses.js')
  const { companyOverview, ledger, monthlyFlow, allExpenses } = await import('../finance.js')
  const withPayments = () => db.company_expenses.map((x) => ({ ...x, payments: db.company_expense_payments.filter((p) => p.expense_id === x.id) }))
  const salary = () => withPayments().find((x) => x.id === 's1')

  beforeEach(() => {
    db.company_expenses = [{ id: 's1', date: '2026-10-01', category: 'رواتب وأجور', description: 'راتب عرابي (عقد)', amount: 325, paid: false, series_id: 'o', period: '2026-10' }]
  })

  it('stays open (late / due) until the parts reach the amount, then it is paid', async () => {
    await payCompanyExpense(salary(), { amount: 40, date: '2026-10-29', note: 'جزء' })
    expect(salary().paid).toBe(false)
    expect(paidSoFar(salary())).toBe(40)
    const [row] = allExpenses({ companyExpenses: [salary()] })
    expect(row).toMatchObject({ paid: false, paidSoFar: 40, remaining: 285 })
    // the 40 paid is money out, on the day it was paid
    expect(companyOverview({ companyExpenses: [salary()] })).toMatchObject({ expensesPaidAll: 40, payable: 285, cash: -40 })
    expect(monthlyFlow({ companyExpenses: [salary()] })[0]).toMatchObject({ month: '2026-10', company: 40 })
    expect(ledger({ companyExpenses: [salary()] }).map((r) => [r.date, r.amount])).toEqual([['2026-10-29', -40]])
    await payCompanyExpense(salary(), { amount: 285, date: '2026-11-05' })
    expect(salary().paid).toBe(true)
    expect(companyOverview({ companyExpenses: [salary()] })).toMatchObject({ expensesPaidAll: 325, payable: 0 })
    expect(ledger({ companyExpenses: [salary()] }).map((r) => [r.date, r.amount])).toEqual([['2026-11-05', -285], ['2026-10-29', -40]]) // newest first
  })

  it('a settlement closes it at what was paid; deleting a part reopens it; un-marking removes the parts', async () => {
    await payCompanyExpense(salary(), { amount: 300, settle: true })
    expect(salary()).toMatchObject({ paid: true, amount: 300 })
    db.company_expenses[0].amount = 325
    await deleteExpensePayment(salary(), salary().payments[0])
    expect(salary()).toMatchObject({ paid: false, payments: [] })
    await payCompanyExpense(salary(), { amount: 325 })
    await unpayCompanyExpense(salary())
    expect(salary()).toMatchObject({ paid: false, payments: [] })
  })

  it('an expense marked paid before parts existed still counts in full on its date', () => {
    const old = { id: 'r', date: '2026-09-01', amount: 150, paid: true }
    expect(companyOverview({ companyExpenses: [old] }).expensesPaidAll).toBe(150)
    expect(ledger({ companyExpenses: [old] }).map((r) => [r.date, r.amount])).toEqual([['2026-09-01', -150]])
  })
})

describe('salaries no contract owns', async () => {
  const { orphanSalaries } = await import('../../api/contracts.js')
  const c = { id: 'k', name: 'محمد عبدالباقي', title: 'محاسب', pay_type: 'شهري', amount: 80, expense_id: 'own' }
  const desc = 'راتب محمد عبدالباقي — محاسب (عقد)'
  it('flags a salary left repeating by an old contract, not the contract’s own months', () => {
    const own = { id: 'own', category: 'رواتب وأجور', description: desc, recurring: true, paid: false }
    const month = { id: 'm', category: 'رواتب وأجور', description: desc, series_id: 'own', paid: false }
    const left = { id: 'old', category: 'رواتب وأجور', description: desc, recurring: true, paid: false, date: '2026-11-01' }
    const leftPaid = { ...left, id: 'old2', paid: true }
    const rent = { id: 'r', category: 'إيجار مكتب', description: 'إيجار', recurring: true, paid: false }
    expect(contractOfExpense([c], left)).toBe(null)
    expect(orphanSalaries([c], [own, month, left, leftPaid, rent]).map((x) => x.id)).toEqual(['old'])
  })
})
