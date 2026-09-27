import { DEFAULT_TIERS } from '../lib/constants.js'
import { num } from '../lib/format.js'
import { supabase, unwrap } from './client.js'

const table = () => supabase.from('exhibitions')

export const listExhibitions = (columns = '*') => unwrap(table().select(columns).order('date_from'))

/** Map the form state onto the table's columns, filling in the tier defaults. */
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
  let booths = 0
  DEFAULT_TIERS.forEach((tier, idx) => {
    const i = idx + 1
    row[`booth_tier${i}_name`] = form[`booth_tier${i}_name`] || tier.name
    row[`booth_tier${i}_price`] = num(form[`booth_tier${i}_price`]) || tier.price
    row[`booth_tier${i}_count`] = num(form[`booth_tier${i}_count`])
    booths += row[`booth_tier${i}_count`]
  })
  row.booths = booths
  // Legacy single-price column: the middle tier's price.
  row.booth_price = row.booth_tier2_price
  return row
}

/** Blank form for a new exhibition, pre-filled with the default planning tiers. */
export function newExhibitionForm() {
  const form = { status: 'تخطيط' }
  DEFAULT_TIERS.forEach((tier, idx) => {
    form[`booth_tier${idx + 1}_name`] = tier.name
    form[`booth_tier${idx + 1}_price`] = tier.price
    form[`booth_tier${idx + 1}_count`] = tier.count
  })
  return form
}

export const saveExhibition = (form, id) =>
  unwrap(id ? table().update(toExhibitionRow(form)).eq('id', id) : table().insert(toExhibitionRow(form)))

export const getExhibition = (id) => unwrap(table().select('*').eq('id', id).maybeSingle())

export const deleteExhibition = (id) => unwrap(table().delete().eq('id', id))
