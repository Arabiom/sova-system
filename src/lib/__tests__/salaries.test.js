import { beforeEach, describe, expect, it, vi } from 'vitest'

// A tiny in-memory stand-in for the database tables the contract code touches.
const db = { company_expenses: [], staff_contracts: [] }
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
    expect(fresh).toMatchObject({ date: '2026-10-01', amount: 350, recurring: true, recurring_end: '2026-12-01', pay_to: '2026-10-31', paid: false })
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
