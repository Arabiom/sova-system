// Exhibition map images (designed outside the system and attached to each exhibition).
// Stored in the private "exhibition-maps" storage bucket (migration 006); shown through
// short-lived signed links so they are only visible to signed-in staff.

import { supabase } from '../lib/supabase.js'

export const MAP_BUCKET = 'exhibition-maps'
export const MAP_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf']
export const MAP_MAX_MB = 10

const bucket = () => supabase.storage.from(MAP_BUCKET)

const storageError = (error) =>
  /bucket not found|not found/i.test(error?.message || '')
    ? 'مكان حفظ الخرائط غير موجود بعد. شغّل تحديث قاعدة البيانات 006 في Supabase.'
    : /row-level security|unauthorized|permission/i.test(error?.message || '')
      ? 'لا تملك صلاحية رفع الخارطة.'
      : error?.message || 'تعذّر رفع الخارطة'

/** Problem with a chosen file, or '' when it can be uploaded. */
export function checkMapFile(file) {
  if (!file) return 'اختر ملف الخارطة'
  if (!MAP_TYPES.includes(file.type)) return 'الخارطة تكون صورة (PNG أو JPG أو WEBP) أو ملف PDF'
  if (file.size > MAP_MAX_MB * 1024 * 1024) return `حجم الملف أكبر من ${MAP_MAX_MB} ميجابايت`
  return ''
}

export const isPdfPath = (path) => /\.pdf$/i.test(path || '')

/** Upload a map file and return its storage path. */
export async function uploadMap(file) {
  const problem = checkMapFile(file)
  if (problem) throw new Error(problem)
  const ext = file.type === 'application/pdf' ? 'pdf' : file.type.split('/')[1].replace('jpeg', 'jpg')
  const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const path = `maps/${id}.${ext}`
  const { error } = await bucket().upload(path, file, { contentType: file.type, upsert: false })
  if (error) throw new Error(storageError(error), { cause: error })
  return path
}

/** A link to view the map, valid for an hour. */
export async function mapUrl(path) {
  const { data, error } = await bucket().createSignedUrl(path, 3600)
  if (error) throw new Error(storageError(error), { cause: error })
  return data.signedUrl
}

/** Delete a map file (best effort — a leftover file does no harm). */
export async function removeMapFile(path) {
  if (path) await bucket().remove([path]).catch(() => {})
}
