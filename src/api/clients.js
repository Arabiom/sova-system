import { phoneKey } from '../lib/format.js'
import { friendlyError, supabase, unwrap } from './client.js'

const table = () => supabase.from('clients')

export const listClients = () => unwrap(table().select('*').order('name'))

export function toClientRow(form) {
  return {
    name: form.name?.trim(),
    contact_name: form.contact_name || '',
    phone: form.phone || '',
    whatsapp: form.whatsapp || '',
    email: (form.email || '').trim().toLowerCase(),
    instagram: form.instagram || '',
    sector: form.sector || '',
    city: form.city || '',
    source: form.source || '',
    status: form.status || 'نشط',
    notes: form.notes || '',
  }
}

export const saveClient = (form, id) =>
  unwrap(id ? table().update(toClientRow(form)).eq('id', id) : table().insert(toClientRow(form)))

export const deleteClient = (id) => unwrap(table().delete().eq('id', id))

/**
 * Check a number or name against the WHOLE client database (migration 010): who added it and
 * when. Returns [] when the check is not available yet (010 not run).
 */
export async function findClient(q) {
  if (!String(q || '').trim()) return []
  const { data, error } = await supabase.rpc('find_client', { q: String(q).trim() })
  if (error) {
    if (error.code === 'PGRST202' || /find_client/.test(error.message || '')) return []
    throw new Error(friendlyError(error), { cause: error })
  }
  return data || []
}

/** The client already registered with this phone number (anyone's), or null. */
export async function clientWithPhone(phone) {
  if (!phoneKey(phone)) return null
  const rows = await findClient(phone)
  return rows.find((r) => r.matched_by === 'phone') || null
}

/**
 * The client matching this person/brand — same phone number, else same name — creating
 * it when there is none. `known` (optional) is an already-loaded client list to search first.
 */
export async function findOrCreateClient({ brand, manager, phone, email, category }, known) {
  const clients = known || (await unwrap(table().select('id,name,phone')))
  const key = phoneKey(phone)
  const name = (brand || manager || '').trim()
  const match =
    (key && clients.find((c) => phoneKey(c.phone) === key)) ||
    (!key && name && clients.find((c) => c.name?.trim().toLowerCase() === name.toLowerCase()))
  if (match) return match.id
  // Employees see only their own clients: the number may belong to a colleague's client.
  if (key) {
    const other = await clientWithPhone(phone)
    if (other) return other.id
  }

  const created = await unwrap(
    table()
      .insert(toClientRow({ name, contact_name: manager, phone, email, sector: category, source: 'معرض سابق' }))
      .select('id,name,phone')
      .single(),
  )
  known?.push(created)
  return created.id
}
