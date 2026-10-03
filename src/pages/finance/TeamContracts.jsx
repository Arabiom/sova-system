import { useState } from 'react'
import {
  COMMISSION_BASES,
  commissionOf,
  CONTRACT_TITLES,
  contractStatus,
  contractTotal,
  deleteContract,
  DURATIONS,
  endAfter,
  monthsOf,
  PAY_COMMISSION,
  PAY_LUMP,
  PAY_MONTHLY,
  PAY_TYPES,
  recordCommission,
  saveContract,
  validateContract,
} from '../../api/contracts.js'
import Button from '../../components/Button.jsx'
import DateInput from '../../components/DateInput.jsx'
import { EmptyState } from '../../components/Feedback.jsx'
import Field from '../../components/Field.jsx'
import Modal from '../../components/Modal.jsx'
import Panel from '../../components/Panel.jsx'
import StatCard from '../../components/StatCard.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { formatDate, formatOMR, num, todayISO } from '../../lib/format.js'
import { tr } from '../../lib/i18n.js'
import { omanDay } from '../../lib/team.js'

/** «شهر / شهران / 3 أشهر / 12 شهراً» */
const monthsLabel = (n) => (n === 1 ? tr('شهر') : n === 2 ? tr('شهران') : n <= 10 ? tr('{0} أشهر', [n]) : tr('{0} شهراً', [n]))

const STATUS_CLASS = { قادم: 'badge-info', ساري: 'badge-success', منتهي: 'badge-neutral' }
const PAY_LABEL = { [PAY_MONTHLY]: 'راتب شهري', [PAY_LUMP]: 'مبلغ مقطوع للمدة كلها', [PAY_COMMISSION]: 'عمولة فقط' }

/** The 1st of next month — contracts usually start there. */
function nextMonthStart() {
  const [y, m] = todayISO().split('-').map(Number)
  return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10)
}

function ContractForm({ contract, staff, onClose, onSaved }) {
  const toast = useToast()
  const editing = Boolean(contract?.id)
  const [form, setForm] = useState(() =>
    contract
      ? {
          ...contract,
          open: !contract.end_date,
          duration: !contract.end_date ? 'open' : DURATIONS.find((d) => endAfter(contract.start_date, d) === contract.end_date) || 'custom',
        }
      : { pay_type: PAY_MONTHLY, start_date: nextMonthStart(), duration: 3, end_date: endAfter(nextMonthStart(), 3), commission_pct: '', commission_base: COMMISSION_BASES[0] },
  )
  const [saving, setSaving] = useState(false)
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  const setStart = (e) => {
    const start = e.target.value
    setForm((f) => ({ ...f, start_date: start, end_date: DURATIONS.includes(f.duration) && start ? endAfter(start, f.duration) : f.end_date }))
  }
  const setDuration = (d) =>
    setForm((f) => ({
      ...f,
      duration: d,
      open: d === 'open',
      end_date: DURATIONS.includes(d) && f.start_date ? endAfter(f.start_date, d) : d === 'open' ? '' : f.end_date || '',
    }))
  const commissionOnly = form.pay_type === PAY_COMMISSION
  const months = !form.open && form.start_date && form.end_date && form.end_date >= form.start_date ? monthsOf(form.start_date, form.end_date) : 0
  const total = contractTotal({ ...form, end_date: form.open ? null : form.end_date, amount: num(form.amount) })

  const submit = async () => {
    const errors = validateContract(form)
    if (errors.length) return toast(tr('أكمل: {0}', [errors.map((x) => tr(x)).join(tr('، '))]), 'error')
    setSaving(true)
    try {
      await saveContract(form, contract)
      toast(editing ? tr('✅ تم تعديل العقد') : tr('✅ تم تسجيل العقد'))
      onSaved()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={editing ? tr('تعديل عقد') : tr('عقد جديد مع عضو فريق')}
      subtitle={tr('عقد عمل مع عضو الفريق — راتبه يُسجَّل في مصروفات الشركة تلقائياً ويتوقف مع نهاية العقد')}
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
          <input className="input" value={form.name || ''} onChange={set('name')} />
        </Field>
        <Field label={tr('المسمى')}>
          <input className="input" list="contract-titles" placeholder={tr('مثال: مصمم')} value={form.title || ''} onChange={set('title')} />
          <datalist id="contract-titles">
            {CONTRACT_TITLES.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </Field>
        <Field label={tr('بداية العقد')} required>
          <DateInput value={form.start_date || ''} onChange={setStart} />
        </Field>
        <Field label={tr('مدة العقد')} required>
          <div className="choice-grid choice-grid-5">
            {['open', ...DURATIONS, 'custom'].map((d) => (
              <button type="button" key={d} className={`choice ${form.duration === d ? 'selected' : ''}`} aria-pressed={form.duration === d} onClick={() => setDuration(d)}>
                <span className="choice-title">{d === 'open' ? tr('مفتوح') : d === 'custom' ? tr('أحدد النهاية') : monthsLabel(d)}</span>
              </button>
            ))}
          </div>
        </Field>
        {form.open ? (
          <div className="alert alert-info span-2">{tr('عقد مفتوح بدون تاريخ نهاية — الراتب يُضاف كل شهر حتى تحدد له نهاية لاحقاً من «تعديل».')}</div>
        ) : (
          <Field label={tr('نهاية العقد')} required hint={months ? tr('{0} — ينتهي {1}', [monthsLabel(months), formatDate(form.end_date)]) : undefined}>
            <DateInput value={form.end_date || ''} onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value, duration: 'custom', open: false }))} />
          </Field>
        )}
      </div>

      <div className="window-box">
        <div className="field-label">{tr('💵 طريقة الدفع')}</div>
        <div className="choice-grid choice-grid-3 mb-10">
          {PAY_TYPES.map((t) => (
            <button type="button" key={t} className={`choice ${form.pay_type === t ? 'selected' : ''}`} aria-pressed={form.pay_type === t} onClick={() => setForm((f) => ({ ...f, pay_type: t }))}>
              <span className="choice-title">{tr(PAY_LABEL[t])}</span>
            </button>
          ))}
        </div>
        <div className="form-grid">
          {!commissionOnly && (
            <Field label={form.pay_type === PAY_LUMP ? tr('المبلغ للمدة كلها (ر.ع)') : tr('الراتب الشهري (ر.ع)')} required>
              <input className="input" type="number" min="0" step="0.001" placeholder="0.000" value={form.amount ?? ''} onChange={set('amount')} />
            </Field>
          )}
          <Field label={commissionOnly ? tr('نسبة العمولة %') : tr('عمولة إضافية % (اختياري)')} required={commissionOnly}>
            <input className="input" type="number" min="0" max="100" step="0.5" placeholder="0" value={form.commission_pct ?? ''} onChange={set('commission_pct')} />
          </Field>
          {num(form.commission_pct) > 0 && (
            <>
              <Field label={tr('العمولة على')}>
                <select className="input" value={form.commission_base} onChange={set('commission_base')}>
                  {COMMISSION_BASES.map((b) => (
                    <option key={b} value={b}>
                      {b === 'المحصّل' ? tr('المبالغ المحصّلة فعلاً من مشاركيه') : tr('قيمة عقود مشاركيه')}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={tr('حسابه في النظام')} required hint={tr('تُحسب العمولة من المشاركين الذين سجّلهم بحسابه خلال مدة العقد')}>
                <select className="input" value={form.user_id || ''} onChange={set('user_id')}>
                  <option value="">{tr('اختر...')}</option>
                  {staff.map((s) => (
                    <option key={s.user_id} value={s.user_id}>
                      {s.name || s.email}
                    </option>
                  ))}
                </select>
              </Field>
            </>
          )}
        </div>
        {!commissionOnly && num(form.amount) > 0 && form.open && form.pay_type === PAY_MONTHLY && (
          <div className="strong small">{tr('التكلفة: {0} شهرياً — مستمر حتى تحدد نهاية للعقد', [formatOMR(num(form.amount))])}</div>
        )}
        {!commissionOnly && num(form.amount) > 0 && months > 0 && (
          <div className="strong small">
            {form.pay_type === PAY_LUMP
              ? tr('التكلفة: {0} للمدة كلها — يُسجَّل مصروفاً واحداً يُدفع حتى {1}', [formatOMR(total), formatDate(form.end_date)])
              : tr('التكلفة: {0} × {1} = {2} — يُضاف الراتب في المصروفات كل شهر حتى نهاية العقد', [formatOMR(num(form.amount)), monthsLabel(months), formatOMR(total)])}
          </div>
        )}
      </div>
      <Field label={tr('ملاحظات')}>
        <input className="input" value={form.notes || ''} onChange={set('notes')} />
      </Field>
      {editing && <div className="muted tiny">{tr('تغيير البداية أو طريقة الدفع يوقف الراتب القديم ويبدأ جديداً؛ الرواتب المسجلة سابقاً تبقى.')}</div>}
    </Modal>
  )
}

export default function TeamContracts({ data, canManage, reload, openId }) {
  const toast = useToast()
  // Opened from a salary in «all expenses»: start on that contract's form.
  const [editing, setEditing] = useState(() => (openId && canManage ? (data.contracts || []).find((c) => c.id === openId) || null : null))
  const today = omanDay()
  const contracts = data.contracts || []
  const rows = contracts.map((c) => ({ c, status: contractStatus(c, today), commission: commissionOf(c, data.exhibitors, data.payments) }))
  const running = rows.filter((r) => r.status === 'ساري')
  const monthly = running.filter((r) => r.c.pay_type === PAY_MONTHLY).reduce((t, r) => t + num(r.c.amount), 0)
  const committed = rows.filter((r) => r.status !== 'منتهي').reduce((t, r) => t + (contractTotal(r.c) ?? 0), 0)
  const commissionDue = rows.reduce((t, r) => t + r.commission.due, 0)
  const nameOf = (id) => {
    const s = data.staff.find((x) => x.user_id === id)
    return s?.name || s?.email || ''
  }

  const act = async (fn, ok) => {
    try {
      await fn()
      if (ok) toast(ok)
      reload()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  return (
    <>
      <div className="grid-4 mb-16">
        <StatCard flat label={tr('عقود سارية')} value={running.length} sub={tr('من {0} عقد', [contracts.length])} accent="var(--ink)" icon="👔" />
        <StatCard flat label={tr('الرواتب الشهرية الحالية')} value={formatOMR(monthly)} accent="var(--wrn)" icon="📅" />
        <StatCard flat label={tr('إجمالي العقود القائمة والقادمة')} value={formatOMR(committed)} sub={tr('الراتب × الأشهر، أو المبلغ المقطوع')} accent="var(--dng)" icon="🧾" />
        <StatCard flat label={tr('عمولات لم تُسجَّل بعد')} value={formatOMR(commissionDue)} accent="var(--info)" icon="💹" />
      </div>

      {canManage && (
        <div className="page-actions page-actions-bar mb-16">
          <Button onClick={() => setEditing({})}>{tr('+ عقد جديد')}</Button>
        </div>
      )}

      <Panel icon="👔" title={tr('عقود الفريق')} subtitle={tr('الراتب يُسجَّل في «كل المصروفات» تلقائياً كل شهر ويتوقف مع نهاية العقد')}>
        <div className="table-wrap">
          <table className="table table-numbered" style={{ minWidth: 980 }}>
            <thead>
              <tr>
                {[tr('الاسم'), tr('المدة'), tr('الحالة'), tr('الدفع'), tr('تكلفة العقد'), tr('العمولة'), ''].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ c, status, commission }) => (
                <tr key={c.id}>
                  <td>
                    <div className="strong">{c.name}</div>
                    <div className="muted tiny">{[c.title, c.user_id && nameOf(c.user_id) && `@${nameOf(c.user_id)}`].filter(Boolean).join(' • ')}</div>
                  </td>
                  <td className="small nowrap">
                    {formatDate(c.start_date)} ← {c.end_date ? formatDate(c.end_date) : tr('مفتوح')}
                    <div className="muted tiny">{c.end_date ? monthsLabel(monthsOf(c.start_date, c.end_date)) : tr('عقد مفتوح')}</div>
                  </td>
                  <td>
                    <span className={`badge ${STATUS_CLASS[status]}`}>{tr(status)}</span>
                    {status === 'ساري' && c.end_date && <div className="muted tiny">{tr('ينتهي بعد {0} يوم', [Math.round((Date.parse(c.end_date) - Date.parse(today)) / 86_400_000)])}</div>}
                  </td>
                  <td className="small">
                    {c.pay_type === PAY_COMMISSION ? tr('عمولة فقط') : c.pay_type === PAY_LUMP ? tr('مقطوع {0}', [formatOMR(c.amount)]) : tr('{0} شهرياً', [formatOMR(c.amount)])}
                    {num(c.commission_pct) > 0 && (
                      <div className="muted tiny">{tr(c.pay_type === PAY_COMMISSION ? '{0}% على {1}' : '+ عمولة {0}% على {1}', [num(c.commission_pct), tr(c.commission_base)])}</div>
                    )}
                  </td>
                  <td className="num strong">{contractTotal(c) === null ? <span className="small">{tr('{0} شهرياً — مستمر', [formatOMR(c.amount)])}</span> : formatOMR(contractTotal(c))}</td>
                  <td className="small">
                    {num(c.commission_pct) > 0 ? (
                      <>
                        <div>{tr('مبيعاته: {0} ({1} مشارك)', [formatOMR(commission.base), commission.participants.length])}</div>
                        <div className="strong">{tr('العمولة: {0}', [formatOMR(commission.earned)])}</div>
                        {commission.recorded > 0 && <div className="muted tiny">{tr('سُجِّل منها {0}', [formatOMR(commission.recorded)])}</div>}
                        {canManage && commission.due > 0.0005 && (
                          <Button size="sm" className="mt-4" onClick={() => confirm(tr('تسجيل عمولة {0} لـ {1} في المصروفات؟', [formatOMR(commission.due), c.name])) && act(() => recordCommission(c, commission.due, today), tr('✅ سُجِّلت العمولة في المصروفات'))}>
                            {tr('سجّل {0}', [formatOMR(commission.due)])}
                          </Button>
                        )}
                      </>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>
                    {canManage && (
                      <div className="row-actions">
                        <Button size="sm" variant="outline" onClick={() => setEditing(c)} title={tr('تعديل')}>
                          ✏️
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          title={tr('حذف')}
                          onClick={() => confirm(tr('حذف عقد {0}؟ الرواتب المسجلة تبقى، والقادمة تتوقف.', [c.name])) && act(() => deleteContract(c), tr('🗑️ تم الحذف'))}
                        >
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
        {!rows.length && <EmptyState icon="👔" text={tr('لا توجد عقود بعد — أضف عقد المصمم والمسوق لمدة 3 أشهر مثلاً')} />}
      </Panel>

      {editing && (
        <ContractForm
          contract={editing.id ? editing : null}
          staff={data.staff}
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
