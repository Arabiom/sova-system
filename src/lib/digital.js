// «الموظفون الرقميون» — the parts that need no database: choosing a campaign's recipients from
// the client base, and the campaign statuses (the database enforces the same rules, migration 034).
import { phoneKey } from './format.js'

export const CAMPAIGN_STATUSES = ['مسودة', 'بانتظار الاعتماد', 'معتمدة', 'أُرسلت', 'ملغاة']
export const CAMPAIGN_BADGE = {
  مسودة: 'badge-neutral',
  'بانتظار الاعتماد': 'badge-warning',
  معتمدة: 'badge-success',
  'أُرسلت': 'badge-info',
  ملغاة: 'badge-neutral',
}
export const RECIPIENT_STATUSES = ['بانتظار', 'أُرسلت', 'قُرئت', 'رد', 'طلب الإيقاف', 'فشل']

/** A number good enough to message: 8 to 15 digits once normalised. */
export const validPhone = (phone) => /^\d{8,15}$/.test(phoneKey(phone))

/** Days since a date (ISO), or null. */
const daysSince = (iso, today) => (iso ? Math.floor((Date.parse(today) - Date.parse(String(iso).slice(0, 10))) / 864e5) : null)

/**
 * The clients a campaign goes to: those matching the filter, each number once, never one on the
 * stop list. Returns the recipients and how many were left out and why.
 * filter: { sources: [], sectors: [], cities: [], statuses: [], notContactedDays }
 */
export function segmentClients(clients, filter = {}, optOutKeys = new Set(), today = new Date().toISOString().slice(0, 10)) {
  const has = (list, v) => !list?.length || list.includes(v || '')
  const matching = clients.filter(
    (c) =>
      has(filter.sources, c.contact_source) &&
      has(filter.sectors, c.sector) &&
      has(filter.cities, c.city) &&
      has(filter.statuses, c.status) &&
      (!filter.notContactedDays || (daysSince(c.last_contact_at, today) ?? Infinity) >= Number(filter.notContactedDays)),
  )
  const seen = new Set()
  const recipients = []
  const left = { noPhone: 0, optedOut: 0, duplicate: 0 }
  for (const c of matching) {
    const phone = c.whatsapp || c.phone
    const key = phoneKey(phone)
    if (!validPhone(phone)) left.noPhone++
    else if (optOutKeys.has(key)) left.optedOut++
    else if (seen.has(key)) left.duplicate++
    else {
      seen.add(key)
      recipients.push({ client_id: c.id, name: c.contact_name || c.name, phone })
    }
  }
  return { matching: matching.length, recipients, left }
}

/** What the person in front of the screen may do with a campaign. */
export function campaignActions(campaign, { role, canWrite }) {
  const s = campaign.status
  return {
    submit: canWrite && s === 'مسودة',
    approve: role === 'admin' && s === 'بانتظار الاعتماد',
    backToDraft: canWrite && (s === 'بانتظار الاعتماد' || s === 'معتمدة'),
    cancel: canWrite && s !== 'أُرسلت' && s !== 'ملغاة',
    remove: (role === 'admin' && s !== 'أُرسلت') || (canWrite && (s === 'مسودة' || s === 'بانتظار الاعتماد')),
  }
}
