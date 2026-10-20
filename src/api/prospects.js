// «البحث والفرص» (migration 035): the prospects list and the code of the daily research.
import { fetchAll, supabase } from './client.js'
import { toClientRow } from './clients.js'
import { tr } from '../lib/i18n.js'
import { prospectToClient } from '../lib/prospects.js'

const missing = (error) => ['42P01', 'PGRST205', 'PGRST202', '42883'].includes(error?.code)

function explain(error) {
  if (missing(error)) return new Error(tr('قسم البحث والفرص يحتاج تحديث قاعدة البيانات 035 — شغّله في Supabase'), { cause: error })
  if (error?.code === '23505') return new Error(tr('هذه الفرصة موجودة مسبقاً (نفس الرقم أو الحساب)'), { cause: error })
  if (String(error?.message || '').includes('admin_only')) return new Error(tr('للمدير فقط'), { cause: error })
  return error
}
const run = async (query) => {
  const { data, error } = await query
  if (error) throw explain(error)
  return data
}

const FIELDS = ['kind', 'name', 'category', 'city', 'instagram', 'website', 'phone', 'email', 'source_url', 'notes', 'status']
const toRow = (p) => Object.fromEntries(FIELDS.filter((k) => p[k] !== undefined).map((k) => [k, typeof p[k] === 'string' ? p[k].trim() : p[k]]))

/** The list; `ready: false` before migration 035. */
export async function loadProspects() {
  const res = await fetchAll(() => supabase.from('prospects').select('*').order('created_at', { ascending: false }))
  if (missing(res.error)) return { ready: false, prospects: [], feedSince: null }
  if (res.error) throw explain(res.error)
  const feed = await supabase.rpc('prospect_feed_status')
  return { ready: true, prospects: res.data, feedSince: !feed.error && typeof feed.data === 'string' ? feed.data : null }
}

export const saveProspect = (p, id) => run(id ? supabase.from('prospects').update(toRow(p)).eq('id', id) : supabase.from('prospects').insert(toRow(p)))
export const setProspectStatus = (id, status) => run(supabase.from('prospects').update({ status }).eq('id', id))
export const deleteProspect = (id) => run(supabase.from('prospects').delete().eq('id', id).select('id'))

/** Save the new rows of a file, in batches; a row that turns out to exist is counted, not fatal. */
export async function importProspects(rows, onProgress = () => {}) {
  let added = 0
  let skipped = 0
  for (let i = 0; i < rows.length; i += 50) {
    const batch = rows.slice(i, i + 50).map((r) => ({ ...toRow({ ...r, status: 'جديد' }), origin: 'استيراد' }))
    const { error } = await supabase.from('prospects').insert(batch)
    if (!error) added += batch.length
    else if (error.code === '23505') {
      for (const row of batch) {
        const one = await supabase.from('prospects').insert(row)
        if (one.error?.code === '23505') skipped++
        else if (one.error) throw explain(one.error)
        else added++
      }
    } else throw explain(error)
    onProgress(Math.min(i + 50, rows.length))
  }
  return { added, skipped }
}

/** Turn a prospect into a client (status «محتمل») and link the two. */
export async function makeClient(p) {
  const [client] = await run(supabase.from('clients').insert(toClientRow(prospectToClient(p))).select('id'))
  await run(supabase.from('prospects').update({ status: 'أصبح عميلاً', client_id: client.id }).eq('id', p.id))
  return client.id
}

/** A new code for the daily research (shown once); the old one stops working. */
export const rotateFeedToken = () => run(supabase.rpc('rotate_prospect_feed_token'))
export const revokeFeedToken = () => run(supabase.rpc('revoke_prospect_feed_token'))
