import { DEFAULT_TIERS } from '../lib/constants.js'
import { num } from '../lib/format.js'
import { supabase, unwrap } from './client.js'

const table = () => supabase.from('exhibitions')

export const listExhibitions = (columns = '*') => unwrap(table().select(columns).order('date_from'))

/** Tiers typed on the form, without blank rows: [{ name, price, count }]. */
export function cleanTiers(tiers = []) {
  return tiers
    .map((t) => ({ name: String(t.name || '').trim(), price: num(t.price), count: num(t.count) }))
    .filter((t) => t.name || t.price || t.count)
}

/** Tiers to edit on the form: the saved list, else the three legacy tier columns. */
export function formTiers(exhibition) {
  if (Array.isArray(exhibition.tiers) && exhibition.tiers.length) return exhibition.tiers.map((t) => ({ ...t }))
  const legacy = [1, 2, 3]
    .map((i) => ({ name: exhibition[`booth_tier${i}_name`] || '', price: exhibition[`booth_tier${i}_price`] ?? '', count: exhibition[`booth_tier${i}_count`] ?? '' }))
    .filter((t) => num(t.count) > 0)
  return legacy.length ? legacy : [{ name: '', price: '', count: '' }]
}

/** Map the form state onto the table's columns. The first three tiers also fill the legacy columns. */
export function toExhibitionRow(form) {
  const row = {
    city: form.city,
    mall: form.mall,
    date_from: form.date_from,
    date_to: form.date_to,
    status: form.status || 'تخطيط',
    notes: form.notes || '',
    name: form.name?.trim() || '',
    address: form.address || '',
    hours: form.hours || '',
    occasion: form.occasion || '',
  }
  const tiers = Array.isArray(form.tiers)
    ? cleanTiers(form.tiers)
    : cleanTiers([1, 2, 3].map((i) => ({ name: form[`booth_tier${i}_name`], price: form[`booth_tier${i}_price`], count: form[`booth_tier${i}_count`] })))
  row.tiers = tiers
  DEFAULT_TIERS.forEach((tier, idx) => {
    const i = idx + 1
    const t = tiers[idx]
    row[`booth_tier${i}_name`] = t?.name || tier.name
    row[`booth_tier${i}_price`] = t?.price || tier.price
    row[`booth_tier${i}_count`] = t?.count || 0
  })
  // The total typed on the form wins; otherwise the tiers add up to it.
  row.booths = num(form.booths) || tiers.reduce((sum, t) => sum + t.count, 0)
  // Legacy single-price column: the middle tier's price.
  row.booth_price = row.booth_tier2_price
  return row
}

/** Blank form for a new exhibition, with one empty tier row. */
export function newExhibitionForm() {
  return { status: 'تخطيط', tiers: [{ name: '', price: '', count: '' }] }
}

/** Before migration 005 the `tiers` column does not exist: save the first three tiers only. */
const missingTiersColumn = (err) => {
  const e = err?.cause || err
  return e?.code === 'PGRST204' ? /tiers/.test(e.message || '') : /tiers/.test(e?.message || '') && /column/i.test(e?.message || '')
}

export async function saveExhibition(form, id) {
  const row = toExhibitionRow(form)
  const write = (r) => unwrap(id ? table().update(r).eq('id', id) : table().insert(r))
  try {
    return await write(row)
  } catch (err) {
    if (!missingTiersColumn(err)) throw err
    if (row.tiers.length > 3) {
      throw new Error('لحفظ أكثر من 3 فئات شغّل تحديث قاعدة البيانات 005 في Supabase أولاً.', { cause: err })
    }
    const { tiers: _unused, ...legacy } = row
    return write(legacy)
  }
}

export const getExhibition = (id) => unwrap(table().select('*').eq('id', id).maybeSingle())

export const deleteExhibition = (id) => unwrap(table().delete().eq('id', id))
