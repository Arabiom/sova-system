import { useState } from 'react'
import { Link } from 'react-router-dom'
import { deleteReferrer, payReferrer, saveReferrer, validateReferrer } from '../../api/referrals.js'
import Button from '../../components/Button.jsx'
import DateInput from '../../components/DateInput.jsx'
import { EmptyState } from '../../components/Feedback.jsx'
import Field from '../../components/Field.jsx'
import Modal from '../../components/Modal.jsx'
import Panel from '../../components/Panel.jsx'
import StatCard from '../../components/StatCard.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { exhibitionLabel, formatDate, formatOMR, num, todayISO } from '../../lib/format.js'
import { tr } from '../../lib/i18n.js'
import { referralSummary } from '../../lib/referrals.js'

const EMPTY = { name: '', phone: '', user_id: '', rate: '', active: true, notes: '' }

function ReferrerForm({ initial, id, staff, onClose, onSaved }) {
  const toast = useToast()
  const [form, setForm] = useState(initial || EMPTY)
  const [saving, setSaving] = useState(false)
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))
  const pickStaff = (e) => {
    const s = staff.find((x) => x.user_id === e.target.value)
    setForm((f) => ({ ...f, user_id: e.target.value, name: f.name || s?.name || s?.email || '' }))
  }
  const submit = async () => {
    const errors = validateReferrer(form)
    if (errors.length) return toast(tr('أكمل: {0}', [errors.map((x) => tr(x)).join(tr('، '))]), 'error')
    setSaving(true)
    try {
      await saveReferrer(form, id)
      toast(id ? tr('✅ تم التحديث') : tr('✅ تمت إضافة {0}', [form.name.trim()]))
      onSaved()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }
  return (
    <Modal
      title={id ? tr('تعديل «{0}»', [initial.name]) : tr('إضافة من يستقطب المشاركين')}
      subtitle={tr('موظف أو وسيط من خارج الشركة، ونسبته من المبلغ الذي يدفعه كل مشارك يجلبه')}
      size="sm"
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
      <Field label={tr('موظف في النظام؟ (اختياري)')} hint={tr('اتركه فارغاً للوسيط من خارج الشركة')}>
        <select className="input" value={form.user_id || ''} onChange={pickStaff}>
          <option value="">{tr('— ليس موظفاً —')}</option>
          {staff.map((s) => (
            <option key={s.user_id} value={s.user_id}>
              {s.name || s.email}
            </option>
          ))}
        </select>
      </Field>
      <Field label={tr('الاسم')} required>
        <input className="input" value={form.name} onChange={set('name')} />
      </Field>
      <div className="form-grid">
        <Field label={tr('النسبة %')} required hint={tr('من المبلغ المدفوع فعلاً')}>
          <input className="input" type="number" min="0" max="100" step="0.5" dir="ltr" value={form.rate} onChange={set('rate')} />
        </Field>
        <Field label={tr('الجوال')}>
          <input className="input" type="tel" dir="ltr" value={form.phone} onChange={set('phone')} />
        </Field>
      </div>
      <Field label={tr('ملاحظات')}>
        <input className="input" value={form.notes} onChange={set('notes')} />
      </Field>
      {id && (
        <label className="check-row">
          <input type="checkbox" checked={form.active !== false} onChange={set('active')} />
          <span>{tr('نشط — يظهر في استمارة التسجيل')}</span>
        </label>
      )}
      {id && <div className="muted tiny mt-10">{tr('تغيير النسبة هنا يطبّق على المشاركين الجدد فقط؛ نسبة كل مشارك مسجّل تُعدّل من ملفه.')}</div>}
    </Modal>
  )
}

function PayForm({ row, onClose, onSaved }) {
  const toast = useToast()
  const [amount, setAmount] = useState(row.due > 0 ? row.due.toFixed(3) : '')
  const [date, setDate] = useState(todayISO())
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const submit = async () => {
    if (!(num(amount) > 0)) return toast(tr('اكتب المبلغ'), 'error')
    setSaving(true)
    try {
      await payReferrer(row.referrer, amount, date, note)
      toast(tr('✅ سُجّل دفع {0} لـ {1} ضمن مصروفات الشركة', [formatOMR(amount), row.referrer.name]))
      onSaved()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }
  return (
    <Modal
      title={tr('دفع عمولة {0}', [row.referrer.name])}
      subtitle={tr('المستحق الآن {0}', [formatOMR(row.due)])}
      size="sm"
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {tr('إلغاء')}
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? tr('جاري...') : tr('تسجيل الدفع')}
          </Button>
        </>
      }
    >
      <Field label={tr('المبلغ المدفوع (ر.ع)')} required>
        <input className="input" type="number" min="0" step="0.001" dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>
      <Field label={tr('التاريخ')}>
        <DateInput value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <Field label={tr('ملاحظة (اختياري)')}>
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <div className="muted tiny">{tr('يُسجَّل مصروفاً مدفوعاً للشركة بتصنيف «عمولات استقطاب»، ويُخصم من المستحق.')}</div>
    </Modal>
  )
}

/** Finance → «العمولات»: who brought which participants, what they earned, paid and are owed. */
export default function Referrals({ data, canManage, reload }) {
  const toast = useToast()
  const [form, setForm] = useState(null) // { initial, id }
  const [paying, setPaying] = useState(null)
  const [open, setOpen] = useState(null)

  if (data.referrers === null) {
    return <div className="alert alert-info">{tr('لتفعيل عمولات الاستقطاب شغّل تحديث 030 في Supabase.')}</div>
  }
  const rows = referralSummary(data.referrers, data.exhibitors, data.companyExpenses)
  const exOf = (id) => data.exhibitions.find((e) => e.id === id)
  const total = (key) => rows.reduce((t, r) => t + r[key], 0)

  const remove = async (row) => {
    const n = row.participants.length
    if (!window.confirm(tr('حذف «{0}»؟', [row.referrer.name]) + (n ? '\n' + tr('{0} مشارك مرتبط به سيبقى بدون من جلبه.', [n]) : ''))) return
    try {
      await deleteReferrer(row.referrer.id)
      reload()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  return (
    <>
      <div className="grid-3 mb-16">
        <StatCard flat icon="💰" label={tr('العمولات المستحقة حتى الآن')} value={formatOMR(total('earned'))} sub={tr('من المبالغ التي دفعها المشاركون فعلاً')} accent="var(--gold)" />
        <StatCard flat icon="✅" label={tr('العمولات المدفوعة')} value={formatOMR(total('paidOut'))} sub={tr('مسجّلة ضمن مصروفات الشركة')} accent="var(--suc)" />
        <StatCard flat icon="⏳" label={tr('المتبقي للدفع')} value={formatOMR(total('due'))} sub={tr('{0} شخص', [rows.filter((r) => r.due > 0.0005).length])} accent="var(--wrn)" />
      </div>

      <Panel
        icon="🤝"
        title={tr('عمولات الاستقطاب')}
        subtitle={tr('لكل من يجلب مشاركين نسبته الخاصة من المبلغ المدفوع فعلاً — تُحدَّد عند التسجيل في خانة «جلبه». لا تجمعها مع «عمولة» عقد الفريق لنفس الموظف حتى لا تُحسب مرتين.')}
        action={
          canManage && (
            <Button size="sm" onClick={() => setForm({ initial: null, id: null })}>
              {tr('+ إضافة شخص')}
            </Button>
          )
        }
      >
        {rows.length ? (
          <div className="table-wrap">
            <table className="table table-numbered" style={{ minWidth: 900 }}>
              <thead>
                <tr>
                  <th>{tr('الاسم')}</th>
                  <th>{tr('النسبة')}</th>
                  <th>{tr('المشاركون')}</th>
                  <th>{tr('دفعوا')}</th>
                  <th>{tr('العمولة')}</th>
                  <th>{tr('دُفع له')}</th>
                  <th>{tr('المتبقي')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.referrer.id} className={row.referrer.active === false ? 'row-muted' : ''}>
                    <td className="strong">
                      {row.referrer.name}
                      <div className="muted tiny">{row.referrer.user_id ? tr('موظف') : tr('وسيط خارجي')}{row.referrer.phone ? ` • ${row.referrer.phone}` : ''}</div>
                    </td>
                    <td className="num">{num(row.referrer.rate)}%</td>
                    <td>
                      <button type="button" className="link-btn" onClick={() => setOpen(open === row.referrer.id ? null : row.referrer.id)} disabled={!row.participants.length}>
                        {row.participants.length} {open === row.referrer.id ? '▲' : '▼'}
                      </button>
                    </td>
                    <td className="num">{formatOMR(row.base)}</td>
                    <td className="num strong">{formatOMR(row.earned)}</td>
                    <td className="num text-suc">{formatOMR(row.paidOut)}</td>
                    <td className={`num strong ${row.due > 0.0005 ? 'text-wrn' : row.due < -0.0005 ? 'text-dng' : 'muted'}`}>{formatOMR(row.due)}</td>
                    <td>
                      {canManage && (
                        <div className="row-actions">
                          <Button size="sm" onClick={() => setPaying(row)} disabled={!(row.due > 0.0005)}>
                            {tr('دفع')}
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setForm({ initial: { ...EMPTY, ...row.referrer }, id: row.referrer.id })} title={tr('تعديل')}>
                            ✏️
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => remove(row)} title={tr('حذف')}>
                            🗑️
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon="🤝" text={tr('أضف من يستقطب المشاركين (موظفين أو وسطاء) ونسبة كل واحد منهم.')} />
        )}
      </Panel>

      {rows
        .filter((row) => row.referrer.id === open)
        .map((row) => (
          <Panel key={row.referrer.id} icon="📋" title={tr('مشاركون جلبهم {0}', [row.referrer.name])} className="mt-16">
            <div className="table-wrap">
              <table className="table table-numbered table-compact">
                <thead>
                  <tr>
                    <th>{tr('المشارك')}</th>
                    <th>{tr('المعرض')}</th>
                    <th>{tr('العقد')}</th>
                    <th>{tr('المدفوع')}</th>
                    <th>{tr('النسبة')}</th>
                    <th>{tr('العمولة')}</th>
                  </tr>
                </thead>
                <tbody>
                  {row.participants.map((p) => (
                    <tr key={p.exhibitor.id}>
                      <td className="strong">
                        <Link to={`/exhibitions/${p.exhibitor.exhibition_id}`}>{p.exhibitor.brand}</Link>
                      </td>
                      <td className="small">{exhibitionLabel(exOf(p.exhibitor.exhibition_id))}</td>
                      <td className="num">{formatOMR(p.exhibitor.contract)}</td>
                      <td className="num">{formatOMR(p.paid)}</td>
                      <td className="num">{p.pct}%</td>
                      <td className="num strong">{formatOMR(p.earned)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {row.payouts.length > 0 && (
              <div className="muted small mt-10">
                {tr('الدفعات له:')}{' '}
                {row.payouts.map((x) => `${formatDate(x.date)} — ${formatOMR(x.amount)}`).join(tr('، '))}
              </div>
            )}
          </Panel>
        ))}

      {form && (
        <ReferrerForm
          initial={form.initial}
          id={form.id}
          staff={data.staff || []}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null)
            reload()
          }}
        />
      )}
      {paying && (
        <PayForm
          row={paying}
          onClose={() => setPaying(null)}
          onSaved={() => {
            setPaying(null)
            reload()
          }}
        />
      )}
    </>
  )
}
