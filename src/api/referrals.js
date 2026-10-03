// Referral commission (migration 030): the people who bring participants, each with their own
// rate, and the commissions paid out to them (company expenses carrying referrer_id).

import { num } from '../lib/format.js'
import { fetchAll, supabase, unwrap } from './client.js'

export const REFERRAL_CATEGORY = 'عمولات استقطاب'

const table = () => supabase.from('referrers')
const missingTable = (error) => ['42P01', 'PGRST205'].includes(error?.code)

/** Everyone who brings participants, by name; `null` before migration 030. */
export async function listReferrers() {
  const { data, error } = await fetchAll(() => table().select('*').order('name'))
  if (error) {
    if (missingTable(error)) return null
    return unwrap(Promise.resolve({ data, error }))
  }
  return data
}

export function validateReferrer(form) {
  const errors = []
  if (!String(form.name || '').trim()) errors.push('الاسم')
  const rate = num(form.rate)
  if (!(rate > 0) || rate > 100) errors.push('النسبة (بين 0 و 100)')
  return errors
}

export async function saveReferrer(form, id) {
  const row = {
    name: form.name.trim(),
    phone: (form.phone || '').trim(),
    user_id: form.user_id || null,
    rate: num(form.rate),
    active: form.active !== false,
    notes: (form.notes || '').trim(),
  }
  return id ? unwrap(table().update(row).eq('id', id)) : unwrap(table().insert(row))
}

export const deleteReferrer = (id) => unwrap(table().delete().eq('id', id))

/** Pay a referrer's commission: a paid company expense carrying who it was for. */
export const payReferrer = (referrer, amount, date, note = '') =>
  unwrap(
    supabase.from('company_expenses').insert({
      date,
      category: REFERRAL_CATEGORY,
      description: `عمولة استقطاب — ${referrer.name}`,
      amount: Math.round(num(amount) * 1000) / 1000,
      paid: true,
      due_date: date,
      notes: note,
      referrer_id: referrer.id,
    }),
  )
