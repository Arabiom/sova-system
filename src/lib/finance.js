import { PAYMENT_PENDING, VAT_RATE } from './constants.js'
import { num, percent } from './format.js'

export const sumBy = (rows, key) => rows.reduce((total, row) => total + num(row[key]), 0)

/** A payment counts as collected unless it is still waiting for finance to confirm it. */
export const isConfirmed = (payment) => payment.status !== PAYMENT_PENDING

/** Round to the baisa (3 decimals) so sums of prices never show floating-point noise. */
const baisa = (value) => Math.round(num(value) * 1000) / 1000

/** Staff claims that count as company money spent (approved, or already paid back). */
export const APPROVED_CLAIMS = ['معتمد', 'تم التعويض']
const CLAIM_REIMBURSED = 'تم التعويض'

/** Approved staff claims of one exhibition (or, with no id, those not tied to any exhibition). */
export const claimsOf = (staffExpenses, exhibitionId) =>
  staffExpenses.filter((x) => APPROVED_CLAIMS.includes(x.status) && (exhibitionId ? x.exhibition_id === exhibitionId : !x.exhibition_id))

/** Name of the discount line kept with a participant's extras (a negative price). */
export const DISCOUNT_ITEM = 'خصم'

/**
 * Charges on a registration: booth package + extras (+ any other extras) − discount, VAT 5% on top.
 * `extras` is [{ name, price, qty }]; a discount is an item with a negative price.
 */
export function registrationTotals({ boothPrice = 0, extras = [], otherAmount = 0 }) {
  const line = (x) => num(x.price) * Math.max(0, num(x.qty))
  const extrasTotal = baisa(extras.filter((x) => num(x.price) >= 0).reduce((t, x) => t + line(x), 0) + num(otherAmount))
  const discount = baisa(-extras.filter((x) => num(x.price) < 0).reduce((t, x) => t + line(x), 0))
  const subtotal = baisa(Math.max(0, num(boothPrice) + extrasTotal - discount))
  const vat = baisa(vatOf(subtotal))
  return { boothPrice: num(boothPrice), extrasTotal, discount, subtotal, vat, total: baisa(subtotal + vat) }
}

// VAT applies only while the company is registered for it (company settings, migration 014).
let vatRate = VAT_RATE

/** Turn VAT on (registered: 5%) or off (not registered: no VAT anywhere). */
export function setVatEnabled(on) {
  vatRate = on ? VAT_RATE : 0
}
export const vatEnabled = () => vatRate > 0

export const vatOf = (amount) => num(amount) * vatRate
export const withVat = (amount) => num(amount) * (1 + vatRate)
export const withoutVat = (gross) => Math.round((num(gross) / (1 + vatRate)) * 1000) / 1000

/** What an exhibitor still owes on their contract. */
export const balanceOf = (exhibitor) => num(exhibitor.contract) - num(exhibitor.paid)

/** Booth capacity of an exhibition: the total entered on the exhibition, else the sum of its tiers. */
export function boothCapacity(exhibition) {
  return num(exhibition.booths) || planningTiers(exhibition).reduce((t, x) => t + x.count, 0)
}

/** Booked / total sites of an exhibition: from its site map when it has one, else exhibitors vs. planned tiers. */
export function occupancyOf(exhibition, sites, exhibitors) {
  const own = sites.filter((x) => x.exhibition_id === exhibition.id)
  if (own.length) return { booked: own.filter((x) => x.exhibitor_id).length, capacity: own.length }
  return { booked: exhibitors.filter((e) => e.exhibition_id === exhibition.id).length, capacity: boothCapacity(exhibition) }
}

/** Headline figures for a set of exhibitors (contract value vs. collected). */
export function summarize(exhibitors) {
  const contract = sumBy(exhibitors, 'contract')
  const paid = sumBy(exhibitors, 'paid')
  const vat = vatOf(paid)
  return {
    count: exhibitors.length,
    contract,
    paid,
    remaining: contract - paid,
    vat,
    paidWithVat: paid + vat,
    collectionRate: percent(paid, contract),
  }
}

/** Per-exhibition figures: booked booths, contract value and what the payment log says was collected. */
export function exhibitionStats(exhibition, exhibitors, payments) {
  const own = exhibitors.filter((e) => e.exhibition_id === exhibition.id)
  const ownIds = new Set(own.map((e) => e.id))
  const collected = payments.filter((p) => ownIds.has(p.exhibitor_id) && isConfirmed(p)).reduce((t, p) => t + num(p.amount), 0)
  const contract = sumBy(own, 'contract')
  return {
    booked: own.length,
    capacity: boothCapacity(exhibition),
    contract,
    collected,
    paidOnRecord: sumBy(own, 'paid'),
    remaining: contract - collected,
  }
}

/** Group rows by a key and add up a numeric field (or count rows when no field is given). */
export function groupTotals(rows, keyOf, valueOf = () => 1) {
  const totals = {}
  for (const row of rows) {
    const key = keyOf(row)
    totals[key] = (totals[key] || 0) + valueOf(row)
  }
  return Object.entries(totals).sort((a, b) => b[1] - a[1])
}

/**
 * Planning tiers of an exhibition: the `tiers` list (any number of tiers), else the three
 * legacy tier columns. Legacy names/prices missing on a row fall back to `defaults`.
 */
export function planningTiers(exhibition, defaults = []) {
  if (Array.isArray(exhibition.tiers) && exhibition.tiers.length) {
    return exhibition.tiers.map((t) => ({ name: t.name || '', price: num(t.price), count: num(t.count) }))
  }
  return [1, 2, 3].map((i, idx) => ({
    name: exhibition[`booth_tier${i}_name`] || defaults[idx]?.name || '',
    price: exhibition[`booth_tier${i}_price`] || defaults[idx]?.price || 0,
    count: num(exhibition[`booth_tier${i}_count`]),
  }))
}

/** Tier rows of an exhibition (see planningTiers). */
export const tiersOf = (exhibition, defaults) => planningTiers(exhibition, defaults)

/**
 * Invoice / contract reference: PREFIX-YYMMDD-XXXX (date + 4 random characters).
 * The old PREFIX-<last 6 digits of the clock> format repeated every ~17 minutes.
 */
export function newReference(prefix, now = new Date()) {
  const d = now.toISOString().slice(2, 10).replace(/-/g, '')
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase().padEnd(4, '0')
  return `${prefix}-${d}-${rand}`
}

/**
 * Everything the exhibition file shows, from the exhibition and its related rows.
 * When the site map exists it is the source of truth for capacity and full revenue;
 * otherwise the three planning tiers stored on the exhibition are used.
 */
export function exhibitionFinancials({ exhibition, sites = [], exhibitors = [], payments = [], expenses = [], sponsors = [], staffExpenses = [] }, defaults) {
  const own = exhibitors.filter((e) => e.exhibition_id === exhibition.id)
  const ownIds = new Set(own.map((e) => e.id))
  const hasSites = sites.length > 0

  const planTiers = hasSites ? [] : tiersOf(exhibition, defaults)
  const tierCount = planTiers.reduce((t, x) => t + x.count, 0)
  const capacity = hasSites ? sites.length : num(exhibition.booths) || tierCount
  const fullRevenue = hasSites ? sumBy(sites, 'price') : planTiers.reduce((t, x) => t + x.count * num(x.price), 0)
  // Average price over the booths that have a price (the entered total may include unpriced ones).
  const pricedCount = hasSites ? sites.length : tierCount
  const booked = hasSites ? sites.filter((s) => s.exhibitor_id).length : own.length

  const contract = sumBy(own, 'contract')
  const collected = payments.filter((p) => ownIds.has(p.exhibitor_id) && isConfirmed(p)).reduce((t, p) => t + num(p.amount), 0)
  const sponsorship = sumBy(sponsors, 'amount')
  const sponsorshipPaid = sumBy(sponsors.filter((s) => s.status === 'مدفوع'), 'amount')
  // Staff claims approved for this exhibition are part of its cost (paid once reimbursed).
  const claims = claimsOf(staffExpenses, exhibition.id)
  const claimsTotal = sumBy(claims, 'amount')
  const expensesTotal = sumBy(expenses, 'amount') + claimsTotal
  const expensesPaid = sumBy(expenses.filter((x) => x.paid), 'amount') + sumBy(claims.filter((x) => x.status === CLAIM_REIMBURSED), 'amount')

  // Break-even: sites to sell (at the average list price) to cover expenses not covered by sponsors.
  const avgPrice = pricedCount ? fullRevenue / pricedCount : 0
  const toCover = Math.max(0, expensesTotal - sponsorship)
  const breakEven = avgPrice ? Math.ceil(toCover / avgPrice - 1e-9) : 0

  return {
    hasSites,
    capacity,
    booked,
    available: Math.max(0, capacity - booked),
    occupancy: percent(booked, capacity),
    fullRevenue,
    avgPrice,
    contract,
    collected,
    outstanding: contract - collected,
    sponsorship,
    sponsorshipPaid,
    expensesTotal,
    expensesPaid,
    claimsTotal,
    netAtFull: fullRevenue + sponsorship - expensesTotal,
    netOnContracts: contract + sponsorship - expensesTotal,
    cashPosition: collected + sponsorshipPaid - expensesPaid,
    breakEven,
    breakEvenPct: percent(breakEven, capacity),
  }
}

/** A client's history across exhibitions. */
export function clientHistory(client, exhibitors, exhibitions) {
  const rows = exhibitors
    .filter((e) => e.client_id === client.id)
    .map((e) => ({ ...e, exhibition: exhibitions.find((x) => x.id === e.exhibition_id) }))
    .sort((a, b) => String(b.exhibition?.date_from || '').localeCompare(String(a.exhibition?.date_from || '')))
  const contract = sumBy(rows, 'contract')
  const paid = sumBy(rows, 'paid')
  return {
    participations: rows,
    count: rows.length,
    contract,
    paid,
    outstanding: contract - paid,
    lastExhibition: rows[0]?.exhibition || null,
  }
}

/** Participants who still owe money (contract − confirmed paid), largest balance first. */
export function receivables(exhibitors, exhibitions) {
  return exhibitors
    .map((e) => ({ exhibitor: e, exhibition: exhibitions.find((x) => x.id === e.exhibition_id), remaining: balanceOf(e) }))
    .filter((r) => r.remaining > 0.0005)
    .sort((a, b) => b.remaining - a.remaining)
}


/**
 * The whole company's money in one place: what was sold, collected and is still owed, and
 * every kind of expense (exhibitions, company overheads, staff claims). Amounts before VAT.
 */
export function companyOverview({ exhibitors = [], payments = [], expenses = [], sponsors = [], companyExpenses = [], staffExpenses = [] }) {
  const contracts = sumBy(exhibitors, 'contract')
  const collected = sumBy(payments.filter(isConfirmed), 'amount')
  const awaiting = sumBy(payments.filter((p) => !isConfirmed(p)), 'amount')
  const sponsorship = sumBy(sponsors, 'amount')
  const sponsorshipPaid = sumBy(sponsors.filter((s) => s.status === 'مدفوع'), 'amount')

  const exhibitionExpenses = sumBy(expenses, 'amount')
  const exhibitionExpensesPaid = sumBy(expenses.filter((x) => x.paid), 'amount')
  const company = sumBy(companyExpenses, 'amount')
  const companyPaid = sumBy(companyExpenses.filter((x) => x.paid), 'amount')
  const claims = staffExpenses.filter((x) => APPROVED_CLAIMS.includes(x.status))
  const staffClaims = sumBy(claims, 'amount')
  const staffReimbursed = sumBy(claims.filter((x) => x.status === 'تم التعويض'), 'amount')

  const expensesAll = exhibitionExpenses + company + staffClaims
  const expensesPaidAll = exhibitionExpensesPaid + companyPaid + staffReimbursed
  return {
    contracts,
    collected,
    // what participants still owe — the same list the «المتبقي للتحصيل» tab shows (an
    // overpaid participant does not cancel out someone else's balance)
    receivable: exhibitors.reduce((t, e) => t + Math.max(0, balanceOf(e)), 0),
    awaiting,
    collectionRate: percent(collected, contracts),
    sponsorship,
    sponsorshipPaid,
    exhibitionExpenses,
    exhibitionExpensesPaid,
    company,
    companyPaid,
    staffClaims,
    staffReimbursed,
    staffOwed: staffClaims - staffReimbursed,
    expensesAll,
    expensesPaidAll,
    payable: expensesAll - expensesPaidAll,
    // on paper: everything sold and sponsored minus every expense
    net: contracts + sponsorship - expensesAll,
    // in hand: money received minus money already paid out
    cash: collected + sponsorshipPaid - expensesPaidAll,
  }
}

/**
 * Money in and out per month (YYYY-MM), newest first. In: confirmed payments by payment date.
 * Out: paid company expenses by date, paid exhibition expenses by due date (else when added),
 * staff claims reimbursed by the review date.
 */
export function monthlyFlow({ payments = [], expenses = [], companyExpenses = [], staffExpenses = [] }) {
  const months = {}
  const add = (date, key, amount) => {
    const m = String(date || '').slice(0, 7)
    if (!/^\d{4}-\d{2}$/.test(m)) return
    months[m] ||= { month: m, in: 0, exhibitions: 0, company: 0, staff: 0 }
    months[m][key] += num(amount)
  }
  payments.filter(isConfirmed).forEach((p) => add(p.date || p.created_at, 'in', p.amount))
  expenses.filter((x) => x.paid).forEach((x) => add(x.due_date || x.created_at, 'exhibitions', x.amount))
  companyExpenses.filter((x) => x.paid).forEach((x) => add(x.date, 'company', x.amount))
  staffExpenses.filter((x) => x.status === 'تم التعويض').forEach((x) => add(x.reviewed_at || x.date, 'staff', x.amount))
  return Object.values(months)
    .map((m) => ({ ...m, out: m.exhibitions + m.company + m.staff, net: m.in - m.exhibitions - m.company - m.staff }))
    .sort((a, b) => b.month.localeCompare(a.month))
}

// ── Collection deadline ─────────────────────────────────────────────────────
/** Every fee must be collected this many days before an exhibition opens. */
export const PAYMENT_DEADLINE_DAYS = 10
/** The dashboard starts warning this many days before the deadline. */
export const DEADLINE_WARNING_DAYS = 7

const DAY_MS = 86_400_000
const dayNumber = (iso) => Math.floor(Date.parse(`${String(iso).slice(0, 10)}T00:00:00Z`) / DAY_MS)
const isoOfDay = (n) => new Date(n * DAY_MS).toISOString().slice(0, 10)

/** Last day to collect every fee of an exhibition (ISO date), or '' without an opening date. */
export function paymentDeadline(exhibition) {
  if (!exhibition?.date_from || Number.isNaN(dayNumber(exhibition.date_from))) return ''
  return isoOfDay(dayNumber(exhibition.date_from) - PAYMENT_DEADLINE_DAYS)
}

/** Whole days from `today` to `date` (negative once it has passed). */
export const daysBetween = (today, date) => dayNumber(date) - dayNumber(today)

/**
 * Exhibitions whose collection deadline is near or past while participants still owe money:
 * from DEADLINE_WARNING_DAYS before the deadline until the exhibition ends. Cancelled and
 * finished exhibitions are left out. Soonest first.
 */
export function collectionAlerts(exhibitions, exhibitors, today) {
  return exhibitions
    .filter((ex) => ex.date_from && !['منتهي', 'ملغى'].includes(ex.status))
    .map((ex) => {
      const deadline = paymentDeadline(ex)
      const daysLeft = daysBetween(today, deadline)
      const owing = exhibitors.filter((e) => e.exhibition_id === ex.id && balanceOf(e) > 0.0005)
      return {
        exhibition: ex,
        deadline,
        daysLeft,
        daysToOpen: daysBetween(today, ex.date_from),
        overdue: daysLeft < 0,
        owing,
        remaining: baisa(owing.reduce((t, e) => t + balanceOf(e), 0)),
      }
    })
    .filter((a) => a.owing.length && a.daysLeft <= DEADLINE_WARNING_DAYS && daysBetween(today, a.exhibition.date_to || a.exhibition.date_from) >= 0)
    .sort((a, b) => a.daysLeft - b.daysLeft)
}

// ── One list for every expense, one log for every movement ──────────────────
export const EXPENSE_KINDS = {
  exhibition: 'مصروف معرض',
  company: 'مصروف شركة',
  claim: 'مطالبة موظف',
  obligation: 'التزام مستحق',
}

/**
 * Every expense of the company in one shape, whatever table it lives in:
 * exhibition expenses, company overheads and staff claims (rejected claims left out).
 * `counted` is false for a claim still awaiting review — it is shown but not yet an expense.
 */
export function allExpenses({ expenses = [], companyExpenses = [], staffExpenses = [], obligations = [] }) {
  return [
    // Obligations (refunds owed, postponed cheques…) are listed with the expenses but are not
    // expenses themselves: counted = false, and they have their own total.
    ...obligations.map((x) => ({
      key: `obligation:${x.id}`,
      kind: 'obligation',
      source: x,
      date: x.due_date || String(x.created_at || '').slice(0, 10),
      description: [x.party, x.description].filter(Boolean).join(' — ') || x.kind,
      category: x.kind || '',
      amount: num(x.amount),
      exhibition_id: x.exhibition_id || null,
      paid: x.status === 'مدفوع',
      counted: false,
      notes: [x.cheque_no && `شيك رقم ${x.cheque_no}`, x.notes].filter(Boolean).join(' • '),
    })),
    ...expenses.map((x) => ({
      key: `exhibition:${x.id}`,
      kind: 'exhibition',
      source: x,
      date: x.due_date || String(x.created_at || '').slice(0, 10),
      description: x.item,
      category: x.category || '',
      amount: num(x.amount),
      exhibition_id: x.exhibition_id,
      paid: Boolean(x.paid),
      counted: true,
      notes: x.notes || '',
    })),
    ...companyExpenses.map((x) => ({
      key: `company:${x.id}`,
      kind: 'company',
      source: x,
      date: x.date,
      description: x.description,
      category: x.category || '',
      amount: num(x.amount),
      exhibition_id: null,
      paid: x.paid !== false,
      counted: true,
      due_date: x.due_date || '',
      pay_from: x.pay_from || '',
      pay_to: x.pay_to || '',
      receipt: x.receipt_path || '',
      notes: x.notes || '',
      recurring: Boolean(x.recurring),
      recurring_every: Number(x.recurring_every) || 1,
      series_id: x.series_id || null,
      period: x.period || '',
    })),
    ...staffExpenses
      .filter((x) => x.status !== 'مرفوض')
      .map((x) => ({
        key: `claim:${x.id}`,
        kind: 'claim',
        source: x,
        date: x.date,
        description: x.description,
        category: x.category || '',
        amount: num(x.amount),
        exhibition_id: x.exhibition_id || null,
        paid: x.status === CLAIM_REIMBURSED,
        counted: APPROVED_CLAIMS.includes(x.status),
        status: x.status,
        receipt: x.receipt_path || '',
        user_id: x.user_id,
        notes: [x.vendor, x.payment_method].filter(Boolean).join(' • '),
      })),
  ].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
}

/**
 * Every movement of money actually received or paid out, newest first, with the running
 * balance after each one. In: confirmed payments (refunds come out) and paid sponsorships.
 * Out: paid exhibition and company expenses, and staff claims paid back.
 */
export function ledger({ payments = [], sponsors = [], expenses = [], companyExpenses = [], staffExpenses = [], obligations = [] }) {
  const day = (v) => String(v || '').slice(0, 10)
  const rows = [
    ...payments.filter(isConfirmed).map((p) => ({ key: `p:${p.id}`, kind: num(p.amount) < 0 ? 'refund' : 'payment', date: day(p.date || p.created_at), amount: num(p.amount), ref: p.invoice_no || '', exhibitor_id: p.exhibitor_id, method: p.method || '', note: p.note || '' })),
    ...sponsors.filter((s) => s.status === 'مدفوع').map((s) => ({ key: `s:${s.id}`, kind: 'sponsor', date: day(s.created_at), amount: num(s.amount), label: s.name, exhibition_id: s.exhibition_id })),
    ...expenses.filter((x) => x.paid).map((x) => ({ key: `e:${x.id}`, kind: 'exhibition', date: day(x.due_date || x.created_at), amount: -num(x.amount), label: x.item, exhibition_id: x.exhibition_id })),
    ...companyExpenses.filter((x) => x.paid !== false).map((x) => ({ key: `c:${x.id}`, kind: 'company', date: day(x.date), amount: -num(x.amount), label: x.description })),
    ...staffExpenses.filter((x) => x.status === CLAIM_REIMBURSED).map((x) => ({ key: `st:${x.id}`, kind: 'claim', date: day(x.reviewed_at || x.date), amount: -num(x.amount), label: x.description, exhibition_id: x.exhibition_id || null, user_id: x.user_id })),
    // A paid obligation — unless it was a participant refund, already in the payments as a refund.
    ...obligations.filter((x) => x.status === 'مدفوع' && !x.refund_invoice).map((x) => ({ key: `ob:${x.id}`, kind: 'obligation', date: day(x.paid_at || x.due_date), amount: -num(x.amount), label: [x.party, x.description].filter(Boolean).join(' — '), exhibition_id: x.exhibition_id || null })),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key))
  let balance = 0
  for (const r of rows) {
    balance = baisa(balance + r.amount)
    r.balance = balance
  }
  return rows.reverse()
}

// ── Is the plan sound? ───────────────────────────────────────────────────────
/** Below this profit margin at full sale, a plan is flagged as thin. */
export const THIN_MARGIN_PCT = 15

/**
 * A verdict on an exhibition's (or a period's) numbers, from exhibitionFinancials()-like
 * figures: { fullRevenue, sponsorship, contract, expensesTotal, capacity, booked, breakEven }.
 *  – 'missing': no sites or no expenses yet, nothing to judge;
 *  – 'risk':    even selling every site does not cover the expenses;
 *  – 'good':    the contracts signed already cover the expenses;
 *  – 'watch':   it can be profitable, but more sites must sell (or the margin is thin).
 */
export function planHealth(f) {
  const potential = num(f.fullRevenue) + num(f.sponsorship)
  const current = num(f.contract) + num(f.sponsorship)
  const expenses = num(f.expensesTotal)
  const netFull = baisa(potential - expenses)
  const netNow = baisa(current - expenses)
  const margin = potential > 0 ? Math.round((netFull / potential) * 100) : 0
  const toSell = Math.max(0, num(f.breakEven) - num(f.booked))
  const base = { potential: baisa(potential), current: baisa(current), expenses: baisa(expenses), netFull, netNow, margin, toSell }
  if (!num(f.capacity) || !expenses) return { ...base, level: 'missing' }
  if (netFull < 0) return { ...base, level: 'risk' }
  if (netNow >= 0) return { ...base, level: margin < THIN_MARGIN_PCT ? 'watch' : 'good', coveredNow: true }
  return { ...base, level: 'watch' }
}

/**
 * Several exhibitions' figures as one (for a verdict on all of them, or on a period whose
 * company expenses — rent, salaries… — come on top via `extraExpenses`). Break-even is
 * recomputed on the combined numbers at the average site price.
 */
export function combineFinancials(list, extraExpenses = 0) {
  const sum = (k) => list.reduce((t, f) => t + num(f[k]), 0)
  const capacity = sum('capacity')
  const fullRevenue = list.reduce((t, f) => t + Math.max(num(f.fullRevenue), num(f.contract)), 0)
  const sponsorship = sum('sponsorship')
  const expensesTotal = sum('expensesTotal') + num(extraExpenses)
  const avgPrice = capacity ? fullRevenue / capacity : 0
  const breakEven = avgPrice ? Math.ceil(Math.max(0, expensesTotal - sponsorship) / avgPrice - 1e-9) : 0
  return {
    capacity,
    booked: sum('booked'),
    fullRevenue: baisa(fullRevenue),
    sponsorship: baisa(sponsorship),
    contract: baisa(sum('contract')),
    collected: baisa(sum('collected')),
    expensesTotal: baisa(expensesTotal),
    breakEven,
  }
}

/** An exhibition still being planned: not counted in the company's money until it is «قادم». */
export const PLANNING_STATUS = 'تخطيط'
export const isPlanning = (exhibition) => exhibition?.status === PLANNING_STATUS

/**
 * The data without exhibitions still in planning: their participants and those participants'
 * payments, their expenses, sponsors, sites, staff claims and obligations are left out of the
 * totals. Company-wide records (no exhibition) stay. `planned` lists what was left out.
 */
export function withoutPlanning(data) {
  const plannedList = (data.exhibitions || []).filter(isPlanning)
  if (!plannedList.length) return { ...data, planned: [] }
  const planned = new Set(plannedList.map((e) => e.id))
  const keep = (x) => !planned.has(x.exhibition_id)
  const exhibitors = data.exhibitors || []
  const dropped = new Set(exhibitors.filter((e) => !keep(e)).map((e) => e.id))
  const only = (list) => (Array.isArray(list) ? list.filter(keep) : list)
  return {
    ...data,
    exhibitors: exhibitors.filter(keep),
    payments: Array.isArray(data.payments) ? data.payments.filter((p) => !dropped.has(p.exhibitor_id)) : data.payments,
    awaiting: Array.isArray(data.awaiting) ? data.awaiting.filter((p) => !dropped.has(p.exhibitor_id)) : data.awaiting,
    expenses: only(data.expenses),
    sponsors: only(data.sponsors),
    sites: only(data.sites),
    staffExpenses: Array.isArray(data.staffExpenses) ? data.staffExpenses.filter((x) => !x.exhibition_id || keep(x)) : data.staffExpenses,
    obligations: Array.isArray(data.obligations) ? data.obligations.filter((x) => !x.exhibition_id || keep(x)) : data.obligations,
    planned: plannedList.map((ex) => ({
      exhibition: ex,
      contracts: sumBy(exhibitors.filter((e) => e.exhibition_id === ex.id), 'contract'),
      expenses: sumBy((data.expenses || []).filter((x) => x.exhibition_id === ex.id), 'amount'),
    })),
  }
}
