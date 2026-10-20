import { useState } from 'react'
import { listClients } from '../api/clients.js'
import { deleteProspect, importProspects, loadProspects, makeClient, revokeFeedToken, rotateFeedToken, saveProspect, setProspectStatus } from '../api/prospects.js'
import { useAuth, useCan } from '../context/AuthContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { parseCsv } from '../lib/clientImport.js'
import { downloadCsv } from '../lib/csv.js'
import { formatDate } from '../lib/format.js'
import { tr } from '../lib/i18n.js'
import { readFirstSheet } from '../lib/importSheet.js'
import { CLIENT_KINDS, classifyProspects, downloadProspectTemplate, instagramHandle, PROSPECT_BADGE, PROSPECT_FIELDS, PROSPECT_KINDS, PROSPECT_STATUSES, readProspectRows } from '../lib/prospects.js'
import { useData } from '../lib/useData.js'
import Button from './Button.jsx'
import { EmptyState, Loading } from './Feedback.jsx'
import Field from './Field.jsx'
import Modal from './Modal.jsx'
import Panel from './Panel.jsx'

const load = async () => {
  const [list, clients] = await Promise.all([loadProspects(), listClients()])
  return { ...list, clients }
}

const EMPTY = { kind: PROSPECT_KINDS[0], name: '', category: '', city: '', instagram: '', website: '', phone: '', email: '', source_url: '', notes: '' }
const STATE_LABEL = { new: 'جديد', duplicate: 'مكرر في الملف', exists: 'موجود مسبقاً', invalid: 'ناقص' }
const STATE_BADGE = { new: 'badge-success', duplicate: 'badge-warning', exists: 'badge-neutral', invalid: 'badge-danger' }
const link = (url) => (/^https?:\/\//i.test(url) ? url : `https://${url}`)

function ProspectForm({ prospect, onClose, onSaved }) {
  const toast = useToast()
  const [form, setForm] = useState(() => ({ ...EMPTY, ...(prospect || {}) }))
  const [saving, setSaving] = useState(false)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const submit = async () => {
    if (!form.name.trim()) return toast(tr('اكتب الاسم'), 'error')
    setSaving(true)
    try {
      await saveProspect({ ...form, instagram: instagramHandle(form.instagram) }, prospect?.id)
      toast(tr('✅ حُفظت'))
      onSaved()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }
  const input = (k, props = {}) => <input id={`prospect-${k}`} className="input" value={form[k]} onChange={set(k)} {...props} />
  return (
    <Modal
      title={prospect ? tr('تعديل فرصة') : tr('فرصة جديدة')}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {tr('إلغاء')}
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? tr('جاري...') : tr('حفظ')}
          </Button>
        </>
      }
    >
      <div className="form-grid">
        <Field label={tr('الاسم')} required>
          {input('name')}
        </Field>
        <Field label={tr('النوع')}>
          <select id="prospect-kind" className="input" value={form.kind} onChange={set('kind')}>
            {PROSPECT_KINDS.map((k) => (
              <option key={k} value={k}>
                {tr(k)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={tr('النشاط')}>{input('category')}</Field>
        <Field label={tr('المدينة')}>{input('city')}</Field>
        <Field label={tr('إنستغرام')}>{input('instagram', { dir: 'ltr', placeholder: '@account' })}</Field>
        <Field label={tr('الموقع الإلكتروني')}>{input('website', { dir: 'ltr' })}</Field>
        <Field label={tr('الهاتف')}>{input('phone', { dir: 'ltr' })}</Field>
        <Field label={tr('البريد')}>{input('email', { dir: 'ltr', type: 'email' })}</Field>
      </div>
      <Field label={tr('رابط المصدر')} hint={tr('أين وجدت هذه المعلومة — حتى يمكن التحقق منها')}>
        {input('source_url', { dir: 'ltr', placeholder: 'https://' })}
      </Field>
      <Field label={tr('ملاحظات')}>
        <textarea id="prospect-notes" className="input" rows={3} value={form.notes} onChange={set('notes')} />
      </Field>
    </Modal>
  )
}

function ProspectImport({ prospects, clients, onClose, onDone }) {
  const toast = useToast()
  const [rows, setRows] = useState(null)
  const [progress, setProgress] = useState(null)
  const choose = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const sheet = /\.csv$/i.test(file.name) || file.type === 'text/csv' ? parseCsv(await file.text()) : await readFirstSheet(file)
      setRows(classifyProspects(readProspectRows(sheet), prospects, clients))
    } catch (err) {
      toast(tr('تعذّر قراءة الملف: {0}', [err.message]), 'error')
    }
  }
  const fresh = rows?.filter((r) => r.state === 'new') || []
  const count = (s) => rows?.filter((r) => r.state === s).length || 0
  const save = async () => {
    setProgress(0)
    try {
      const res = await importProspects(fresh, setProgress)
      toast(tr('✅ أُضيفت {0} فرصة', [res.added]) + (res.skipped ? ` • ${tr('{0} موجودة مسبقاً', [res.skipped])}` : ''))
      onDone()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setProgress(null)
    }
  }
  return (
    <Modal
      title={tr('استيراد فرص من ملف')}
      subtitle={tr('Excel أو CSV — يُضاف الجديد فقط، والمكرر والموجود يُتجاهل')}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {tr('إلغاء')}
          </Button>
          <Button onClick={save} disabled={!fresh.length || progress !== null}>
            {progress !== null ? tr('جاري... {0}/{1}', [progress, fresh.length]) : tr('إضافة {0} فرصة', [fresh.length])}
          </Button>
        </>
      }
    >
      <div className="toolbar mb-16">
        <input id="prospect-file" type="file" accept=".xlsx,.csv" className="input" onChange={choose} />
        <Button variant="ghost" onClick={downloadProspectTemplate}>
          {tr('⬇ نموذج الملف')}
        </Button>
      </div>
      {rows && (
        <>
          <div className="small mb-16">
            {Object.keys(STATE_LABEL)
              .map((s) => `${tr(STATE_LABEL[s])}: ${count(s)}`)
              .join(' • ')}
            {fresh.some((r) => r.noSource) && <div className="muted mt-4">{tr('⚠️ بعض الصفوف بلا رابط مصدر — يُنصح بإضافته للتحقق لاحقاً')}</div>}
          </div>
          <div className="table-wrap" style={{ maxHeight: 360 }}>
            <table className="table table-compact">
              <thead>
                <tr>
                  <th>{tr('السطر')}</th>
                  <th>{tr('الاسم')}</th>
                  <th>{tr('النوع')}</th>
                  <th>{tr('المدينة')}</th>
                  <th>{tr('الحالة')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.line}>
                    <td className="num small">{r.line}</td>
                    <td>{r.name || '—'}</td>
                    <td className="small">{tr(r.kind)}</td>
                    <td className="small">{r.city || '—'}</td>
                    <td>
                      <span className={`badge ${STATE_BADGE[r.state]}`}>{tr(STATE_LABEL[r.state])}</span> <span className="tiny muted">{r.reason}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Modal>
  )
}

/** The code the scheduled daily research uses — shown once to the admin. */
function FeedPanel({ since, onChanged }) {
  const toast = useToast()
  const [token, setToken] = useState('')
  const rotate = async () => {
    if (since && !confirm(tr('سيتوقف الرمز الحالي عن العمل. متابعة؟'))) return
    try {
      setToken(await rotateFeedToken())
      onChanged()
    } catch (err) {
      toast(err.message, 'error')
    }
  }
  const revoke = async () => {
    if (!confirm(tr('إيقاف البحث اليومي؟ لن يستطيع إضافة أي فرصة بعد الآن.'))) return
    try {
      await revokeFeedToken()
      toast(tr('أُوقف البحث اليومي'))
      onChanged()
    } catch (err) {
      toast(err.message, 'error')
    }
  }
  return (
    <Panel icon="🤖" title={tr('البحث اليومي')} subtitle={since ? tr('مفعّل منذ {0} — يضيف ما يجده بحالة «جديد» لتراجعه', [formatDate(since)]) : tr('غير مفعّل')} className="mb-16">
      <div className="panel-pad">
        <div className="toolbar">
          <Button variant="outline" onClick={rotate}>
            {since ? tr('رمز جديد') : tr('إنشاء رمز البحث اليومي')}
          </Button>
          {since && (
            <Button variant="ghost" onClick={revoke}>
              {tr('إيقاف')}
            </Button>
          )}
        </div>
        {token && (
          <div className="alert alert-warning mt-4">
            <div className="strong">{tr('انسخ الرمز الآن — لن يظهر مرة أخرى:')}</div>
            <code className="ltr" style={{ wordBreak: 'break-all', userSelect: 'all' }}>
              {token}
            </code>
            <div className="small mt-4">{tr('ضعه في إعدادات بيئة Claude باسم SOVA_RESEARCH_TOKEN. لا ترسله في أي محادثة ولا تضعه في الكود.')}</div>
            <Button size="sm" variant="outline" onClick={() => navigator.clipboard?.writeText(token).then(() => toast(tr('نُسخ')))}>
              {tr('نسخ')}
            </Button>
          </div>
        )}
      </div>
    </Panel>
  )
}

/**
 * «البحث والفرص»: possible exhibitors, sponsors and partners, venues and events — each with the
 * link it was found at — checked by the team and turned into clients when they fit.
 */
export default function Prospects() {
  const toast = useToast()
  const { role, session } = useAuth()
  const uid = session?.user?.id
  const canWrite = useCan('data.write')
  const { data, loading, reload } = useData(load, null)
  const [q, setQ] = useState('')
  const [kind, setKind] = useState('')
  const [status, setStatus] = useState('')
  const [editing, setEditing] = useState(null) // null | {} (new) | prospect
  const [importing, setImporting] = useState(false)
  if (loading || !data) return <Loading />
  if (!data.ready) return <div className="alert alert-warning">{tr('هذا القسم يحتاج تحديث قاعدة البيانات 035. شغّل ملف التحديث في Supabase ثم حدّث الصفحة.')}</div>

  const run = async (fn, done) => {
    try {
      await fn()
      if (done) toast(done)
      reload()
    } catch (err) {
      toast(err.message, 'error')
    }
  }
  const needle = q.trim().toLowerCase()
  const shown = data.prospects.filter(
    (p) =>
      (!kind || p.kind === kind) &&
      (!status || p.status === status) &&
      (!needle || [p.name, p.category, p.city, p.instagram, p.phone, p.notes].some((v) => String(v || '').toLowerCase().includes(needle))),
  )
  const byKind = (k) => data.prospects.filter((p) => p.kind === k).length
  const fresh = data.prospects.filter((p) => p.status === 'جديد').length
  const exportCsv = () =>
    downloadCsv(`${tr('الفرص')}.csv`, shown, [
      ...PROSPECT_FIELDS.map((f) => ({ label: f.headers[0], value: (p) => (f.key === 'kind' ? tr(p.kind) : p[f.key]) })),
      { label: tr('الحالة'), value: (p) => tr(p.status) },
      { label: tr('أُضيفت'), value: (p) => formatDate(p.created_at) },
    ])

  return (
    <>
      {role === 'admin' && <FeedPanel since={data.feedSince} onChanged={reload} />}
      <Panel
        icon="🔎"
        title={tr('البحث والفرص')}
        subtitle={[...PROSPECT_KINDS.map((k) => `${tr(k)} ${byKind(k)}`), tr('{0} بانتظار المراجعة', [fresh])].join(' • ')}
      >
        <div className="toolbar panel-pad">
          <input id="prospect-search" className="input toolbar-search" placeholder={tr('بحث بالاسم أو النشاط أو المدينة...')} value={q} onChange={(e) => setQ(e.target.value)} />
          <select id="prospect-kind-filter" className="input toolbar-select" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="">{tr('كل الأنواع')}</option>
            {PROSPECT_KINDS.map((k) => (
              <option key={k} value={k}>
                {tr(k)}
              </option>
            ))}
          </select>
          <select id="prospect-status-filter" className="input toolbar-select" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">{tr('كل الحالات')}</option>
            {PROSPECT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {tr(s)}
              </option>
            ))}
          </select>
          {canWrite && <Button onClick={() => setEditing({})}>{tr('+ فرصة')}</Button>}
          {canWrite && (
            <Button variant="outline" onClick={() => setImporting(true)}>
              {tr('استيراد ملف')}
            </Button>
          )}
          <Button variant="ghost" onClick={exportCsv} disabled={!shown.length}>
            {tr('تصدير')}
          </Button>
        </div>
        {shown.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{tr('الاسم')}</th>
                  <th>{tr('النوع')}</th>
                  <th>{tr('المدينة')}</th>
                  <th>{tr('التواصل')}</th>
                  <th>{tr('الحالة')}</th>
                  <th>{tr('أُضيفت')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {shown.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div className="strong">{p.name}</div>
                      <div className="tiny muted">
                        {[p.category, p.origin !== 'يدوي' && tr(p.origin)].filter(Boolean).join(' • ')}
                        {p.source_url && (
                          <>
                            {' • '}
                            <a href={link(p.source_url)} target="_blank" rel="noopener noreferrer">
                              {tr('المصدر')}
                            </a>
                          </>
                        )}
                      </div>
                    </td>
                    <td className="small">{tr(p.kind)}</td>
                    <td className="small">{p.city || '—'}</td>
                    <td className="small ltr">
                      {p.instagram && (
                        <a href={`https://www.instagram.com/${p.instagram}/`} target="_blank" rel="noopener noreferrer">
                          @{p.instagram}
                        </a>
                      )}
                      {p.phone && <div>{p.phone}</div>}
                      {p.website && (
                        <div>
                          <a href={link(p.website)} target="_blank" rel="noopener noreferrer">
                            {p.website.replace(/^https?:\/\//, '').slice(0, 30)}
                          </a>
                        </div>
                      )}
                      {!p.instagram && !p.phone && !p.website && '—'}
                    </td>
                    <td>
                      {canWrite && p.status !== 'أصبح عميلاً' ? (
                        <select
                          className="input input-compact"
                          aria-label={tr('الحالة')}
                          value={p.status}
                          onChange={(e) => run(() => setProspectStatus(p.id, e.target.value))}
                        >
                          {PROSPECT_STATUSES.filter((s) => s !== 'أصبح عميلاً').map((s) => (
                            <option key={s} value={s}>
                              {tr(s)}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className={`badge ${PROSPECT_BADGE[p.status]}`}>{tr(p.status)}</span>
                      )}
                    </td>
                    <td className="small nowrap">{formatDate(p.created_at)}</td>
                    <td className="nowrap">
                      {canWrite && (
                        <Button size="sm" variant="ghost" onClick={() => setEditing(p)}>
                          {tr('تعديل')}
                        </Button>
                      )}
                      {canWrite && CLIENT_KINDS.includes(p.kind) && !p.client_id && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => confirm(tr('إضافة «{0}» إلى العملاء بحالة «محتمل»؟', [p.name])) && run(() => makeClient(p), tr('✅ أُضيف إلى العملاء'))}
                        >
                          {tr('← عميل')}
                        </Button>
                      )}
                      {(role === 'admin' || (canWrite && p.created_by === uid)) && (
                        <Button size="sm" variant="ghost" onClick={() => confirm(tr('حذف «{0}»؟', [p.name])) && run(() => deleteProspect(p.id), tr('تم الحذف'))}>
                          {tr('حذف')}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon="🔎" text={data.prospects.length ? tr('لا توجد نتائج لهذا البحث') : tr('لا توجد فرص بعد — أضف فرصة أو استورد ملفاً')} />
        )}
      </Panel>

      {editing && (
        <ProspectForm
          prospect={editing.id ? editing : null}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            reload()
          }}
        />
      )}
      {importing && (
        <ProspectImport
          prospects={data.prospects}
          clients={data.clients}
          onClose={() => setImporting(false)}
          onDone={() => {
            setImporting(false)
            reload()
          }}
        />
      )}
    </>
  )
}
