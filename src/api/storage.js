// Uploads to private storage buckets (exhibition maps, expense receipts). Files are shown
// through short-lived signed links, so only signed-in staff allowed by the bucket's rules see them.

import { supabase } from '../lib/supabase.js'
import { tr } from '../lib/i18n.js'

export const FILE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf']
export const FILE_MAX_MB = 10

/** Problem with a chosen file, or '' when it can be uploaded. */
export function checkFile(file, what = 'الملف') {
  if (!file) return tr('اختر {0}', [tr(what)])
  if (!FILE_TYPES.includes(file.type)) return tr('{0} يكون صورة (PNG أو JPG أو WEBP) أو ملف PDF', [tr(what)])
  if (file.size > FILE_MAX_MB * 1024 * 1024) return tr('حجم الملف أكبر من {0} ميجابايت', [FILE_MAX_MB])
  return ''
}

export const isPdfPath = (path) => /\.pdf$/i.test(path || '')

function storageError(error, migration) {
  const msg = error?.message || ''
  if (/object not found/i.test(msg)) return tr('الملف غير موجود — ربما حُذف. ارفعه مرة أخرى.')
  if (/bucket not found/i.test(msg)) return tr('مكان حفظ الملفات غير موجود بعد. شغّل تحديث قاعدة البيانات {0} في Supabase.', [migration])
  if (/row-level security|unauthorized|permission/i.test(msg)) return tr('لا تملك صلاحية رفع هذا الملف.')
  return msg || tr('تعذّر رفع الملف')
}

const randomId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`

/** Upload `file` into `bucket` under `folder/` and return its path. */
export async function uploadFile(bucket, folder, file, { what, migration } = {}) {
  const problem = checkFile(file, what)
  if (problem) throw new Error(problem)
  const ext = file.type === 'application/pdf' ? 'pdf' : file.type.split('/')[1].replace('jpeg', 'jpg')
  const path = `${folder}/${randomId()}.${ext}`
  const { error } = await supabase.storage.from(bucket).upload(path, file, { contentType: file.type, upsert: false })
  if (error) throw new Error(storageError(error, migration), { cause: error })
  return path
}

/** A link to view a stored file, valid for an hour. */
export async function fileUrl(bucket, path, { migration } = {}) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 3600)
  if (error) throw new Error(storageError(error, migration), { cause: error })
  return data.signedUrl
}

/** Delete a stored file (best effort — a leftover file does no harm). */
export async function removeFile(bucket, path) {
  if (path) await supabase.storage.from(bucket).remove([path]).catch(() => {})
}

/**
 * Open a stored file in a new tab. The tab is opened straight away (inside the click) so the
 * browser does not block it, then pointed at the signed link.
 */
export async function openFile(bucket, path, options) {
  const tab = window.open('', '_blank')
  try {
    const url = await fileUrl(bucket, path, options)
    if (tab) tab.location.href = url
    else window.location.href = url
  } catch (err) {
    tab?.close()
    throw err
  }
}
