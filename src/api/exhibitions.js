import { DEFAULT_TIERS } from '../lib/constants.js'
import { num } from '../lib/format.js'
import { supabase, unwrap } from './client.js'

const table = () => supabase.from('exhibitions')

export const listExhibitions = (columns = '*') => unwrap(table().select(columns).order('date_from'))

/** Exhibitions that can still take bookings (used by the public booking form). */
export const listOpenExhibitions = () =>
  unwrap(table().select('id,city,mall,date_from,date_to,status').neq('status', 'منتهي').order('date_from'))

/** Map the form state onto the table's columns, filling in the tier defaults. */
export function toExhibitionRow(form) {
  const row = {
    city: form.city,
    mall: form.mall,
    date_from: form.date_from,
    date_to: form.date_to,
    status: form.status || 'تخطيط',
    notes: form.notes || '',
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

export const saveExhibition = (form, id) =>
  unwrap(id ? table().update(toExhibitionRow(form)).eq('id', id) : table().insert(toExhibitionRow(form)))

export const deleteExhibition = (id) => unwrap(table().delete().eq('id', id))
