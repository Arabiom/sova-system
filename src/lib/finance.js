import { PAYMENT_PENDING, VAT_RATE } from './constants.js'
import { num, percent } from './format.js'

export const sumBy = (rows, key) => rows.reduce((total, row) => total + num(row[key]), 0)

/** A payment counts as collected unless it is still waiting for finance to confirm it. */
export const isConfirmed = (payment) => payment.status !== PAYMENT_PENDING

/** Round to the baisa (3 decimals) so sums of prices never show floating-point noise. */
const baisa = (value) => Math.round(num(value) * 1000) / 1000

/**
 * Charges on a registration: booth package + extras (+ any other extras), VAT 5% on top.
 * `extras` is [{ name, price, qty }].
 */
export function registrationTotals({ boothPrice = 0, extras = [], otherAmount = 0 }) {
  const extrasTotal = baisa(extras.reduce((t, x) => t + num(x.price) * Math.max(0, num(x.qty)), 0) + num(otherAmount))
  const subtotal = baisa(num(boothPrice) + extrasTotal)
  const vat = baisa(vatOf(subtotal))
  return { boothPrice: num(boothPrice), extrasTotal, subtotal, vat, total: baisa(subtotal + vat) }
}

export const vatOf = (amount) => num(amount) * VAT_RATE
export const withVat = (amount) => num(amount) * (1 + VAT_RATE)

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
export function exhibitionFinancials({ exhibition, sites = [], exhibitors = [], payments = [], expenses = [], sponsors = [] }, defaults) {
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
  const expensesTotal = sumBy(expenses, 'amount')
  const expensesPaid = sumBy(expenses.filter((x) => x.paid), 'amount')

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
