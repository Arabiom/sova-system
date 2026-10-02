import { todayISO } from '../lib/format.js'
import { fetchAll, supabase, unwrap } from './client.js'

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

// Tables added by later updates: included when they exist (a missing one is skipped).
const LATER_TABLES = [
  'staff',
  'staff_expenses',
  'company_expenses',
  'company_settings',
  'whatsapp_templates',
  'whatsapp_log',
  'staff_tasks',
  'staff_activity',
  'obligations',
  'staff_contracts',
  'bank_balances',
]

// Tables keyed by something other than `id` (used to page through them in a stable order).
const TIE = { staff: 'user_id', staff_activity: 'user_id' }

/** Download every table as one JSON file (the free Supabase plan keeps no backups). */
export async function downloadBackup() {
  const data = {}
  for (const table of TABLES) data[table] = await unwrap(fetchAll(() => supabase.from(table).select('*'), { tie: TIE[table] || 'id' }))
  for (const table of LATER_TABLES) {
    const { data: rows, error } = await fetchAll(() => supabase.from(table).select('*'), { tie: TIE[table] || 'id' })
    if (!error) data[table] = rows
  }
  const backup = { app: 'AIB', created_at: new Date().toISOString(), counts: Object.fromEntries(Object.entries(data).map(([t, rows]) => [t, rows.length])), data }
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), { href: url, download: `AIB-backup-${todayISO()}.json` })
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return backup.counts
}
