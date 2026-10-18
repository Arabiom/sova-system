// Saved WhatsApp templates and the log of messages sent (migration 015).

import { phoneKey } from '../lib/format.js'
import { supabase, unwrap } from './client.js'

const missingTable = (error) => ['42P01', 'PGRST205', 'PGRST202', '42883'].includes(error?.code)

/** Saved templates, newest first; `null` before migration 015 is run. */
export async function listTemplates() {
  const { data, error } = await supabase.from('whatsapp_templates').select('*').order('created_at', { ascending: false })
  if (error) {
    if (missingTable(error)) return null
    return unwrap(Promise.resolve({ data, error }))
  }
  return data
}

export const saveTemplate = ({ id, name, body }) =>
  unwrap(
    id
      ? supabase.from('whatsapp_templates').update({ name: name.trim(), body }).eq('id', id)
      : supabase.from('whatsapp_templates').insert({ name: name.trim(), body }),
  )

export const deleteTemplate = (id) => unwrap(supabase.from('whatsapp_templates').delete().eq('id', id))

/** Record one message as sent. Never throws: the message already went out. */
export async function logMessage(entry) {
  const { error } = await supabase.from('whatsapp_log').insert({
    campaign_id: entry.campaignId,
    campaign_name: entry.campaignName || '',
    source: entry.source || '',
    record_id: entry.recordId || null,
    name: entry.name || '',
    phone: entry.phone,
    body: entry.body,
  })
  return !error
}

/** Recent messages (default: last 500); `null` before migration 015. */
export async function listLog({ limit = 500 } = {}) {
  const { data, error } = await supabase.from('whatsapp_log').select('*').order('sent_at', { ascending: false }).limit(limit)
  if (error) {
    if (missingTable(error)) return null
    return unwrap(Promise.resolve({ data, error }))
  }
  return data
}

/** { phoneKey → { sent_at, by } } for numbers messaged in the last 90 days; {} before 015. */
export async function lastContacts() {
  const { data, error } = await supabase.rpc('whatsapp_last_contact')
  if (error) return {}
  return Object.fromEntries((data || []).map((r) => [phoneKey(r.phone), { sent_at: r.sent_at, by: r.sent_by_name }]))
}

/** Group log rows into sends (one per campaign), newest first. */
export function groupCampaigns(rows) {
  const map = new Map()
  for (const row of rows || []) {
    const c = map.get(row.campaign_id) || { id: row.campaign_id, name: row.campaign_name, sent_by: row.sent_by, started: row.sent_at, ended: row.sent_at, rows: [] }
    c.rows.push(row)
    if (row.sent_at < c.started) c.started = row.sent_at
    if (row.sent_at > c.ended) c.ended = row.sent_at
    map.set(row.campaign_id, c)
  }
  return [...map.values()].sort((a, b) => (a.ended < b.ended ? 1 : -1))
}

/** Payment reminders are logged under campaigns named «تذكير بالدفع — …». */
export const PAYMENT_REMINDER = 'تذكير بالدفع'

/**
 * When each participant was last reminded to pay: { exhibitorId → sent_at } (newest), from the
 * WhatsApp log. Marketing sees the reminders they sent; admin and finance see everyone's.
 */
export async function lastPaymentReminders() {
  const { data, error } = await supabase
    .from('whatsapp_log')
    .select('record_id, sent_at')
    .like('campaign_name', `${PAYMENT_REMINDER}%`)
    .not('record_id', 'is', null)
    .order('sent_at', { ascending: false })
    .limit(2000)
  if (error) return {}
  const out = {}
  for (const r of data || []) out[r.record_id] ||= r.sent_at
  return out
}
