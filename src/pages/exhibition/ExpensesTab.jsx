import { useState } from 'react'
import { Link } from 'react-router-dom'
import StatusBadge from '../../components/StatusBadge.jsx'
import { useCan } from '../../context/AuthContext.jsx'
import DateInput from '../../components/DateInput.jsx'
import { deleteExpense, saveExpense, setExpensePaid } from '../../api/exhibitionFile.js'
import Button from '../../components/Button.jsx'
import { EmptyState } from '../../components/Feedback.jsx'
import Field, { SelectOptions } from '../../components/Field.jsx'
import Modal from '../../components/Modal.jsx'
import Panel from '../../components/Panel.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { EXPENSE_CATEGORIES } from '../../lib/constants.js'
import { sumBy } from '../../lib/finance.js'
import { exhibitionLabel, formatOMR } from '../../lib/format.js'
import { tr } from '../../lib/i18n.js'

/**
 * Add / edit an exhibition expense. Opened from the finance centre (no fixed exhibition),
 * it asks which exhibition the expense belongs to.
 */
export function ExpenseForm({ exhibitionId, exhibitions, initial, id, onClose, onSaved }) {
  const toast = useToast()
  const [form, setForm] = useState(initial)
  const [saving, setSaving] = useState(false)
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  const submit = async () => {
    if (!form.item?.trim() || !(+form.amount >= 0) || form.amount === '' || form.amount === undefined)
      return toast(tr('اكتب البند والمبلغ'), 'error')
    const target = exhibitionId || form.exhibition_id
    if (!target) return toast(tr('اختر المعرض'), 'error')
    setSaving(true)
    try {
      await saveExpense(form, target, id)
      toast(id ? tr('✅ تم التحديث') : tr('✅ تمت إضافة المصروف'))
      onSaved()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={id ? tr('تعديل مصروف') : tr('إضافة مصروف')}
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
      <div className="form-grid">
        {!exhibitionId && (
          <Field label={tr('المعرض')} required className="span-2">
            <select className="input" value={form.exhibition_id || ''} onChange={set('exhibition_id')}>
              <option value="">{tr('اختر...')}</option>
              {(exhibitions || []).map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {exhibitionLabel(ex)}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label={tr('البند')} required className="span-2">
          <input className="input" placeholder={tr('مثال: شيك حجز المساحة')} value={form.item || ''} onChange={set('item')} />
        </Field>
        <Field label={tr('التصنيف')}>
          <SelectOptions options={EXPENSE_CATEGORIES} value={form.category || ''} onChange={set('category')} />
        </Field>
        <Field label={tr('المبلغ (ر.ع)')} required>
          <input className="input" type="number" min="0" step="0.001" value={form.amount ?? ''} onChange={set('amount')} />
        </Field>
        <Field label={tr('تاريخ الاستحقاق / الصرف')}>
          <DateInput value={form.due_date || ''} onChange={set('due_date')} />
        </Field>
        <Field label={tr('الحالة')}>
          <label className="check-row">
            <input type="checkbox" checked={Boolean(form.paid)} onChange={set('paid')} />
            <span>{tr('تم الدفع')}</span>
          </label>
        </Field>
      </div>
      <Field label={tr('ملاحظات')}>
        <input className="input" value={form.notes || ''} onChange={set('notes')} />
      </Field>
    </Modal>
  )
}

export default function ExpensesTab({ exhibitionId, expenses, claims = [], onChanged }) {
  const toast = useToast()
  const canWrite = useCan('data.write') // the viewer only looks
  const [editing, setEditing] = useState(null)
  // Staff claims approved for this exhibition count as its expenses too (paid once reimbursed).
  const total = sumBy(expenses, 'amount') + sumBy(claims, 'amount')
  const paid = sumBy(expenses.filter((x) => x.paid), 'amount') + sumBy(claims.filter((x) => x.status === 'تم التعويض'), 'amount')

  const togglePaid = async (x) => {
    try {
      await setExpensePaid(x.id, !x.paid)
      onChanged()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  const remove = async (x) => {
    if (!confirm(tr('حذف المصروف "{0}"؟', [x.item]))) return
    try {
      await deleteExpense(x.id)
      toast(tr('🗑️ تم الحذف'))
      onChanged()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  return (
    <Panel
      icon="🧾"
      title={tr('المصروفات')}
      subtitle={tr('الإجمالي {0} • المدفوع {1} • المتبقي {2}', [formatOMR(total), formatOMR(paid), formatOMR(total - paid)])}
      action={
        canWrite && (
          <Button size="sm" onClick={() => setEditing({ form: { paid: false }, id: null })}>
            {tr('+ إضافة مصروف')}
          </Button>
        )
      }
    >
      <div className="table-wrap">
        <table className="table table-numbered">
          <thead>
            <tr>
              {[tr('البند'), tr('التصنيف'), tr('المبلغ'), tr('الاستحقاق'), tr('مدفوع'), tr('ملاحظات'), ''].map((h) => (
                <th key={h}>{tr(h)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {expenses.map((x) => (
              <tr key={x.id}>
                <td className="strong">{tr(x.item)}</td>
                <td className="small">{tr(x.category) || '—'}</td>
                <td className="num strong">{formatOMR(x.amount)}</td>
                <td className="small nowrap">{x.due_date || '—'}</td>
                <td>
                  <button className={`paid-toggle ${x.paid ? 'on' : ''}`} onClick={() => canWrite && togglePaid(x)} disabled={!canWrite} title={tr('تبديل حالة الدفع')}>
                    {x.paid ? tr('✓ مدفوع') : tr('غير مدفوع')}
                  </button>
                </td>
                <td className="small muted truncate" title={x.notes}>
                  {x.notes || '—'}
                </td>
                <td>
                  {canWrite && (
                  <div className="row-actions">
                    <Button size="sm" variant="outline" onClick={() => setEditing({ form: { ...x }, id: x.id })} title={tr('تعديل')}>
                      ✏️
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => remove(x)} title={tr('حذف')}>
                      🗑️
                    </Button>
                  </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          {expenses.length > 0 && (
            <tfoot>
              <tr>
                <td className="strong">{tr('الإجمالي')}</td>
                <td />
                <td className="num strong">{formatOMR(sumBy(expenses, 'amount'))}</td>
                <td colSpan={4} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {!expenses.length && <EmptyState icon="🧾" text={tr('لا توجد مصروفات بعد — أضف شيك حجز المساحة ومصروفات التشغيل')} />}

      {claims.length > 0 && (
        <>
          <div className="section-label mt-16">{tr('👥 مطالبات الموظفين المعتمدة لهذا المعرض ({0})', [claims.length])}</div>
          <div className="table-wrap">
            <table className="table table-compact">
              <thead>
                <tr>
                  {[tr('التاريخ'), tr('الوصف'), tr('التصنيف'), tr('المبلغ'), tr('الحالة')].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {claims.map((x) => (
                  <tr key={x.id}>
                    <td className="small nowrap">{x.date}</td>
                    <td className="strong">{tr(x.description)}</td>
                    <td className="small">{tr(x.category) || '—'}</td>
                    <td className="num strong">{formatOMR(x.amount)}</td>
                    <td>
                      <StatusBadge status={x.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="muted tiny mt-8">
            {tr('تُضاف تلقائياً عند اعتمادها في «المالية ← مطالبات الموظفين»، وتُعدّل من هناك.')}{' '}
            <Link to="/finance?tab=claims">{tr('فتح المطالبات ↗')}</Link>
          </div>
        </>
      )}

      {editing && (
        <ExpenseForm
          exhibitionId={exhibitionId}
          initial={editing.form}
          id={editing.id}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            onChanged()
          }}
        />
      )}
    </Panel>
  )
}
