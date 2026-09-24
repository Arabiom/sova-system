import { num } from '../lib/format.js'
import { supabase, unwrap } from './client.js'

const table = () => supabase.from('exhibitors')

export const listExhibitors = ({ columns = '*', orderBy = 'created_at', ascending = false } = {}) =>
  unwrap(table().select(columns).order(orderBy, { ascending }))

export function toExhibitorRow(form) {
  return {
    brand: form.brand,
    manager: form.manager,
    phone: form.phone || '',
    email: form.email || '',
    category: form.category || '',
    exhibition_id: form.exhibition_id,
    booth: form.booth || '—',
    booth_size: form.booth_size || '',
    contract: num(form.contract),
    status: form.status || 'مبدئي',
    notes: form.notes || '',
  }
}

export const saveExhibitor = (form, id) =>
  unwrap(id ? table().update(toExhibitorRow(form)).eq('id', id) : table().insert(toExhibitorRow(form)))

export const createExhibitor = (row) => unwrap(table().insert(row))

export const deleteExhibitor = (id) => unwrap(table().delete().eq('id', id))

/**
 * Add `delta` to an exhibitor's running `paid` total.
 * Reads the current value from the database first (not from possibly stale screen state)
 * and never lets the total drop below zero.
 */
export async function adjustPaid(exhibitorId, delta) {
  const current = await unwrap(table().select('paid').eq('id', exhibitorId).maybeSingle())
  if (!current) return
  const paid = Math.max(0, num(current.paid) + num(delta))
  await unwrap(table().update({ paid }).eq('id', exhibitorId))
}
