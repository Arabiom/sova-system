import { useState } from 'react'
import { DOCS_BUCKET, DOCS_MIGRATION, deleteDocument, listDocuments, saveDocument } from '../api/documents.js'
import { checkFile, openFile } from '../api/storage.js'
import Button from '../components/Button.jsx'
import DateInput from '../components/DateInput.jsx'
import { EmptyState, Loading } from '../components/Feedback.jsx'
import Field from '../components/Field.jsx'
import Modal from '../components/Modal.jsx'
import PageHeader from '../components/PageHeader.jsx'
import Panel from '../components/Panel.jsx'
import StatCard from '../components/StatCard.jsx'
import { useCan } from '../context/AuthContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { DOC_TYPES, docState, sortDocuments } from '../lib/documents.js'
import { formatDate } from '../lib/format.js'
import { tr } from '../lib/i18n.js'
import { omanDay } from '../lib/team.js'
import { useData } from '../lib/useData.js'

const STATE = {
  expired: { badge: 'badge-danger', label: 'منتهية' },
  soon: { badge: 'badge-warning', label: 'تنتهي خلال {0} يوم' },
  valid: { badge: 'badge-success', label: 'سارية' },
  none: { badge: 'badge-neutral', label: 'بدون تاريخ انتهاء' },
}

function DocumentForm({ doc, onClose, onSaved }) {
  const toast = useToast()
  const known = !doc || DOC_TYPES.includes(doc.doc_type)
  const [form, setForm] = useState(() => ({
    kind: doc ? (known ? doc.doc_type : 'أخرى') : DOC_TYPES[0],
    other: doc && !known ? doc.doc_type : '',
    title: doc?.title || '',
    number: doc?.number || '',
    issue_date: doc?.issue_date || '',
    expiry_date: doc?.expiry_date || '',
    notes: doc?.notes || '',
  }))
  const [file, setFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const submit = async () => {
    const docType = form.kind === 'أخرى' ? form.other.trim() || 'أخرى' : form.kind
    if (!doc && !file) return toast(tr('أرفق ملف الوثيقة (PDF أو صورة)'), 'error')
    if (file) {
      const problem = checkFile(file, 'الملف')
      if (problem) return toast(problem, 'error')
    }
    if (form.issue_date && form.expiry_date && form.expiry_date < form.issue_date) return toast(tr('تاريخ الانتهاء قبل تاريخ الإصدار'), 'error')
    setSaving(true)
    try {
      await saveDocument({ ...form, doc_type: docType }, file, doc)
      toast(tr('✅ حُفظت الوثيقة'))
      onSaved()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }
  return (
    <Modal
      title={doc ? tr('تعديل وثيقة') : tr('وثيقة جديدة')}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {tr('إلغاء')}
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? tr('جاري الرفع...') : tr('حفظ')}
          </Button>
        </>
      }
    >
      <Field label={tr('نوع الوثيقة')} required>
        <select id="doc-kind" className="input" value={form.kind} onChange={set('kind')}>
          {DOC_TYPES.map((t) => (
            <option key={t} value={t}>
              {tr(t)}
            </option>
          ))}
        </select>
      </Field>
      {form.kind === 'أخرى' && (
        <Field label={tr('اسم الوثيقة')}>
          <input id="doc-other" className="input" value={form.other} onChange={set('other')} />
        </Field>
      )}
      <div className="form-grid">
        <Field label={tr('الرقم')}>
          <input id="doc-number" className="input" dir="ltr" value={form.number} onChange={set('number')} />
        </Field>
        <Field label={tr('وصف مختصر')}>
          <input id="doc-title" className="input" value={form.title} onChange={set('title')} placeholder={tr('مثال: سجل الفرع الرئيسي')} />
        </Field>
        <Field label={tr('تاريخ الإصدار')}>
          <DateInput value={form.issue_date} onChange={set('issue_date')} />
        </Field>
        <Field label={tr('تاريخ الانتهاء')} hint={tr('يظهر تنبيه قبل الانتهاء بـ 30 يوماً')}>
          <DateInput value={form.expiry_date} onChange={set('expiry_date')} />
        </Field>
      </div>
      <Field label={doc ? tr('استبدال الملف (اختياري)') : tr('الملف')} required={!doc} hint={tr('PDF أو صورة، حتى 10 ميجابايت')}>
        <input id="doc-file" type="file" className="input" accept="application/pdf,image/png,image/jpeg,image/webp" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        {doc?.file_name && !file && <div className="tiny muted mt-4">{tr('الملف الحالي: {0}', [doc.file_name])}</div>}
      </Field>
      <Field label={tr('ملاحظات')}>
        <textarea id="doc-notes" className="input" rows={2} value={form.notes} onChange={set('notes')} />
      </Field>
    </Modal>
  )
}

/**
 * «وثائق الشركة»: the company's official papers in one place — each with its number, dates and
 * file, and a warning before it expires. The admin and finance see them; the admin edits them.
 */
export default function Documents() {
  const toast = useToast()
  const canManage = useCan('documents.manage')
  const { data: docs, loading, reload } = useData(listDocuments, null)
  const [editing, setEditing] = useState(null) // null | {} new | doc
  if (loading) return <Loading />
  const today = omanDay()
  const ready = docs !== null
  const list = ready ? sortDocuments(docs, today) : []
  const count = (s) => list.filter((d) => docState(d, today).state === s).length
  const open = (d) => openFile(DOCS_BUCKET, d.file_path, { migration: DOCS_MIGRATION }).catch((err) => toast(err.message, 'error'))
  const remove = async (d) => {
    if (!confirm(tr('حذف «{0}» وملفه نهائياً؟', [tr(d.doc_type)]))) return
    try {
      await deleteDocument(d)
      toast(tr('تم الحذف'))
      reload()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  return (
    <>
      <PageHeader title={tr('وثائق الشركة')} subtitle={tr('السجل التجاري، شهادة الانتساب، الشهادة الضريبية… في مكان واحد، مع تنبيه قبل انتهائها')}>
        {canManage && ready && <Button onClick={() => setEditing({})}>{tr('+ وثيقة')}</Button>}
      </PageHeader>
      {!ready ? (
        <div className="alert alert-warning">{tr('هذا القسم يحتاج تحديث قاعدة البيانات 039. شغّل ملف التحديث في Supabase ثم حدّث الصفحة.')}</div>
      ) : (
        <>
          <div className="grid-4 mb-16">
            <StatCard flat label={tr('الوثائق')} value={list.length} icon="📁" accent="var(--ink)" />
            <StatCard flat label={tr('سارية')} value={count('valid') + count('none')} icon="✅" accent="var(--suc)" />
            <StatCard flat label={tr('تنتهي خلال 30 يوماً')} value={count('soon')} icon="⏳" accent="var(--wrn)" />
            <StatCard flat label={tr('منتهية')} value={count('expired')} icon="⛔" accent="var(--dng)" />
          </div>
          {count('expired') + count('soon') > 0 && <div className="alert alert-warning mb-16">{tr('⚠️ لديك وثائق منتهية أو قريبة الانتهاء — جدّدها وارفع الملف الجديد بزر «تعديل».')}</div>}
          <Panel icon="📁" title={tr('الوثائق')}>
            {list.length ? (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>{tr('الوثيقة')}</th>
                      <th>{tr('الرقم')}</th>
                      <th>{tr('الإصدار')}</th>
                      <th>{tr('الانتهاء')}</th>
                      <th>{tr('الحالة')}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((d) => {
                      const st = docState(d, today)
                      return (
                        <tr key={d.id}>
                          <td>
                            <div className="strong">{tr(d.doc_type)}</div>
                            {(d.title || d.notes) && <div className="tiny muted">{[d.title, d.notes].filter(Boolean).join(' — ')}</div>}
                          </td>
                          <td className="ltr small">{d.number || '—'}</td>
                          <td className="small nowrap">{formatDate(d.issue_date)}</td>
                          <td className="small nowrap">{formatDate(d.expiry_date)}</td>
                          <td>
                            <span className={`badge ${STATE[st.state].badge}`}>{tr(STATE[st.state].label, [st.days])}</span>
                          </td>
                          <td className="nowrap">
                            {d.file_path && (
                              <Button size="sm" variant="outline" onClick={() => open(d)}>
                                {tr('📄 فتح')}
                              </Button>
                            )}
                            {canManage && (
                              <Button size="sm" variant="ghost" onClick={() => setEditing(d)}>
                                {tr('تعديل')}
                              </Button>
                            )}
                            {canManage && (
                              <Button size="sm" variant="ghost" onClick={() => remove(d)}>
                                {tr('حذف')}
                              </Button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState icon="📁" text={canManage ? tr('لا توجد وثائق بعد — اضغط «+ وثيقة» وارفع السجل التجاري أولاً') : tr('لا توجد وثائق بعد')} />
            )}
          </Panel>
        </>
      )}
      {editing && (
        <DocumentForm
          doc={editing.id ? editing : null}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            reload()
          }}
        />
      )}
    </>
  )
}
