// Exhibition site map helpers: booth number ranges, tiers and per-site status.

import { num } from './format.js'

/** "1-6, 9, 12–14" → [1,2,3,4,5,6,9,12,13,14] (sorted, unique). Throws on anything else. */
export function parseRanges(text) {
  const numbers = new Set()
  for (const raw of String(text || '').split(/[,،\s]+/)) {
    const part = raw.trim()
    if (!part) continue
    const m = part.match(/^(\d+)(?:[-–—](\d+))?$/)
    if (!m) throw new Error(`صيغة غير صحيحة: "${part}"`)
    const from = +m[1]
    const to = m[2] ? +m[2] : from
    if (to < from) throw new Error(`النطاق مقلوب: "${part}"`)
    if (to - from > 500) throw new Error(`النطاق كبير جداً: "${part}"`)
    for (let n = from; n <= to; n++) numbers.add(n)
  }
  return [...numbers].sort((a, b) => a - b)
}

/** [1,2,3,4,5,6,9,12,13,14] → "1–6، 9، 12–14" */
export function formatRanges(numbers) {
  const sorted = [...new Set(numbers.map(Number))].sort((a, b) => a - b)
  const parts = []
  for (let i = 0; i < sorted.length; i++) {
    const start = sorted[i]
    while (sorted[i + 1] === sorted[i] + 1) i++
    parts.push(start === sorted[i] ? `${start}` : `${start}–${sorted[i]}`)
  }
  return parts.join('، ')
}

/** Group sites into tiers (same name and price) in the order they first appear by number. */
export function tiersFromSites(sites) {
  const groups = new Map()
  for (const site of [...sites].sort((a, b) => a.number - b.number)) {
    const key = `${site.tier}|${num(site.price)}`
    if (!groups.has(key)) groups.set(key, { name: site.tier, price: num(site.price), numbers: [] })
    groups.get(key).numbers.push(site.number)
  }
  return [...groups.values()].map((g) => ({
    ...g,
    count: g.numbers.length,
    total: g.numbers.length * g.price,
    ranges: formatRanges(g.numbers),
  }))
}

/** متاح | محجوز | مدفوع جزئياً | مدفوع — from the exhibitor holding the site. */
export function siteStatus(site, exhibitor) {
  if (!site.exhibitor_id || !exhibitor) return 'متاح'
  const contract = num(exhibitor.contract)
  const paid = num(exhibitor.paid)
  if (contract > 0 && paid >= contract) return 'مدفوع'
  if (paid > 0) return 'مدفوع جزئياً'
  return 'محجوز'
}

const NAMED_COLORS = [
  ['أحمر فاتح', '#F28B7D'],
  ['أحمر داكن', '#8B1818'],
  ['أحمر', '#EC3013'],
  ['أسود', '#201E1D'],
  ['رمادي', '#9CA3AF'],
  ['ذهبي', '#C9A84C'],
  ['أخضر', '#1A7A45'],
  ['أزرق', '#1A5C8B'],
  ['بنفسجي', '#5C2D8B'],
  ['برتقالي', '#C86A18'],
]
const PALETTE = ['#C9A84C', '#1A5C8B', '#1A7A45', '#5C2D8B', '#C86A18', '#8B1818', '#6B5A40', '#0E7490']

/** Colour for a tier: its own name when it is a colour ("أحمر فاتح"), else a stable palette slot. */
export function tierColor(name, index = 0) {
  const hit = NAMED_COLORS.find(([word]) => String(name || '').includes(word))
  return hit ? hit[1] : PALETTE[index % PALETTE.length]
}

/**
 * Site numbers held according to a booth label: "16، 22" → ['16','22'], "1–6" → ['1',…,'6'],
 * "A-01" → ['A-01']. Same rule as booth_keys() in the database (migration 013).
 */
export function boothKeys(label) {
  const keys = []
  for (const raw of String(label ?? '').trim().split(/[,،\s]+/)) {
    const part = raw.trim()
    if (!part || part === '—' || part === '-') continue
    const m = part.match(/^(\d+)[-–—](\d+)$/)
    if (m && +m[2] >= +m[1] && +m[2] - +m[1] <= 500) for (let n = +m[1]; n <= +m[2]; n++) keys.push(String(n))
    else if (/^\d+$/.test(part)) keys.push(String(Number(part)))
    else keys.push(part.toUpperCase())
  }
  return keys
}

/** The participant already holding any of these sites in the exhibition, or null. */
export function boothHolder(exhibitors, exhibitionId, label, selfId) {
  const wanted = new Set(boothKeys(label))
  if (!wanted.size) return null
  for (const e of exhibitors) {
    if (e.id === selfId || e.exhibition_id !== exhibitionId) continue
    const shared = boothKeys(e.booth).filter((k) => wanted.has(k))
    if (shared.length) return { exhibitor: e, numbers: shared }
  }
  return null
}

/** Sites registered to more than one participant in the same exhibition (older data). */
export function duplicateBooths(exhibitors) {
  const owners = new Map() // "exhibition|site" → exhibitors
  for (const e of exhibitors) {
    for (const k of boothKeys(e.booth)) {
      const key = `${e.exhibition_id}|${k}`
      owners.set(key, [...(owners.get(key) || []), e])
    }
  }
  return [...owners.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([key, list]) => ({ exhibitionId: key.split('|')[0], number: key.split('|')[1], exhibitors: list }))
}
