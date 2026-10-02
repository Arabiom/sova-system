// The company's bank account balance, recorded by hand from the bank (migration 028).

import { supabase, unwrap } from './client.js'
import { num } from '../lib/format.js'

const missingTable = (error) => ['42P01', 'PGRST205'].includes(error?.code)

/** Recorded balances, newest first; `null` before migration 028. */
export async function listBankBalances() {
  const { data, error } = await supabase.from('bank_balances').select('*').order('as_of', { ascending: false }).order('created_at', { ascending: false }).limit(50)
  if (error) {
    if (missingTable(error)) return null
    return unwrap(Promise.resolve({ data, error }))
  }
  return data
}

export const addBankBalance = ({ amount, as_of, account, note }) =>
  unwrap(supabase.from('bank_balances').insert({ amount: num(amount), as_of, account: (account || '').trim(), note: (note || '').trim() }))

export const deleteBankBalance = (id) => unwrap(supabase.from('bank_balances').delete().eq('id', id))
