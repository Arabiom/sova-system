import { num } from '../lib/format.js'
import { supabase, unwrap } from './client.js'
import { findOrCreateClient } from './clients.js'

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
    client_id: form.client_id || null,
  }
}

/** Save an exhibitor; one without a client record is linked to (or creates) its client. */
export async function saveExhibitor(form, id) {
  const client_id = form.client_id || (await findOrCreateClient(form))
  const row = toExhibitorRow({ ...form, client_id })
  return unwrap(id ? table().update(row).eq('id', id) : table().insert(row))
}

/** Insert an exhibitor row as given and return it (with its new id). */
export const createExhibitor = (row) => unwrap(table().insert(row).select('*').single())

export const updateExhibitor = (id, patch) => unwrap(table().update(patch).eq('id', id))

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
