// «الموظفون الرقميون» — campaigns, their recipients, follow-ups and the stop list (migration 034).
// Phase 1: nothing is sent from here; the rules (approval by the admin, the stop list) are kept
// by the database itself.
import { fetchAll, supabase } from './client.js'
import { phoneKey } from '../lib/format.js'
import { tr } from '../lib/i18n.js'

const missing = (error) => ['42P01', 'PGRST205'].includes(error?.code)

const REFUSED = {
  campaign_approve_admin_only: 'الاعتماد للمدير فقط',
  campaign_approve_from_pending: 'أرسل الحملة للاعتماد أولاً',
  campaign_no_recipients: 'لا يوجد مستلمون في هذه الحملة',
  campaign_send_needs_approval: 'لا تُرسل حملة قبل اعتمادها',
  campaign_sent_locked: 'الحملة أُرسلت ولا يمكن تعديلها',
  campaign_locked: 'قائمة المستلمين ثابتة بعد الاعتماد — أعدها مسودة لتعديلها',
  campaign_new_status: 'الحملة الجديدة تبدأ مسودة',
  opted_out: 'هذا الرقم في قائمة الإيقاف',
  invalid_phone: 'رقم غير صحيح',
}

/** Turn a refusal from the database into a sentence; a missing table means 034 is not run. */
function explain(error) {
  if (missing(error)) return new Error(tr('قسم الموظفين الرقميين يحتاج تحديث قاعدة البيانات 034 — شغّله في Supabase'), { cause: error })
  const key = Object.keys(REFUSED).find((k) => String(error?.message || '').includes(k))
  return key ? new Error(tr(REFUSED[key]), { cause: error }) : error
}
const run = async (query) => {
  const { data, error } = await query
  if (error) throw explain(error)
  return data
}

/** Everything the section shows; `ready: false` before migration 034. */
export async function loadDigital() {
  const [campaigns, recipients, followups, optOuts] = await Promise.all([
    fetchAll(() => supabase.from('campaigns').select('*').order('created_at', { ascending: false })),
    fetchAll(() => supabase.from('campaign_recipients').select('id, campaign_id, client_id, name, phone, status, status_at').order('created_at'), { tie: 'id' }),
    fetchAll(() => supabase.from('followups').select('*').order('due_date')),
    fetchAll(() => supabase.from('opt_outs').select('*').order('created_at', { ascending: false })),
  ])
  if ([campaigns, recipients, followups, optOuts].some((r) => missing(r.error))) return { ready: false, campaigns: [], recipients: [], followups: [], optOuts: [] }
  for (const r of [campaigns, recipients, followups, optOuts]) if (r.error) throw explain(r.error)
  return { ready: true, campaigns: campaigns.data, recipients: recipients.data, followups: followups.data, optOuts: optOuts.data }
}

export const optOutKeys = (optOuts) => new Set(optOuts.map((o) => phoneKey(o.phone)))

/** A new campaign (a draft) with its recipients. If the recipients fail, the draft is removed. */
export async function createCampaign({ name, body, template_name, segment, exhibition_id }, recipients) {
  const [campaign] = await run(
    supabase.from('campaigns').insert({ name: name.trim(), body, template_name: template_name || '', segment: segment || {}, exhibition_id: exhibition_id || null }).select('id'),
  )
  try {
    if (recipients.length) await run(supabase.from('campaign_recipients').insert(recipients.map((r) => ({ ...r, campaign_id: campaign.id }))))
  } catch (err) {
    await supabase.from('campaigns').delete().eq('id', campaign.id)
    throw err
  }
  return campaign.id
}

export const setCampaignStatus = (id, status) => run(supabase.from('campaigns').update({ status }).eq('id', id))
export const deleteCampaign = (id) => run(supabase.from('campaigns').delete().eq('id', id))

export const addOptOut = ({ phone, reason, client_id }) => run(supabase.from('opt_outs').insert({ phone: phone.trim(), reason: reason?.trim() || '', client_id: client_id || null }))
export const removeOptOut = (id) => run(supabase.from('opt_outs').delete().eq('id', id))

export const saveFollowup = (f) =>
  run(supabase.from('followups').insert({ client_id: f.client_id || null, campaign_id: f.campaign_id || null, due_date: f.due_date, note: f.note?.trim() || '' }))
export const setFollowupDone = (id, done) => run(supabase.from('followups').update({ status: done ? 'تمت' : 'مفتوحة', done_at: done ? new Date().toISOString() : null }).eq('id', id))
export const deleteFollowup = (id) => run(supabase.from('followups').delete().eq('id', id))

