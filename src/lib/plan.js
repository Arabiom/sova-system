// Company plan for a chosen period: what should come in (exhibitions held in the period) and
// go out (their expenses, company expenses, team contracts, fixed expenses still to be added,
// staff claims, obligations due), month by month. Amounts before VAT.

import { addMonths, commissionOf, contractTotal, isOpen, monthsOf, PAY_COMMISSION, PAY_LUMP } from '../api/contracts.js'
import { claimsOf, exhibitionFinancials, isConfirmed } from './finance.js'
import { num } from './format.js'

const day = (v) => String(v || '').slice(0, 10)
const month = (v) => String(v || '').slice(0, 7)
const baisa = (v) => Math.round(num(v) * 1000) / 1000
const inRange = (d, from, to) => Boolean(d) && d >= from && d <= to

/** The months (YYYY-MM) from `from` to `to`. */
export function monthsBetween(from, to) {
  const out = []
  let m = month(from)
  const last = month(to)
  while (m && m <= last && out.length < 60) {
    out.push(m)
    m = addMonths(`${m}-01`, 1).slice(0, 7)
  }
  return out
}

/**
 * Fixed company expenses due in the period that the system has not added yet (they are added
 * when their month comes): for each recurring expense, the next dates after the last added.
 */
export function upcomingFixed(companyExpenses, from, to) {
  const out = []
  for (const m of companyExpenses.filter((x) => x.recurring)) {
    const every = Number(m.recurring_every) || 1
    const stop = m.recurring_end ? day(m.recurring_end) : ''
    let next = m.generated_until ? addMonths(`${m.generated_until}-01`, every) : addMonths(`${month(m.date)}-01`, every)
    const dayOf = +day(m.date).slice(8, 10) || 1
    for (let i = 0; i < 120 && next <= to; i++) {
      if (stop && next > stop) break
      const [y, mm] = next.split('-').map(Number)
      const last = new Date(Date.UTC(y, mm, 0)).getUTCDate()
      const date = `${next.slice(0, 8)}${String(Math.min(dayOf, last)).padStart(2, '0')}`
      if (inRange(date, from, to)) out.push({ date, amount: num(m.amount), description: m.description, category: m.category, source: m })
      next = addMonths(next, every)
    }
  }
  return out
}

/** Pay of each contract falling in the period (salary months / lump sum) and its commission. */
export function contractsInPeriod(contracts, from, to, { exhibitors = [], payments = [] } = {}) {
  return contracts
    .filter((c) => c.start_date <= to && (isOpen(c) || c.end_date >= from))
    .map((c) => {
      let fixed = 0
      if (c.pay_type === PAY_LUMP) fixed = inRange(c.start_date, from, to) ? num(c.amount) : 0
      else if (c.pay_type !== PAY_COMMISSION) {
        const n = isOpen(c) ? 240 : monthsOf(c.start_date, c.end_date)
        for (let i = 0; i < n; i++) {
          const d = addMonths(c.start_date, i)
          if (d > to) break
          if (inRange(d, from, to)) fixed += num(c.amount)
        }
      }
      return { contract: c, fixed: baisa(fixed), total: contractTotal(c), commission: commissionOf(c, exhibitors, payments) }
    })
}

/**
 * The whole plan. `data` is the finance centre's data (+ contracts); `from`/`to` ISO dates.
 * Income is what the exhibitions held in the period bring (their contracts; "potential" if
 * every site sells), sponsorships included. Expenses count each thing once:
 *  – exhibition expenses and approved claims of those exhibitions,
 *  – company expenses dated in the period (salaries of contracts included — they are
 *    company expenses), plus fixed ones not added yet,
 *  – approved claims not tied to an exhibition, dated in the period.
 * Obligations due in the period and commission are shown apart (money to pay, not planned cost).
 */
export function companyPlan(data, from, to, defaults = []) {
  const { exhibitions = [], exhibitors = [], payments = [], sites = [], expenses = [], sponsors = [], companyExpenses = [], staffExpenses = [], obligations = [], contracts = [] } = data
  const months = monthsBetween(from, to)
  const row = () => ({ income: 0, potential: 0, exhibitions: 0, company: 0, fixed: 0, claims: 0 })
  const byMonth = Object.fromEntries(months.map((m) => [m, row()]))
  const add = (m, key, v) => byMonth[m] && (byMonth[m][key] += num(v))

  // Exhibitions held in the period (by their opening date).
  const shows = exhibitions
    .filter((ex) => ex.status !== 'ملغى' && inRange(day(ex.date_from), from, to))
    .sort((a, b) => day(a.date_from).localeCompare(day(b.date_from)))
    .map((ex) => {
      const f = exhibitionFinancials(
        {
          exhibition: ex,
          sites: sites.filter((s) => s.exhibition_id === ex.id),
          exhibitors,
          payments,
          expenses: expenses.filter((x) => x.exhibition_id === ex.id),
          sponsors: sponsors.filter((s) => s.exhibition_id === ex.id),
          staffExpenses,
        },
        defaults,
      )
      const m = month(ex.date_from)
      add(m, 'income', f.contract + f.sponsorship)
      add(m, 'potential', Math.max(f.fullRevenue, f.contract) + f.sponsorship)
      add(m, 'exhibitions', f.expensesTotal)
      return { exhibition: ex, f }
    })

  const company = companyExpenses.filter((x) => inRange(day(x.date), from, to))
  company.forEach((x) => add(month(x.date), 'company', x.amount))
  const fixed = upcomingFixed(companyExpenses, from, to)
  fixed.forEach((x) => add(month(x.date), 'fixed', x.amount))
  const claims = claimsOf(staffExpenses, null).filter((x) => inRange(day(x.date), from, to))
  claims.forEach((x) => add(month(x.date), 'claims', x.amount))

  const sum = (list, key) => baisa(list.reduce((t, x) => t + num(x[key]), 0))
  const income = {
    contracts: sum(shows.map((s) => ({ v: s.f.contract })), 'v'),
    sponsorship: sum(shows.map((s) => ({ v: s.f.sponsorship })), 'v'),
    collected: sum(shows.map((s) => ({ v: s.f.collected })), 'v'),
    potential: sum(shows.map((s) => ({ v: Math.max(s.f.fullRevenue, s.f.contract) + s.f.sponsorship })), 'v'),
  }
  income.expected = baisa(income.contracts + income.sponsorship)
  income.remaining = baisa(Math.max(0, income.contracts - income.collected))

  const spend = {
    exhibitions: sum(shows.map((s) => ({ v: s.f.expensesTotal })), 'v'),
    company: sum(company, 'amount'),
    fixed: sum(fixed, 'amount'),
    claims: sum(claims, 'amount'),
  }
  spend.total = baisa(spend.exhibitions + spend.company + spend.fixed + spend.claims)

  const team = contractsInPeriod(contracts, from, to, { exhibitors, payments })
  const teamFixed = sum(team.map((t) => ({ v: t.fixed })), 'v')
  const commissionDue = sum(team.map((t) => ({ v: t.commission.due })), 'v')
  const obligationsDue = obligations.filter((o) => o.status !== 'مدفوع' && inRange(day(o.due_date), from, to))

  const table = months.map((m) => {
    const r = byMonth[m]
    const out = r.exhibitions + r.company + r.fixed + r.claims
    return { month: m, income: baisa(r.income), potential: baisa(r.potential), out: baisa(out), net: baisa(r.income - out) }
  })

  return {
    from,
    to,
    months: table,
    shows,
    income,
    spend,
    team,
    teamFixed,
    commissionDue,
    obligations: obligationsDue,
    obligationsTotal: sum(obligationsDue, 'amount'),
    net: baisa(income.expected - spend.total),
    netPotential: baisa(income.potential - spend.total),
    // everything still to come in / go out in the period, including obligations and commission
    netAfterAll: baisa(income.expected - spend.total - sum(obligationsDue, 'amount') - commissionDue),
    confirmedIncome: baisa(payments.filter(isConfirmed).filter((p) => inRange(day(p.date || p.created_at), from, to)).reduce((t, p) => t + num(p.amount), 0)),
  }
}
