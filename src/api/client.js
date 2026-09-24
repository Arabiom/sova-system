import { supabase } from '../lib/supabase.js'

/** Supabase returns `{ data, error }`; turn errors into exceptions so callers can use try/catch. */
export async function unwrap(query) {
  const { data, error, count } = await query
  if (error) throw new Error(error.message)
  return count ?? data
}

export { supabase }
