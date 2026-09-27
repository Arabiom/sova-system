import { useState } from 'react'
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
import { formatOMR } from '../../lib/format.js'

function ExpenseForm({ exhibitionId, initial, id, onClose, onSaved }) {
  const toast = useToast()
  const [form, setForm] = useState(initial)
  const [saving, setSaving] = useState(false)
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  const submit = async () => {
    if (!form.item?.trim() || !(+form.amount >= 0) || form.amount === '' || form.amount === undefined)
      return toast('اكتب البند والمبلغ', 'error')
    setSaving(true)
    try {
      await saveExpense(form, exhibitionId, id)
      toast(id ? '✅ تم التحديث' : '✅ تمت إضافة المصروف')
      onSaved()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={id ? 'تعديل مصروف' : 'إضافة مصروف'}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            إلغاء
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? 'جاري...' : 'حفظ'}
          </Button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="البند" required className="span-2">
          <input className="input" placeholder="مثال: شيك حجز المساحة" value={form.item || ''} onChange={set('item')} />
        </Field>
        <Field label="التصنيف">
          <SelectOptions options={EXPENSE_CATEGORIES} value={form.category || ''} onChange={set('category')} />
        </Field>
        <Field label="المبلغ (ر.ع)" required>
          <input className="input" type="number" min="0" step="0.001" value={form.amount ?? ''} onChange={set('amount')} />
        </Field>
        <Field label="تاريخ الاستحقاق / الصرف">
          <DateInput value={form.due_date || ''} onChange={set('due_date')} />
        </Field>
        <Field label="الحالة">
          <label className="check-row">
            <input type="checkbox" checked={Boolean(form.paid)} onChange={set('paid')} />
            <span>تم الدفع</span>
          </label>
        </Field>
      </div>
      <Field label="ملاحظات">
        <input className="input" value={form.notes || ''} onChange={set('notes')} />
      </Field>
    </Modal>
  )
}

export default function ExpensesTab({ exhibitionId, expenses, onChanged }) {
  const toast = useToast()
  const canWrite = useCan('data.write') // the viewer only looks
  const [editing, setEditing] = useState(null)
  const total = sumBy(expenses, 'amount')
  const paid = sumBy(expenses.filter((x) => x.paid), 'amount')

  const togglePaid = async (x) => {
    try {
      await setExpensePaid(x.id, !x.paid)
      onChanged()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  const remove = async (x) => {
    if (!confirm(`حذف المصروف "${x.item}"؟`)) return
    try {
      await deleteExpense(x.id)
      toast('🗑️ تم الحذف')
      onChanged()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  return (
    <Panel
      icon="🧾"
      title="المصروفات"
      subtitle={`الإجمالي ${formatOMR(total)} • المدفوع ${formatOMR(paid)} • المتبقي ${formatOMR(total - paid)}`}
      action={
        canWrite && (
          <Button size="sm" onClick={() => setEditing({ form: { paid: false }, id: null })}>
            + إضافة مصروف
          </Button>
        )
      }
    >
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              {['البند', 'التصنيف', 'المبلغ', 'الاستحقاق', 'مدفوع', 'ملاحظات', ''].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {expenses.map((x) => (
              <tr key={x.id}>
                <td className="strong">{x.item}</td>
                <td className="small">{x.category || '—'}</td>
                <td className="num strong">{formatOMR(x.amount)}</td>
                <td className="small nowrap">{x.due_date || '—'}</td>
                <td>
                  <button className={`paid-toggle ${x.paid ? 'on' : ''}`} onClick={() => canWrite && togglePaid(x)} disabled={!canWrite} title="تبديل حالة الدفع">
                    {x.paid ? '✓ مدفوع' : 'غير مدفوع'}
                  </button>
                </td>
                <td className="small muted truncate" title={x.notes}>
                  {x.notes || '—'}
                </td>
                <td>
                  {canWrite && (
                  <div className="row-actions">
                    <Button size="sm" variant="outline" onClick={() => setEditing({ form: { ...x }, id: x.id })} title="تعديل">
                      ✏️
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => remove(x)} title="حذف">
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
                <td className="strong">الإجمالي</td>
                <td />
                <td className="num strong">{formatOMR(total)}</td>
                <td colSpan={4} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {!expenses.length && <EmptyState icon="🧾" text="لا توجد مصروفات بعد — أضف شيك حجز المساحة ومصروفات التشغيل" />}

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
