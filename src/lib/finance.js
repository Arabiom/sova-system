import { VAT_RATE } from './constants.js'
import { num, percent } from './format.js'

export const sumBy = (rows, key) => rows.reduce((total, row) => total + num(row[key]), 0)

export const vatOf = (amount) => num(amount) * VAT_RATE
export const withVat = (amount) => num(amount) * (1 + VAT_RATE)

/** What an exhibitor still owes on their contract. */
export const balanceOf = (exhibitor) => num(exhibitor.contract) - num(exhibitor.paid)

/** Booth capacity of an exhibition: the three tiers, else the legacy `booths` column. */
export function boothCapacity(exhibition) {
  const tiers =
    num(exhibition.booth_tier1_count) + num(exhibition.booth_tier2_count) + num(exhibition.booth_tier3_count)
  return tiers || num(exhibition.booths)
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
  const collected = payments.filter((p) => ownIds.has(p.exhibitor_id)).reduce((t, p) => t + num(p.amount), 0)
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

/** Tier rows of an exhibition, falling back to the defaults used when it was created. */
export function tiersOf(exhibition, defaults) {
  return [1, 2, 3].map((i, idx) => ({
    name: exhibition[`booth_tier${i}_name`] || defaults[idx].name,
    price: exhibition[`booth_tier${i}_price`] || defaults[idx].price,
    count: num(exhibition[`booth_tier${i}_count`]),
  }))
}

/** Invoice / contract reference numbers in the format already stored in the database. */
export const newReference = (prefix) => `${prefix}-${Date.now().toString().slice(-6)}`
