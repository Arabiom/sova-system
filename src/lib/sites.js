// Exhibition site map helpers: booth number ranges, tiers and per-site status.

import { num } from './format.js'
import { tr } from './i18n.js'

/** "1-6, 9, 12–14" → [1,2,3,4,5,6,9,12,13,14] (sorted, unique). Throws on anything else. */
export function parseRanges(text) {
  const numbers = new Set()
  for (const raw of String(text || '').split(/[,،\s]+/)) {
    const part = raw.trim()
    if (!part) continue
    const m = part.match(/^(\d+)(?:[-–—](\d+))?$/)
    if (!m) throw new Error(tr('صيغة غير صحيحة: "{0}"', [part]))
    const from = +m[1]
    const to = m[2] ? +m[2] : from
    if (to < from) throw new Error(tr('النطاق مقلوب: "{0}"', [part]))
    if (to - from > 500) throw new Error(tr('النطاق كبير جداً: "{0}"', [part]))
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

/**
 * Group values that are within `tol` of each other (sorted, chained) and give each group's
 * average — the rows or columns of sites placed by hand on the map.
 */
export function clusterCenters(values, tol = 2) {
  const sorted = [...values].sort((a, b) => a - b)
  const groups = []
  for (const v of sorted) {
    const last = groups[groups.length - 1]
    if (last && v - last.values[last.values.length - 1] <= tol) last.values.push(v)
    else groups.push({ values: [v] })
  }
  return groups.map((g) => g.values.reduce((t, v) => t + v, 0) / g.values.length)
}

const nearest = (centers, v) => centers.reduce((best, c) => (Math.abs(c - v) < Math.abs(best - v) ? c : best), centers[0])
const round2 = (v) => Math.round(v * 100) / 100

/**
 * Line up sites placed by hand: every site moves to the average of its column (x) and row (y),
 * so a slightly-off click snaps into a neat grid. `points`: [{ id, x, y }] in % of the map.
 * Returns only the sites that move: [{ id, x, y }].
 */
export function alignPositions(points, tol = 2) {
  const cols = clusterCenters(points.map((p) => p.x), tol)
  const rows = clusterCenters(points.map((p) => p.y), tol)
  return points
    .map((p) => ({ id: p.id, x: round2(nearest(cols, p.x)), y: round2(nearest(rows, p.y)) }))
    .filter((p, i) => p.x !== round2(points[i].x) || p.y !== round2(points[i].y))
}

/**
 * Size of one site on the map (in % of its width / height), from the closest neighbouring
 * columns and rows — so the logo covers the cell drawn on the map. null with too few sites.
 */
export function cellSize(points, tol = 2) {
  const gap = (centers) => {
    let min = Infinity
    for (let i = 1; i < centers.length; i++) min = Math.min(min, centers[i] - centers[i - 1])
    return Number.isFinite(min) ? min : null
  }
  const dx = gap(clusterCenters(points.map((p) => p.x), tol))
  const dy = gap(clusterCenters(points.map((p) => p.y), tol))
  if (!dx || !dy) return null
  return { w: round2(Math.min(dx * 0.88, 12)), h: round2(Math.min(dy * 0.82, 12)) }
}

/**
 * Check a new split of the site numbers between tiers: `texts[i]` is what was typed for tier i
 * ("41-46" or "7-20, 23-30"). Every existing number must be in exactly one tier, and no new
 * number may appear. Returns { numbers: [[…], …] } or { error }.
 */
export function splitNumbers(existing, texts) {
  const have = new Set(existing.map(Number))
  const seen = new Map() // number → tier index
  const numbers = []
  for (let i = 0; i < texts.length; i++) {
    let list
    try {
      list = parseRanges(texts[i])
    } catch (err) {
      return { error: err.message }
    }
    for (const n of list) {
      if (!have.has(n)) return { error: tr('الموقع {0} غير موجود في هذا المعرض', [n]) }
      if (seen.has(n)) return { error: tr('الموقع {0} مكتوب في فئتين', [n]) }
      seen.set(n, i)
    }
    numbers.push(list)
  }
  const missing = [...have].filter((n) => !seen.has(n)).sort((a, b) => a - b)
  if (missing.length) return { error: tr('هذه المواقع لم تُكتب في أي فئة: {0}', [formatRanges(missing)]) }
  return { numbers }
}
