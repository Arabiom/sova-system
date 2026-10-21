// «موظف المتابعة والاقتراحات والحلول» (migration 040): the owner's list of tasks, suggestions and
// problems with their solutions. The admin keeps it; the daily review adds to it.
import { fetchAll, supabase, unwrap } from './client.js'

const table = () => supabase.from('advisor_items')

/** Every item; null when migration 040 has not been run. */
export async function listAdvisorItems() {
  const res = await fetchAll(() => table().select('*').order('created_at', { ascending: false }))
  if (['42P01', 'PGRST205'].includes(res.error?.code)) return null
  return unwrap(Promise.resolve(res))
}

const toRow = (f) => ({
  kind: f.kind,
  priority: f.priority,
  title: f.title.trim(),
  details: (f.details || '').trim(),
  due_date: f.due_date || null,
  link: (f.link || '').trim(),
  ...(f.ref ? { ref: f.ref } : {}), // a finding of the live review, added once
})

export const saveAdvisorItem = (form, id) => unwrap(id ? table().update(toRow(form)).eq('id', id) : table().insert(toRow(form)))

export const setAdvisorStatus = (id, status) => unwrap(table().update({ status }).eq('id', id))

export const deleteAdvisorItem = (id) => unwrap(table().delete().eq('id', id))
