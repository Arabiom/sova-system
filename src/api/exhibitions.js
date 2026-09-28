import { DEFAULT_TIERS } from '../lib/constants.js'
import { num } from '../lib/format.js'
import { supabase, unwrap } from './client.js'
import { countPayments } from './exhibitors.js'
import { tr } from '../lib/i18n.js'

const table = () => supabase.from('exhibitions')

export const listExhibitions = (columns = '*') => unwrap(table().select(columns).order('date_from'))

/** Tiers typed on the form, without blank rows: [{ name, price, count }]. */
export function cleanTiers(tiers = []) {
  return tiers
    .map((t) => ({ name: String(t.name || '').trim(), price: num(t.price), count: num(t.count) }))
    .filter((t) => t.name || t.price || t.count)
}

/** Tiers to edit on the form: the saved list, else the three legacy tier columns. */
export function formTiers(exhibition) {
  if (Array.isArray(exhibition.tiers) && exhibition.tiers.length) return exhibition.tiers.map((t) => ({ ...t }))
  const legacy = [1, 2, 3]
    .map((i) => ({ name: exhibition[`booth_tier${i}_name`] || '', price: exhibition[`booth_tier${i}_price`] ?? '', count: exhibition[`booth_tier${i}_count`] ?? '' }))
    .filter((t) => num(t.count) > 0)
  return legacy.length ? legacy : [{ name: '', price: '', count: '' }]
}

/** Map the form state onto the table's columns. The first three tiers also fill the legacy columns. */
export function toExhibitionRow(form) {
  const row = {
    city: form.city,
    mall: form.mall,
    date_from: form.date_from,
    date_to: form.date_to,
    status: form.status || 'تخطيط',
    notes: form.notes || '',
    name: form.name?.trim() || '',
    address: form.address || '',
    hours: form.hours || '',
    occasion: form.occasion || '',
  }
  const tiers = Array.isArray(form.tiers)
    ? cleanTiers(form.tiers)
    : cleanTiers([1, 2, 3].map((i) => ({ name: form[`booth_tier${i}_name`], price: form[`booth_tier${i}_price`], count: form[`booth_tier${i}_count`] })))
  row.tiers = tiers
  DEFAULT_TIERS.forEach((tier, idx) => {
    const i = idx + 1
    const t = tiers[idx]
    row[`booth_tier${i}_name`] = t?.name || tier.name
    row[`booth_tier${i}_price`] = t?.price || tier.price
    row[`booth_tier${i}_count`] = t?.count || 0
  })
  // Attached map image (only sent when the form has the field, so older databases still save).
  if ('map_path' in form) row.map_path = form.map_path || null
  // The total typed on the form wins; otherwise the tiers add up to it.
  row.booths = num(form.booths) || tiers.reduce((sum, t) => sum + t.count, 0)
  // Legacy single-price column: the middle tier's price.
  row.booth_price = row.booth_tier2_price
  return row
}

/** Blank form for a new exhibition, with one empty tier row. */
export function newExhibitionForm() {
  return { status: 'تخطيط', tiers: [{ name: '', price: '', count: '' }] }
}

/** Name of a column the database does not have yet (migration not run), from its error. */
function missingColumn(err) {
  const e = err?.cause || err
  const m = String(e?.message || '').match(/'(\w+)' column/)
  return e?.code === 'PGRST204' && m ? m[1] : ''
}

// Columns this database turned out not to have (remembered so later saves skip them).
const absentColumns = new Set()

/**
 * Save the exhibition. Columns the database does not have yet (an update not run) are left
 * out and the save retried: before 005 more than three tiers cannot be kept, and before 006
 * a map cannot be attached — those two say so instead.
 */
export async function saveExhibition(form, id) {
  let row = toExhibitionRow(form)
  for (const column of absentColumns) delete row[column]
  const write = (r) => unwrap(id ? table().update(r).eq('id', id) : table().insert(r))
  for (let attempt = 0; ; attempt++) {
    try {
      return await write(row)
    } catch (err) {
      const column = missingColumn(err)
      if (!column || attempt > 20 || !(column in row)) throw err
      if (column === 'tiers' && row.tiers.length > 3) {
        throw new Error(tr('لحفظ أكثر من 3 فئات شغّل تحديث قاعدة البيانات 005 في Supabase أولاً.'), { cause: err })
      }
      if (column === 'map_path' && row.map_path) {
        throw new Error(tr('لحفظ الخارطة شغّل تحديث قاعدة البيانات 006 في Supabase أولاً.'), { cause: err })
      }
      absentColumns.add(column)
      const { [column]: _unused, ...rest } = row
      row = rest
    }
  }
}

export const getExhibition = (id) => unwrap(table().select('*').eq('id', id).maybeSingle())

/**
 * Delete an exhibition with its sites, expenses, sponsors and participants. Refused while any
 * participant has payments on record, so no receipt leaves the books.
 */
export async function deleteExhibition(id) {
  const ids = (await unwrap(supabase.from('exhibitors').select('id').eq('exhibition_id', id))).map((e) => e.id)
  const count = await countPayments(ids)
  if (count) {
    throw new Error(tr('لا يمكن حذف المعرض: فيه {0} دفعة مسجّلة لمشاركيه. انقل المشاركين لمعرض آخر أو احذف دفعاتهم أولاً، أو اجعل حالة المعرض «ملغى».', [count]))
  }
  return unwrap(table().delete().eq('id', id))
}
