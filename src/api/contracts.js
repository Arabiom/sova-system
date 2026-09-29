// Fixed-term contracts with the team (migration 023). A contract's pay is kept as a company
// expense so it shows everywhere money is counted: a monthly salary is a fixed monthly expense
// ending with the contract; a lump sum is one expense due by the contract's end.

import { num } from '../lib/format.js'
import { supabase, unwrap } from './client.js'

export const PAY_MONTHLY = 'شهري'
export const PAY_LUMP = 'مبلغ مقطوع'
export const PAY_COMMISSION = 'عمولة فقط'
export const PAY_TYPES = [PAY_MONTHLY, PAY_LUMP, PAY_COMMISSION]
export const COMMISSION_BASES = ['المحصّل', 'قيمة العقود']
export const CONTRACT_TITLES = ['مصمم', 'مسوق', 'منسق معارض', 'مصور', 'محاسب', 'مندوب مبيعات', 'مساعد إداري']
export const DURATIONS = [1, 3, 6] // months; or an end date chosen by hand, or open-ended
/** Open-ended contract (permanent staff): no end date (migration 024). */
export const isOpen = (c) => !c?.end_date
export const SALARY_CATEGORY = 'رواتب وأجور'

const table = () => supabase.from('staff_contracts')
const expenses = () => supabase.from('company_expenses')

/** All contracts, newest start first; [] before migration 023 is run. */
export async function listContracts() {
  const { data, error } = await table().select('*').order('start_date', { ascending: false })
  if (error) {
    if (['42P01', 'PGRST205'].includes(error.code)) return []
    return unwrap(Promise.resolve({ data, error }))
  }
  return data
}

// ── Dates (ISO yyyy-mm-dd, whole days, no time zones) ─────────────────────────
const parts = (iso) => String(iso).slice(0, 10).split('-').map(Number)
const iso = (y, m, d) => new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10)
const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate()

/** Same day `n` months later (clamped to the month's end). */
export function addMonths(date, n) {
  const [y, m, d] = parts(date)
  const total = y * 12 + (m - 1) + n
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  return iso(ny, nm, Math.min(d, lastDay(ny, nm)))
}

export const addDays = (date, n) => {
  const [y, m, d] = parts(date)
  return iso(y, m, d + n)
}

/** Last day of a contract of `months` months starting on `start` (1 Oct + 3 → 31 Dec). */
export const endAfter = (start, months) => addDays(addMonths(start, months), -1)

/** How many monthly payments a contract has: whole months, a part month counting as one. */
export function monthsOf(start, end) {
  const [y1, m1, d1] = parts(start)
  const [y2, m2, d2] = parts(addDays(end, 1))
  const n = (y2 - y1) * 12 + (m2 - m1) + (d2 > d1 ? 1 : 0)
  return Math.max(1, n)
}

/** Fixed pay over the whole contract: months × salary, or the lump sum (commission apart).
 *  An open-ended salary has no total (null). */
export const contractTotal = (c) =>
  c.pay_type === PAY_COMMISSION ? 0 : c.pay_type === PAY_LUMP ? num(c.amount) : isOpen(c) ? null : num(c.amount) * monthsOf(c.start_date, c.end_date)

const day = (v) => String(v || '').slice(0, 10)
const baisa = (v) => Math.round(num(v) * 1000) / 1000

/**
 * Commission of a contract: commission_pct % of what the participants the employee registered
 * during the contract (exhibitors.created_by = user_id) have paid (confirmed payments, refunds
 * deducted) or signed for (their contract values). Returns the sales it is worked out on, the
 * commission earned, what is already recorded as an expense, and what is still to record.
 */
export function commissionOf(c, exhibitors = [], payments = []) {
  const pct = num(c.commission_pct)
  if (!pct || !c.user_id) return { participants: [], base: 0, earned: 0, recorded: num(c.commission_recorded), due: 0 }
  const participants = exhibitors.filter((e) => e.created_by === c.user_id && day(e.created_at) >= c.start_date && (isOpen(c) || day(e.created_at) <= c.end_date))
  const ids = new Set(participants.map((e) => e.id))
  const base =
    c.commission_base === 'قيمة العقود'
      ? participants.reduce((t, e) => t + num(e.contract), 0)
      : payments.filter((p) => ids.has(p.exhibitor_id) && p.status !== 'بانتظار التأكيد').reduce((t, p) => t + num(p.amount), 0)
  const earned = baisa((Math.max(0, base) * pct) / 100)
  const recorded = num(c.commission_recorded)
  return { participants, base: baisa(base), earned, recorded, due: baisa(Math.max(0, earned - recorded)) }
}

/** Enter the commission not yet recorded as a company expense (due now), once. */
export async function recordCommission(c, amount, today) {
  const value = baisa(amount)
  if (!(value > 0)) return
  await unwrap(
    expenses().insert({
      date: today,
      category: SALARY_CATEGORY,
      description: `عمولة ${[c.name, c.title].filter(Boolean).join(' — ')} (عقد)`,
      amount: value,
      paid: false,
      due_date: today,
      notes: 'عمولة من عقود الفريق',
    }),
  )
  await unwrap(table().update({ commission_recorded: baisa(num(c.commission_recorded) + value) }).eq('id', c.id))
}

/** Where a contract stands today. */
export function contractStatus(c, today) {
  if (today < c.start_date) return 'قادم'
  if (!isOpen(c) && today > c.end_date) return 'منتهي'
  return 'ساري'
}

export function validateContract(form) {
  const errors = []
  if (!form.name?.trim()) errors.push('الاسم')
  if (!form.start_date) errors.push('بداية العقد')
  if (!form.end_date && !form.open) errors.push('نهاية العقد')
  if (form.open && form.pay_type === PAY_LUMP) errors.push('المبلغ المقطوع يحتاج تاريخ نهاية للعقد')
  if (form.start_date && form.end_date && form.end_date < form.start_date) errors.push('نهاية العقد قبل بدايته')
  if (form.pay_type === PAY_COMMISSION) {
    if (!(num(form.commission_pct) > 0)) errors.push('نسبة العمولة')
  } else if (!(num(form.amount) > 0)) errors.push('المبلغ')
  if (num(form.commission_pct) > 100) errors.push('نسبة العمولة (حتى 100%)')
  if (num(form.commission_pct) > 0 && !form.user_id) errors.push('حساب الموظف في النظام (لحساب مبيعاته)')
  return errors
}

const label = (c) => [c.name?.trim(), c.title?.trim()].filter(Boolean).join(' — ')

/** The company expense that carries a contract's fixed pay (none for commission only). */
export function contractExpenseRow(c) {
  if (c.pay_type === PAY_COMMISSION) return null
  const monthEnd = (d) => {
    const [y, m] = parts(d)
    return iso(y, m, lastDay(y, m))
  }
  if (c.pay_type === PAY_LUMP) {
    if (isOpen(c)) return null
    return {
      date: c.start_date,
      category: SALARY_CATEGORY,
      description: `أتعاب ${label(c)} (عقد مبلغ مقطوع)`,
      amount: num(c.amount),
      paid: false,
      due_date: c.end_date,
      pay_from: c.start_date,
      pay_to: c.end_date,
      recurring: false,
      recurring_end: null,
      notes: 'من عقود الفريق',
    }
  }
  const open = isOpen(c)
  const n = open ? 0 : monthsOf(c.start_date, c.end_date)
  const [ly, lm] = open ? [0, 0] : parts(addMonths(c.start_date, n - 1))
  return {
    date: c.start_date,
    category: SALARY_CATEGORY,
    description: `راتب ${label(c)} (عقد)`,
    amount: num(c.amount),
    paid: false,
    due_date: monthEnd(c.start_date),
    pay_from: c.start_date,
    pay_to: monthEnd(c.start_date),
    // one salary a month, the last one in the contract's last month (open-ended: no last one)
    recurring: open || n > 1,
    recurring_end: !open && n > 1 ? iso(ly, lm, 1) : null,
    notes: 'من عقود الفريق',
  }
}

/** The contract a company expense belongs to (its salary / lump sum, or a month added from it). */
export const contractOfExpense = (contracts, x) =>
  x ? contracts.find((c) => c.expense_id && (c.expense_id === x.id || c.expense_id === x.series_id)) || null : null

/**
 * Salaries entered by hand for someone who also has a contract — counted twice. A company
 * expense in «رواتب وأجور», not the contract's own, whose description has the person's name,
 * dated while the contract runs (or a fixed monthly one still running).
 */
export function duplicateSalaries(contracts, companyExpenses) {
  const out = []
  for (const c of contracts) {
    const name = c.name?.trim()
    if (!name || name.length < 2 || c.pay_type === PAY_COMMISSION) continue
    const hits = companyExpenses.filter(
      (x) =>
        x.category === SALARY_CATEGORY &&
        !contractOfExpense([c], x) &&
        !String(x.notes || '').includes('عقود الفريق') &&
        String(x.description || '').includes(name) &&
        (x.recurring || (day(x.date) >= c.start_date && (isOpen(c) || day(x.date) <= c.end_date))),
    )
    if (hits.length) out.push({ contract: c, expenses: hits })
  }
  return out
}

export function toContractRow(form) {
  return {
    name: form.name.trim(),
    title: form.title?.trim() || '',
    start_date: form.start_date,
    end_date: form.open ? null : form.end_date,
    pay_type: PAY_TYPES.includes(form.pay_type) ? form.pay_type : PAY_MONTHLY,
    amount: form.pay_type === PAY_COMMISSION ? 0 : num(form.amount),
    commission_pct: num(form.commission_pct),
    commission_base: COMMISSION_BASES.includes(form.commission_base) ? form.commission_base : COMMISSION_BASES[0],
    user_id: form.user_id || null,
    notes: form.notes?.trim() || '',
  }
}

/** Stop a contract's pay: a monthly salary stops recurring (months already added stay);
 *  an unpaid lump sum is removed. */
async function releaseExpense(contract) {
  if (!contract?.expense_id || contract.pay_type === PAY_COMMISSION) return
  if (contract.pay_type === PAY_LUMP) {
    await unwrap(expenses().delete().eq('id', contract.expense_id).eq('paid', false))
  } else {
    await unwrap(expenses().update({ recurring: false }).eq('id', contract.expense_id))
  }
}

/**
 * Save a contract and its pay. A new contract creates its expense; an edit updates it —
 * or, when the start date or the way of paying changes, stops the old one and starts anew.
 */
export async function saveContract(form, previous) {
  const row = toContractRow(form)
  const expense = contractExpenseRow(row)
  const create = async () => (expense ? (await unwrap(expenses().insert(expense).select('id').single())).id : null)
  if (!previous) return unwrap(table().insert({ ...row, expense_id: await create() }))
  let expense_id = previous.expense_id
  const restart = !expense_id || !expense || previous.pay_type !== row.pay_type || previous.start_date !== row.start_date
  if (restart) {
    await releaseExpense(previous)
    expense_id = await create()
  } else {
    const { date: _date, paid: _paid, pay_from: _pf, ...changes } = expense // keep what was paid
    await unwrap(expenses().update(changes).eq('id', expense_id))
  }
  return unwrap(table().update({ ...row, expense_id }).eq('id', previous.id))
}

/** Delete a contract: its future pay stops; salaries already added stay in the books. */
export async function deleteContract(contract) {
  await releaseExpense(contract)
  return unwrap(table().delete().eq('id', contract.id))
}
