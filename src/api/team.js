// Working time and tasks of the team (migration 017).

import { fetchAll, supabase, unwrap } from './client.js'

const missing = (error) => ['42P01', 'PGRST205', 'PGRST202', '42883'].includes(error?.code)

export const TASK_STATUSES = ['جديدة', 'قيد التنفيذ', 'منجزة']
export const [TASK_NEW, TASK_DOING, TASK_DONE] = TASK_STATUSES
export const TASK_PRIORITIES = ['عادية', 'مهمة', 'عاجلة']

/** Tell the database this employee is active right now (counted at most once a minute). */
export async function reportActivity() {
  const { error } = await supabase.rpc('track_activity')
  return !error
}

/** Days of activity from `from` (yyyy-mm-dd) on; `null` before migration 017. */
export async function listActivity(from) {
  const { data, error } = await fetchAll(() => supabase.from('staff_activity').select('*').gte('day', from).order('day'), { tie: 'user_id' })
  if (error) {
    if (missing(error)) return null
    return unwrap(Promise.resolve({ data, error }))
  }
  return data
}

/** Tasks the signed-in person may see, newest first; `null` before migration 017. */
export async function listTasks() {
  const { data, error } = await fetchAll(() => supabase.from('staff_tasks').select('*').order('created_at', { ascending: false }))
  if (error) {
    if (missing(error)) return null
    return unwrap(Promise.resolve({ data, error }))
  }
  return data
}

export function validateTask(form) {
  const errors = []
  if (!form.title?.trim()) errors.push('عنوان المهمة')
  if (!form.assigned_to) errors.push('الموظف')
  return errors
}

export const toTaskRow = (form) => ({
  title: form.title.trim(),
  details: form.details?.trim() || '',
  assigned_to: form.assigned_to,
  due_date: form.due_date || null,
  priority: form.priority || TASK_PRIORITIES[0],
  exhibition_id: form.exhibition_id || null,
})

export const saveTask = (form, id) =>
  unwrap(id ? supabase.from('staff_tasks').update(toTaskRow(form)).eq('id', id) : supabase.from('staff_tasks').insert(toTaskRow(form)))

export const setTaskStatus = (id, status, note) =>
  unwrap(supabase.from('staff_tasks').update(note === undefined ? { status } : { status, note }).eq('id', id))

export const deleteTask = (id) => unwrap(supabase.from('staff_tasks').delete().eq('id', id))
