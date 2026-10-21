import { useState } from 'react'
import { Link } from 'react-router-dom'
import { listClients } from '../api/clients.js'
import { listExhibitions } from '../api/exhibitions.js'
import {
  deleteProspect,
  importProspects,
  loadProspects,
  makeClient,
  requestResearchNow,
  revokeFeedToken,
  rotateFeedToken,
  saveProspect,
  saveResearchPlan,
  setProspectStatus,
  setResearchEnabled,
} from '../api/prospects.js'
import { useAuth, useCan } from '../context/AuthContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { columnOptions, parseCsv } from '../lib/clientImport.js'
import { CATEGORIES, CITIES, FORM_SECTORS } from '../lib/constants.js'
import { downloadCsv } from '../lib/csv.js'
import { exhibitionTitle, formatDate } from '../lib/format.js'
import { tr } from '../lib/i18n.js'
import { pickSheet, readSheets } from '../lib/importSheet.js'
import {
  CLIENT_KINDS,
  classifyProspects,
  detectProspectColumns,
  downloadProspectTemplate,
  FIT_LABELS,
  FIT_STARS,
  instagramHandle,
  PROSPECT_BADGE,
  PROSPECT_FIELDS,
  PROSPECT_KINDS,
  PROSPECT_STATUSES,
  readProspectRows,
  researchHealth,
  researchSwitch,
  sortProspects,
} from '../lib/prospects.js'
import { useData } from '../lib/useData.js'
import Button from './Button.jsx'
import { EmptyState, Loading } from './Feedback.jsx'
import Field from './Field.jsx'
import Modal from './Modal.jsx'
import Panel from './Panel.jsx'

const load = async () => {
  const [list, clients, exhibitions] = await Promise.all([loadProspects(), listClients(), listExhibitions('id, name, city, mall, date_from, date_to, status').catch(() => [])])
  return { ...list, clients, exhibitions }
}

const EMPTY = { kind: PROSPECT_KINDS[0], name: '', category: '', city: '', instagram: '', website: '', phone: '', email: '', source_url: '', notes: '' }
const STATE_LABEL = { new: 'جديد', duplicate: 'مكرر في الملف', exists: 'موجود مسبقاً', invalid: 'ناقص' }
const STATE_BADGE = { new: 'badge-success', duplicate: 'badge-warning', exists: 'badge-neutral', invalid: 'badge-danger' }
/** Days left before an unreviewed Google Maps find is removed (Google's 30-day rule), else null. */
const mapsDaysLeft = (p) => (p.origin === 'خرائط جوجل' && p.status === 'جديد' ? Math.max(0, 30 - Math.floor((Date.now() - new Date(p.created_at)) / 864e5)) : null)
const link = (url) => (/^https?:\/\//i.test(url) ? url : `https://${url}`)

function ProspectForm({ prospect, withFit, onClose, onSaved }) {
  const toast = useToast()
  const [form, setForm] = useState(() => ({ ...EMPTY, ...(prospect || {}) }))
  const [saving, setSaving] = useState(false)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const submit = async () => {
    if (!form.name.trim()) return toast(tr('اكتب الاسم'), 'error')
    setSaving(true)
    try {
      const row = { ...form, instagram: instagramHandle(form.instagram) }
      if (withFit) row.fit = form.fit ? Number(form.fit) : null
      else delete row.fit
      if (!withFit) delete row.fit_reason
      await saveProspect(row, prospect?.id)
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
      {withFit && (
        <div className="form-grid">
          <Field label={tr('مدى المناسبة')}>
            <select id="prospect-fit" className="input" value={form.fit || ''} onChange={set('fit')}>
              <option value="">{tr('غير مقيّم')}</option>
              {[3, 2, 1].map((f) => (
                <option key={f} value={f}>
                  {FIT_STARS[f]} {tr(FIT_LABELS[f])}
                </option>
              ))}
            </select>
          </Field>
          <Field label={tr('سبب التقييم')}>{input('fit_reason')}</Field>
        </div>
      )}
      <Field label={tr('رابط المصدر')} hint={tr('أين وجدت هذه المعلومة — حتى يمكن التحقق منها')}>
        {input('source_url', { dir: 'ltr', placeholder: 'https://' })}
      </Field>
      <Field label={tr('ملاحظات')}>
        <textarea id="prospect-notes" className="input" rows={3} value={form.notes} onChange={set('notes')} />
      </Field>
    </Modal>
  )
}

const GUESSED_LABEL = { kind: 'النوع', category: 'النشاط', city: 'المدينة', instagram: 'إنستغرام' }

/**
 * «فرز ملف Excel»: give it any list (shops, companies, factories…). It finds the columns (or you
 * pick them), sorts every row — kind, activity, town, Instagram, from the row's own words where
 * the file leaves them empty — sets aside repeated rows and names already on file, and saves the
 * rows you keep.
 */
function ProspectImport({ prospects, clients, onClose, onDone }) {
  const toast = useToast()
  const [sheet, setSheet] = useState(null) // { name, rows, headerRow }
  const [cols, setCols] = useState({})
  const [mapping, setMapping] = useState(false)
  const [picked, setPicked] = useState({}) // line → include
  const [kinds, setKinds] = useState({}) // line → kind chosen by hand
  const [show, setShow] = useState('new')
  const [progress, setProgress] = useState(null)
  const choose = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const sheets = (/\.csv$/i.test(file.name) || file.type === 'text/csv' ? [{ name: file.name, rows: parseCsv(await file.text()) }] : await readSheets(file)).filter((x) => x.rows.length)
      if (!sheets.length) return toast(tr('الملف فارغ'), 'error')
      const raw = sheets[pickSheet(sheets, detectProspectColumns)].rows
      const found = detectProspectColumns(raw)
      setSheet({ name: file.name, rows: raw, headerRow: found.headerRow })
      setCols(found.cols)
      setPicked({})
      setKinds({})
      setMapping(found.headerRow < 0)
      if (found.headerRow < 0) toast(tr('لم أتعرف على أسماء الأعمدة — اختر عمود كل حقل'), 'warn')
    } catch (err) {
      toast(tr('تعذّر قراءة الملف: {0}', [err.message]), 'error')
    }
  }
  let rows = []
  let readError = ''
  if (sheet && cols.name !== undefined) {
    try {
      rows = classifyProspects(readProspectRows(sheet.rows, { headerRow: sheet.headerRow, cols }), prospects, clients).map((r) => ({ ...r, kind: kinds[r.line] || r.kind }))
    } catch (err) {
      readError = err.message
    }
  }
  const included = (r) => r.state !== 'invalid' && (r.line in picked ? picked[r.line] : r.state === 'new')
  const chosen = rows.filter(included)
  const count = (st) => rows.filter((r) => r.state === st).length
  const visible = show === 'all' ? rows : rows.filter((r) => r.state === show)
  const byKind = PROSPECT_KINDS.map((k) => [k, chosen.filter((r) => r.kind === k).length]).filter(([, n]) => n)
  const sectors = Object.entries(chosen.reduce((m, r) => ((m[r.category || tr('بدون نشاط')] = (m[r.category || tr('بدون نشاط')] || 0) + 1), m), {})).sort((a, b) => b[1] - a[1])
  const options = sheet ? columnOptions(sheet.rows, sheet.headerRow) : []
  const setCol = (key) => (e) =>
    setCols((c) => {
      const next = { ...c }
      if (e.target.value === '') delete next[key]
      else next[key] = +e.target.value
      return next
    })
  const save = async () => {
    setProgress(0)
    try {
      const notes = (r) => [r.notes, tr('من ملف: {0}', [sheet.name])].filter(Boolean).join(' — ')
      const res = await importProspects(
        chosen.map((r) => ({ ...r, notes: notes(r) })),
        setProgress,
      )
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
      title={tr('📥 فرز ملف Excel')}
      subtitle={tr('أعطه أي قائمة (محلات، شركات، مصانع…) — يتعرف على الأعمدة، ويفرز كل صف، ويستبعد المكرر والموجود، ثم يحفظ ما تختاره')}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {tr('إلغاء')}
          </Button>
          <Button onClick={save} disabled={!chosen.length || progress !== null}>
            {progress !== null ? tr('جاري... {0}/{1}', [progress, chosen.length]) : tr('إضافة {0} فرصة', [chosen.length])}
          </Button>
        </>
      }
    >
      <div className="toolbar mb-16">
        <input id="prospect-file" type="file" accept=".xlsx,.csv" className="input" onChange={choose} />
        <Button variant="ghost" onClick={downloadProspectTemplate}>
          {tr('⬇ نموذج الملف')}
        </Button>
        {sheet && (
          <Button variant="ghost" onClick={() => setMapping((m) => !m)}>
            {mapping ? tr('إخفاء الأعمدة') : tr('تعديل الأعمدة')}
          </Button>
        )}
      </div>

      {sheet && mapping && (
        <div className="form-grid mb-16">
          {PROSPECT_FIELDS.map((f) => (
            <Field key={f.key} label={tr(f.label)} required={f.key === 'name'}>
              <select id={`map-${f.key}`} className="input" value={cols[f.key] ?? ''} onChange={setCol(f.key)}>
                <option value="">{tr('— لا يوجد —')}</option>
                {options.map((o) => (
                  <option key={o.index} value={o.index}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
          ))}
        </div>
      )}

      {sheet && cols.name === undefined && <div className="alert alert-warning">{tr('اختر عمود «الاسم» على الأقل')}</div>}
      {readError && <div className="alert alert-danger">{readError}</div>}

      {rows.length > 0 && (
        <>
          <div className="emp-kpis mb-16">
            <div className="emp-kpi">
              <div className="emp-kpi-value num">{chosen.length}</div>
              <div className="emp-kpi-label">{tr('ستُضاف')}</div>
            </div>
            <div className="emp-kpi">
              <div className="emp-kpi-value num">{count('duplicate') + count('exists')}</div>
              <div className="emp-kpi-label">{tr('مكرر أو موجود — استُبعد')}</div>
            </div>
            <div className="emp-kpi">
              <div className="emp-kpi-value num">{count('invalid')}</div>
              <div className="emp-kpi-label">{tr('ناقص (بلا اسم)')}</div>
            </div>
          </div>
          <div className="small mb-16">
            <div>
              <strong>{tr('حسب النوع:')}</strong> {byKind.map(([k, n]) => `${tr(k)} ${n}`).join(' • ') || '—'}
            </div>
            <div>
              <strong>{tr('حسب النشاط:')}</strong> {sectors.map(([k, n]) => `${tr(k)} ${n}`).join(' • ') || '—'}
            </div>
            <div className="muted">{tr('✨ = اقتراح من كلمات الصف لأن الملف تركه فارغاً — راجعه، ويمكنك تغيير النوع من القائمة')}</div>
          </div>
          <div className="chips-row mb-16">
            {[
              ['new', tr('جديد')],
              ['duplicate', tr('مكرر في الملف')],
              ['exists', tr('موجود مسبقاً')],
              ['invalid', tr('ناقص')],
              ['all', tr('الكل')],
            ].map(([id, label]) => (
              <button key={id} type="button" className={`chip-btn ${show === id ? 'active' : ''}`} onClick={() => setShow(id)}>
                {label} ({id === 'all' ? rows.length : count(id)})
              </button>
            ))}
          </div>
          <div className="table-wrap" style={{ maxHeight: 380 }}>
            <table className="table table-compact">
              <thead>
                <tr>
                  <th />
                  <th>{tr('الاسم')}</th>
                  <th>{tr('النوع')}</th>
                  <th>{tr('النشاط')}</th>
                  <th>{tr('المدينة')}</th>
                  <th>{tr('الهاتف')}</th>
                  <th>{tr('الحالة')}</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={r.line} className={included(r) ? '' : 'muted'}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={tr('إضافة السطر {0}', [r.line])}
                        checked={included(r)}
                        disabled={r.state === 'invalid'}
                        onChange={(e) => setPicked((m) => ({ ...m, [r.line]: e.target.checked }))}
                      />
                    </td>
                    <td>
                      <div>{r.name || '—'}</div>
                      <div className="tiny muted">{tr('السطر {0}', [r.line])}</div>
                    </td>
                    <td>
                      <select className="input input-compact" aria-label={tr('النوع')} value={r.kind} onChange={(e) => setKinds((m) => ({ ...m, [r.line]: e.target.value }))}>
                        {PROSPECT_KINDS.map((k) => (
                          <option key={k} value={k}>
                            {tr(k)}
                          </option>
                        ))}
                      </select>
                      {r.guessed.includes('kind') && !kinds[r.line] && <span title={tr(GUESSED_LABEL.kind)}> ✨</span>}
                    </td>
                    <td className="small">
                      {r.category ? tr(r.category) : '—'}
                      {r.guessed.includes('category') && ' ✨'}
                    </td>
                    <td className="small">
                      {r.city ? tr(r.city) : '—'}
                      {r.guessed.includes('city') && ' ✨'}
                    </td>
                    <td className="small ltr">{r.phone || '—'}</td>
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
function FeedPanel({ since, runs, onChanged }) {
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
        <HealthLine since={since} runs={runs} />
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

/** One line: is the daily research working, and when did it last report? */
function HealthLine({ since, runs }) {
  const h = researchHealth(runs, since)
  if (h.state === 'off') return null
  return (
    <div className={`alert ${h.state === 'late' ? 'alert-warning' : 'alert-success'} mb-16`}>
      {h.state === 'late'
        ? tr('⚠️ لم يصل تقرير من البحث اليومي منذ {0} يوم — تأكد من إعدادات البيئة (الرمز و *.supabase.co)', [Math.max(h.days, 1)])
        : h.last
          ? tr('✓ آخر تقرير: {0}', [formatDate(h.last)])
          : tr('✓ مفعّل — أول تقرير يصل بعد أول تشغيل صباحي')}
    </div>
  )
}

const SECTOR_OPTIONS = [...new Set([...FORM_SECTORS, ...CATEGORIES.filter((c) => c !== 'أخرى'), 'حلويات وقهوة', 'منتجات منزلية', 'حرف يدوية', 'منتجات أطفال'])]

/** What the daily research looks for. The admin edits it; everyone sees it. */
function ResearchPlan({ plan, exhibitions, editable, onSaved }) {
  const toast = useToast()
  const [form, setForm] = useState(() => ({ focus: plan.focus || '', cities: plan.cities || [], kinds: plan.kinds || [], sectors: plan.sectors || [], daily_limit: plan.daily_limit || 20 }))
  const [saving, setSaving] = useState(false)
  const toggle = (k, v) => setForm((f) => ({ ...f, [k]: f[k].includes(v) ? f[k].filter((x) => x !== v) : [...f[k], v] }))
  const today = new Date().toISOString().slice(0, 10)
  const upcoming = exhibitions.filter((e) => e.date_to >= today && !['منتهي', 'ملغى'].includes(e.status))
  const chips = (k, options) => (
    <div className="chips-row">
      {options.map((o) => (
        <button key={o} type="button" className={`chip-btn ${form[k].includes(o) ? 'active' : ''}`} aria-pressed={form[k].includes(o)} disabled={!editable} onClick={() => toggle(k, o)}>
          {tr(o)}
        </button>
      ))}
    </div>
  )
  const save = async () => {
    setSaving(true)
    try {
      await saveResearchPlan(form)
      toast(tr('✅ حُفظت خطة البحث — تُطبَّق من التشغيل القادم'))
      onSaved()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }
  return (
    <Panel icon="🧭" title={tr('خطة البحث')} subtitle={tr('ما يبحث عنه الموظف كل صباح. بدون اختيار = الكل')} className="mb-16">
      <div className="panel-pad">
        <Field label={tr('التركيز هذه الفترة')} hint={tr('مثال: عارضون لمعرض نزوى في ديسمبر — عطور وأزياء ومشاريع منزلية')}>
          <textarea id="research-focus" className="input" rows={2} value={form.focus} disabled={!editable} onChange={(e) => setForm((f) => ({ ...f, focus: e.target.value }))} />
        </Field>
        <Field label={tr('المدن')}>{chips('cities', CITIES)}</Field>
        <Field label={tr('الأنواع')}>{chips('kinds', PROSPECT_KINDS)}</Field>
        <Field label={tr('القطاعات')}>{chips('sectors', SECTOR_OPTIONS)}</Field>
        <Field label={tr('الحد اليومي')} hint={tr('من 1 إلى 30 — النظام يرفض ما يزيد عنه')}>
          <input
            id="research-limit"
            className="input"
            type="number"
            min="1"
            max="30"
            value={form.daily_limit}
            disabled={!editable}
            onChange={(e) => setForm((f) => ({ ...f, daily_limit: e.target.value }))}
          />
        </Field>
        <div className="section-label">{tr('المعارض القادمة — يبحث لها الموظف عن عارضين')}</div>
        {upcoming.length ? (
          <ul className="small">
            {upcoming.map((e) => (
              <li key={e.id}>
                {exhibitionTitle(e)} — {[tr(e.city), e.mall].filter(Boolean).join('، ')} • {formatDate(e.date_from)}
              </li>
            ))}
          </ul>
        ) : (
          <div className="muted small">{tr('لا توجد معارض قادمة مسجلة')}</div>
        )}
        {editable && (
          <div className="mt-4">
            <Button onClick={save} disabled={saving}>
              {saving ? tr('جاري...') : tr('حفظ الخطة')}
            </Button>
          </div>
        )}
      </div>
    </Panel>
  )
}

/** Every daily run: when, how many it added, and what it reported. */
function RunsLog({ runs }) {
  return (
    <Panel icon="📒" title={tr('سجل البحث اليومي')} subtitle={tr('آخر {0} تشغيل', [runs.length])}>
      {runs.length ? (
        <div className="table-wrap">
          <table className="table table-compact">
            <thead>
              <tr>
                <th>{tr('التاريخ')}</th>
                <th>{tr('أُضيفت')}</th>
                <th>{tr('مكرر')}</th>
                <th>{tr('التركيز')}</th>
                <th>{tr('الملخص')}</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <td className="small nowrap">{formatDate(r.run_at)}</td>
                  <td className="num">{r.added}</td>
                  <td className="num">{r.skipped}</td>
                  <td className="small">{r.focus || '—'}</td>
                  <td className="small">{r.summary || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState icon="📒" text={tr('لا توجد تقارير بعد — تظهر هنا بعد أول تشغيل صباحي')} />
      )}
    </Panel>
  )
}

/**
 * The research employee's switch, at the top of its page: on or off, «ابحث الآن», and what it is
 * doing now. The admin works the buttons; everyone sees the state.
 */
function ResearchSwitch({ data, admin, onChanged }) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const sw = researchSwitch(data.plan, data.runs)
  const health = researchHealth(data.runs, data.feedSince)
  if (!sw.supported) return null
  const act = async (fn, done) => {
    setBusy(true)
    try {
      await fn()
      toast(done)
      onChanged()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setBusy(false)
    }
  }
  const state = !sw.on
    ? { tone: 'off', icon: '⏸', text: tr('متوقف — لن يبحث حتى تشغّله') }
    : !data.feedSince
      ? { tone: 'warn', icon: '⚠️', text: tr('مفعّل، لكن رمز البحث اليومي غير موجود — أنشئه من «خطة البحث والسجل»') }
      : sw.requested
        ? { tone: 'wait', icon: '⏳', text: tr('طُلب بحث — يبدأ خلال ساعة على الأكثر (يفحص كل ساعة من 7 صباحاً إلى 9 مساءً)') }
        : health.state === 'late'
          ? { tone: 'warn', icon: '⚠️', text: tr('مفعّل، لكن لم يصل تقريره منذ {0} يوم', [Math.max(health.days || 1, 1)]) }
          : { tone: 'on', icon: '▶', text: health.last ? tr('يعمل — آخر بحث {0}، والتالي صباح الغد', [formatDate(health.last)]) : tr('يعمل — أول بحث خلال ساعة') }
  return (
    <div className={`research-switch research-switch-${state.tone}`}>
      <div className="research-switch-state">
        <span className="research-switch-icon" aria-hidden="true">
          {state.icon}
        </span>
        <div>
          <div className="strong">{sw.on ? tr('موظف البحث: يعمل') : tr('موظف البحث: متوقف')}</div>
          <div className="small">{state.text}</div>
        </div>
      </div>
      {admin && (
        <div className="research-switch-actions">
          {sw.on && (
            <Button disabled={busy || sw.requested || !data.feedSince} onClick={() => act(requestResearchNow, tr('⏳ طُلب البحث — يبدأ خلال ساعة'))}>
              {tr('🔎 ابحث الآن')}
            </Button>
          )}
          <Button
            variant={sw.on ? 'outline' : 'primary'}
            disabled={busy}
            onClick={() =>
              sw.on
                ? confirm(tr('إيقاف موظف البحث؟ لن يبحث ولن يضيف شيئاً حتى تشغّله.')) && act(() => setResearchEnabled(false), tr('⏸ أُوقف موظف البحث'))
                : act(() => setResearchEnabled(true), tr('▶ شُغّل موظف البحث'))
            }
          >
            {sw.on ? tr('⏸ إيقاف') : tr('▶ تشغيل')}
          </Button>
        </div>
      )}
    </div>
  )
}

/**
 * «البحث والفرص»: possible exhibitors, sponsors and partners, venues and events — each with the
 * link it was found at — checked by the team and turned into clients when they fit.
 */
export default function Prospects({ view = 'list' }) {
  const toast = useToast()
  const { role, session } = useAuth()
  const uid = session?.user?.id
  const canWrite = useCan('data.write')
  const { data, loading, reload } = useData(load, null)
  const [q, setQ] = useState('')
  const [kind, setKind] = useState('')
  const [status, setStatus] = useState('') // '' = everything but «غير مناسب»
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
  const withFit = data.plan !== null
  if (view === 'plan')
    return (
      <>
        <ResearchSwitch data={data} admin={role === 'admin'} onChanged={reload} />
        {role === 'admin' && <FeedPanel since={data.feedSince} runs={data.runs} onChanged={reload} />}
        {data.plan ? (
          <>
            <ResearchPlan key={data.plan.updated_at} plan={data.plan} exhibitions={data.exhibitions} editable={role === 'admin'} onSaved={reload} />
            <RunsLog runs={data.runs} />
          </>
        ) : (
          <div className="alert alert-warning">{tr('خطة البحث وسجله يحتاجان تحديث قاعدة البيانات 036. شغّل ملف التحديث في Supabase ثم حدّث الصفحة.')}</div>
        )}
      </>
    )

  const shown = sortProspects(data.prospects).filter(
    (p) =>
      (!kind || p.kind === kind) &&
      (status === 'all' || (status ? p.status === status : p.status !== 'غير مناسب')) &&
      (!needle ||
        [p.name, p.category, p.city, p.instagram, p.phone, p.notes].some((v) =>
          String(v || '')
            .toLowerCase()
            .includes(needle),
        )),
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
      <ResearchSwitch data={data} admin={role === 'admin'} onChanged={reload} />
      <div className="alert alert-info mb-16 db-split">
        <span>{tr('🔎 هنا ما استخرجه موظف البحث — منفصل عن قاعدة عملائك حتى تراجعه. «← عميل» ينقل المناسب منها إلى العملاء.')}</span>
        <Link to="/clients">{tr('📒 قاعدة بياناتك (العملاء) ←')}</Link>
      </div>
      <Panel icon="🔎" title={tr('البحث والفرص')} subtitle={[...PROSPECT_KINDS.map((k) => `${tr(k)} ${byKind(k)}`), tr('{0} بانتظار المراجعة', [fresh])].join(' • ')}>
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
            <option value="">{tr('كل الحالات (بدون غير المناسب)')}</option>
            <option value="all">{tr('الكل')}</option>
            {PROSPECT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {tr(s)}
              </option>
            ))}
          </select>
          {canWrite && <Button onClick={() => setEditing({})}>{tr('+ فرصة')}</Button>}
          {canWrite && (
            <Button variant="outline" onClick={() => setImporting(true)}>
              {tr('📥 فرز ملف Excel')}
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
                  {withFit && <th>{tr('المناسبة')}</th>}
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
                        {[p.category, p.origin !== 'يدوي' && tr(p.origin), mapsDaysLeft(p) !== null && tr('يُحذف بعد {0} يوم إن لم يُراجَع', [mapsDaysLeft(p)])].filter(Boolean).join(' • ')}
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
                    {withFit && (
                      <td className="nowrap" title={p.fit_reason || ''}>
                        {p.fit ? (
                          <>
                            <span className="fit-stars" aria-label={tr(FIT_LABELS[p.fit])}>
                              {FIT_STARS[p.fit]}
                            </span>
                            {p.fit_reason && <div className="tiny muted fit-reason">{p.fit_reason}</div>}
                          </>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                    )}
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
                        <select className="input input-compact" aria-label={tr('الحالة')} value={p.status} onChange={(e) => run(() => setProspectStatus(p.id, e.target.value))}>
                          {PROSPECT_STATUSES.filter((s) => s !== 'أصبح عميلاً' && (withFit || s !== 'غير مناسب')).map((s) => (
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
                      {canWrite && p.status === 'جديد' && (
                        <>
                          <Button size="sm" variant="outline" title={tr('راجعتها وهي مناسبة')} onClick={() => run(() => setProspectStatus(p.id, 'تم التحقق'), tr('✓ نُقلت إلى «تم التحقق»'))}>
                            {tr('✓ مناسب')}
                          </Button>
                          {withFit && (
                            <Button
                              size="sm"
                              variant="ghost"
                              title={tr('لا تناسب معارضنا — لن يضيفها البحث مرة أخرى')}
                              onClick={() => run(() => setProspectStatus(p.id, 'غير مناسب'), tr('نُقلت إلى «غير مناسب»'))}
                            >
                              {tr('✗ غير مناسب')}
                            </Button>
                          )}
                        </>
                      )}
                      {canWrite && (
                        <Button size="sm" variant="ghost" onClick={() => setEditing(p)}>
                          {tr('تعديل')}
                        </Button>
                      )}
                      {canWrite && CLIENT_KINDS.includes(p.kind) && !p.client_id && (
                        <Button size="sm" variant="outline" onClick={() => confirm(tr('إضافة «{0}» إلى العملاء بحالة «محتمل»؟', [p.name])) && run(() => makeClient(p), tr('✅ أُضيف إلى العملاء'))}>
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
          withFit={withFit}
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
