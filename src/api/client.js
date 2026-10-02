import { supabase } from '../lib/supabase.js'
import { tr } from '../lib/i18n.js'

/** Turn database / network errors into messages the team can act on. */
export const friendlyError = (error) => tr(arabicError(error))

function arabicError(error) {
  const msg = error?.message || String(error)
  switch (error?.code) {
    case '23505':
      return 'هذا السجل موجود مسبقاً (رقم مكرر).'
    case '23503':
      return 'لا يمكن الحذف لأن هناك بيانات مرتبطة به (مثل دفعات أو مشاركين). احذفها أولاً.'
    case '42P01':
    case 'PGRST205':
      return 'قاعدة البيانات تحتاج تحديثاً (جدول غير موجود). شغّل ملف التحديث في Supabase.'
    case 'PGRST204':
      return 'قاعدة البيانات تحتاج تحديثاً (حقل غير موجود). شغّل آخر ملف تحديث في Supabase.'
    case '42501':
      return 'لا تملك صلاحية لهذه العملية. سجّل الدخول مرة أخرى.'
    case 'PGRST301':
      return 'انتهت الجلسة. سجّل الدخول مرة أخرى.'
  }
  if (/failed to fetch|networkerror|load failed/i.test(msg)) return 'تعذّر الاتصال بالخادم. تحقق من الإنترنت ثم أعد المحاولة.'
  if (/jwt expired/i.test(msg)) return 'انتهت الجلسة. سجّل الدخول مرة أخرى.'
  if (/relation .* does not exist|could not find the table/i.test(msg)) return 'قاعدة البيانات تحتاج تحديثاً (جدول غير موجود). شغّل ملف التحديث في Supabase.'
  return msg
}

/** Supabase returns `{ data, error }`; turn errors into exceptions so callers can use try/catch. */
export async function unwrap(query) {
  let result
  try {
    result = await query
  } catch (err) {
    throw new Error(friendlyError(err), { cause: err })
  }
  const { data, error, count } = result
  if (error) throw new Error(friendlyError(error), { cause: error })
  return count ?? data
}

/**
 * Every row of a list, page by page: the server returns at most 1000 rows per request, so a
 * plain select would silently cut long tables (and every total built on them). `build()` makes
 * a fresh query (select + filters + order); `tie` keeps the paging order stable.
 * Resolves to `{ data, error }` like a single query.
 */
export async function fetchAll(build, { tie = 'id', pageSize = 1000 } = {}) {
  const rows = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build().order(tie, { ascending: true }).range(from, from + pageSize - 1)
    if (error) return { data: null, error }
    rows.push(...(data || []))
    if (!data || data.length < pageSize) return { data: rows, error: null }
  }
}

export { supabase }
