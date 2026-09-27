import { todayISO } from '../lib/format.js'
import { supabase, unwrap } from './client.js'

const TABLES = [
  'exhibitions',
  'exhibition_sites',
  'exhibition_expenses',
  'exhibition_sponsors',
  'clients',
  'exhibitors',
  'payments',
  'bookings',
]

/** Download every table as one JSON file (the free Supabase plan keeps no backups). */
export async function downloadBackup() {
  const data = {}
  for (const table of TABLES) data[table] = await unwrap(supabase.from(table).select('*'))
  const backup = { app: 'AIB', created_at: new Date().toISOString(), counts: Object.fromEntries(TABLES.map((t) => [t, data[t].length])), data }
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), { href: url, download: `AIB-backup-${todayISO()}.json` })
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return backup.counts
}
