import { useState } from 'react'
import { Link } from 'react-router-dom'
import { deleteAdvisorItem, saveAdvisorItem, setAdvisorStatus } from '../api/advisor.js'
import { useToast } from '../context/ToastContext.jsx'
import { ADVISOR_KINDS, ADVISOR_PRIORITIES, ADVISOR_STATUSES, isOpen, KIND_ICON, PRIORITY_BADGE, sortAdvisorItems } from '../lib/advisor.js'
import { formatDate } from '../lib/format.js'
import { tr } from '../lib/i18n.js'
import Button from './Button.jsx'
import DateInput from './DateInput.jsx'
import { EmptyState } from './Feedback.jsx'
import Field, { SelectOptions } from './Field.jsx'
import Modal from './Modal.jsx'
import Panel from './Panel.jsx'

const TONE = {
  danger: { badge: 'badge-danger', label: 'مشكلة' },
  warning: { badge: 'badge-warning', label: 'ينتظر متابعة' },
  info: { badge: 'badge-info', label: 'اقتراح' },
}

/** Add or edit one task, suggestion or problem. */
export function AdvisorForm({ item, onClose, onSaved }) {
  const toast = useToast()
  const [form, setForm] = useState(() => ({ kind: 'مهمة', priority: 'مهمة', title: '', details: '', due_date: '', link: '', ...item }))
  const [saving, setSaving] = useState(false)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const submit = async () => {
    if (!form.title.trim()) return toast(tr('اكتب عنوان المهمة'), 'error')
    setSaving(true)
    try {
      await saveAdvisorItem(form, item?.id)
      toast(tr('✅ حُفظت'))
      onSaved()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }
  return (
    <Modal
      title={item?.id ? tr('تعديل') : tr('مهمة أو اقتراح جديد')}
      onClose={onClose}
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
      <Field label={tr('العنوان')} required>
        <input id="advisor-title" className="input" maxLength={200} value={form.title} onChange={set('title')} placeholder={tr('مثال: تجديد الشهادة الضريبية')} />
      </Field>
      <div className="form-grid">
        <Field label={tr('النوع')}>
          <SelectOptions id="advisor-kind" options={ADVISOR_KINDS} placeholder={null} value={form.kind} onChange={set('kind')} />
        </Field>
        <Field label={tr('الأولوية')}>
          <SelectOptions id="advisor-priority" options={ADVISOR_PRIORITIES} placeholder={null} value={form.priority} onChange={set('priority')} />
        </Field>
        <Field label={tr('الموعد')}>
          <DateInput value={form.due_date || ''} onChange={set('due_date')} />
        </Field>
      </div>
      <Field label={tr('التفاصيل أو الحل')}>
        <textarea id="advisor-details" className="input" rows={3} maxLength={2000} value={form.details} onChange={set('details')} />
      </Field>
    </Modal>
  )
}

/** The owner's list: tasks, suggestions and problems, with their state. */
export function AdvisorTasks({ items, today, onEdit, onChanged }) {
  const toast = useToast()
  const [kind, setKind] = useState('')
  const [showDone, setShowDone] = useState(false)
  const run = async (fn, done) => {
    try {
      await fn()
      toast(done)
      onChanged()
    } catch (err) {
      toast(err.message, 'error')
    }
  }
  const doneCount = items.filter((i) => i.status === 'تمت').length
  const list = sortAdvisorItems(items).filter((i) => (!kind || i.kind === kind) && (showDone || i.status !== 'تمت'))
  return (
    <Panel icon="📋" title={tr('المهام والاقتراحات')} subtitle={tr('كل ما عليك وما يقترحه الموظف — علّم ما أنجزته ليبقى أمامك ما تبقّى فقط')}>
      <div className="toolbar panel-pad">
        <div className="chips-row">
          {['', ...ADVISOR_KINDS].map((k) => (
            <button key={k || 'all'} type="button" className={`chip-btn ${kind === k ? 'active' : ''}`} aria-pressed={kind === k} onClick={() => setKind(k)}>
              {k ? `${KIND_ICON[k]} ${tr(k)}` : tr('الكل')} <strong>{items.filter((i) => isOpen(i) && (!k || i.kind === k)).length}</strong>
            </button>
          ))}
        </div>
        {doneCount > 0 && (
          <label className="small nowrap">
            <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> {tr('إظهار المنجز ({0})', [doneCount])}
          </label>
        )}
      </div>
      {list.length ? (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{tr('المهمة')}</th>
                <th>{tr('الأولوية')}</th>
                <th>{tr('الموعد')}</th>
                <th>{tr('الحالة')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.map((i) => (
                <tr key={i.id} className={i.status === 'تمت' ? 'muted' : ''}>
                  <td>
                    <div className="strong">
                      {KIND_ICON[i.kind]} {tr(i.title)}
                    </div>
                    {i.details && <div className="tiny muted advisor-details">{tr(i.details)}</div>}
                    {i.origin === 'المراجعة اليومية' && <span className="badge badge-info tiny">{tr('من المراجعة اليومية')}</span>}
                  </td>
                  <td>
                    <span className={`badge ${PRIORITY_BADGE[i.priority]}`}>{tr(i.priority)}</span>
                  </td>
                  <td className={`small nowrap ${isOpen(i) && i.due_date && i.due_date < today ? 'text-dng strong' : ''}`}>{i.due_date ? formatDate(i.due_date) : '—'}</td>
                  <td>
                    <select
                      className="input input-compact"
                      aria-label={tr('الحالة')}
                      value={i.status}
                      onChange={(e) => run(() => setAdvisorStatus(i.id, e.target.value), e.target.value === 'تمت' ? tr('✅ أُنجزت') : tr('تم التحديث'))}
                    >
                      {ADVISOR_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {tr(s)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="nowrap">
                    {i.link && (
                      <Link className="btn btn-sm btn-outline" to={i.link}>
                        {tr('افتح ←')}
                      </Link>
                    )}{' '}
                    <Button size="sm" variant="ghost" onClick={() => onEdit(i)}>
                      {tr('تعديل')}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => confirm(tr('حذف «{0}»؟', [tr(i.title)])) && run(() => deleteAdvisorItem(i.id), tr('تم الحذف'))}>
                      {tr('حذف')}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState icon="✅" text={items.length ? tr('لا شيء هنا — كل شيء منجز') : tr('لا توجد مهام بعد — اضغط «+ مهمة أو اقتراح»')} />
      )}
    </Panel>
  )
}

/** The live review of the site: each finding, its solution, and a way to keep it on the list. */
export function AdvisorReview({ review, items, ready, onChanged }) {
  const toast = useToast()
  const kept = new Set(items.map((i) => i.ref).filter(Boolean))
  const keep = async (r) => {
    try {
      await saveAdvisorItem({
        ref: `live:${r.ref}`,
        kind: r.tone === 'info' ? 'اقتراح' : r.tone === 'danger' ? 'مشكلة' : 'مهمة',
        priority: r.tone === 'danger' ? 'عاجلة' : r.tone === 'warning' ? 'مهمة' : 'عادية',
        title: tr(r.text, r.args),
        details: tr(r.fix),
        link: r.link,
      })
      toast(tr('✅ أُضيفت لمهامك'))
      onChanged()
    } catch (err) {
      toast(err.message, 'error')
    }
  }
  return (
    <Panel icon="🔍" title={tr('مراجعة الموقع الآن')} subtitle={tr('محسوبة من السجلات نفسها لحظة فتح الصفحة — مع الحل المقترح لكل ملاحظة')}>
      {review.length ? (
        <ul className="advisor-review">
          {review.map((r) => (
            <li key={r.ref} className={`advisor-finding advisor-${r.tone}`}>
              <div className="advisor-finding-head">
                <span className={`badge ${TONE[r.tone].badge}`}>{tr(TONE[r.tone].label)}</span>
                <strong>{tr(r.text, r.args)}</strong>
              </div>
              <div className="small muted">💡 {tr(r.fix)}</div>
              <div className="advisor-finding-actions">
                {r.link && (
                  <Link className="btn btn-sm btn-outline" to={r.link}>
                    {tr('افتح ←')}
                  </Link>
                )}
                {ready &&
                  (kept.has(`live:${r.ref}`) ? (
                    <span className="tiny muted">{tr('✓ في مهامك')}</span>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => keep(r)}>
                      {tr('+ أضفها لمهامي')}
                    </Button>
                  ))}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon="✅" text={tr('لا ملاحظات الآن — كل شيء في مكانه')} />
      )}
    </Panel>
  )
}
