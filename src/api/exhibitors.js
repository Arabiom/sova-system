import { num } from '../lib/format.js'
import { supabase, unwrap } from './client.js'
import { findOrCreateClient } from './clients.js'
import { tr } from '../lib/i18n.js'

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
    // Older forms did not carry the package; leave what is stored untouched then.
    ...('booth_type' in form ? { booth_type: form.booth_type || '' } : {}),
  }
}

/**
 * Save an exhibitor; one without a client record is linked to (or creates) its client.
 * Returns the exhibitor's id (the new one when adding).
 */
export async function saveExhibitor(form, id) {
  const client_id = form.client_id || (await findOrCreateClient(form))
  const row = toExhibitorRow({ ...form, client_id })
  if (id) {
    // Moved to another exhibition (e.g. transferred from a cancelled one): release the
    // sites held in the old exhibition so they show as available there again.
    const before = await unwrap(table().select('exhibition_id').eq('id', id).maybeSingle())
    if (before && before.exhibition_id !== row.exhibition_id) {
      await unwrap(supabase.from('exhibition_sites').update({ exhibitor_id: null }).eq('exhibitor_id', id))
      row.booth = '—'
    }
    await unwrap(table().update(row).eq('id', id))
    return id
  }
  return (await unwrap(table().insert(row).select('id').single())).id
}

/** Insert an exhibitor row as given and return it (with its new id). */
export const createExhibitor = (row) => unwrap(table().insert(row).select('*').single())

export const updateExhibitor = (id, patch) => unwrap(table().update(patch).eq('id', id))

/** Number of payments (confirmed or waiting) recorded for these exhibitors. */
export async function countPayments(exhibitorIds) {
  if (!exhibitorIds.length) return 0
  return (await unwrap(supabase.from('payments').select('id', { count: 'exact', head: true }).in('exhibitor_id', exhibitorIds))) || 0
}

/**
 * Delete an exhibitor. One with payments on record is refused: deleting would take their
 * receipts out of the books (the database refuses too from migration 016).
 */
export async function deleteExhibitor(id) {
  const count = await countPayments([id])
  if (count) {
    throw new Error(tr('لا يمكن الحذف: له {0} دفعة مسجّلة. احذف دفعاته أولاً من «المبيعات والمدفوعات» إن كانت خاطئة، أو غيّر حالته بدل حذفه.', [count]))
  }
  return unwrap(table().delete().eq('id', id))
}

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
