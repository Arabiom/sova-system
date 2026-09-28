import { supabase, unwrap } from './client.js'

const table = () => supabase.from('staff')

/**
 * Role of the signed-in user. Before migration 003 exists there is no staff table and
 * everyone who can sign in is treated as admin, exactly as before roles existed.
 */
export async function fetchMyStaff(userId) {
  const { data, error } = await table().select('role,name,email').eq('user_id', userId).maybeSingle()
  if (error) {
    if (['42P01', 'PGRST205'].includes(error.code) || /does not exist|could not find the table/i.test(error.message)) {
      return { role: 'admin', legacy: true }
    }
    throw new Error(error.message)
  }
  return data // null → signed in but not staff
}

export const listStaff = () => unwrap(table().select('*').order('created_at'))
export const updateStaff = (userId, patch) => unwrap(table().update(patch).eq('user_id', userId))
export const removeStaff = (userId) => unwrap(table().delete().eq('user_id', userId))
