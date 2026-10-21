// The company's own papers (migration 039): commercial register, chamber membership, tax
// certificate… with their numbers, dates and files in the private «company-docs» bucket.
import { fetchAll, supabase, unwrap } from './client.js'
import { removeFile, uploadFile } from './storage.js'

export const DOCS_BUCKET = 'company-docs'
const MIGRATION = '039'
const table = () => supabase.from('company_documents')

/** Every document; null when migration 039 has not been run. */
export async function listDocuments() {
  const res = await fetchAll(() => table().select('*'))
  if (['42P01', 'PGRST205'].includes(res.error?.code)) return null
  return unwrap(Promise.resolve(res))
}

const toRow = (f) => ({
  doc_type: f.doc_type.trim(),
  title: (f.title || '').trim(),
  number: (f.number || '').trim(),
  issue_date: f.issue_date || null,
  expiry_date: f.expiry_date || null,
  notes: (f.notes || '').trim(),
})

/** Save a document; a newly chosen file replaces the old one (which is then removed). */
export async function saveDocument(form, file, existing) {
  let filePart = {}
  if (file) {
    const path = await uploadFile(DOCS_BUCKET, 'docs', file, { what: 'الملف', migration: MIGRATION })
    filePart = { file_path: path, file_name: file.name.slice(0, 200) }
  }
  const row = { ...toRow(form), ...filePart }
  await unwrap(existing ? table().update(row).eq('id', existing.id) : table().insert(row))
  if (file && existing?.file_path) await removeFile(DOCS_BUCKET, existing.file_path)
}

export async function deleteDocument(doc) {
  await unwrap(table().delete().eq('id', doc.id))
  await removeFile(DOCS_BUCKET, doc.file_path)
}

export const DOCS_MIGRATION = MIGRATION
