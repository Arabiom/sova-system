import { useState } from 'react'
import { payCompanyExpense } from '../../api/companyExpenses.js'
import { checkFile } from '../../api/storage.js'
import Button from '../../components/Button.jsx'
import Field from '../../components/Field.jsx'
import Modal from '../../components/Modal.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { num } from '../../lib/format.js'
import { tr } from '../../lib/i18n.js'

/** Record that a company expense (a salary, rent…) was paid: the amount this time, the
 *  transfer receipt and a note. */
export default function PayExpenseForm({ x, contract, onClose, onSaved }) {
  const toast = useToast()
  const fixedRecord = Boolean(x.source.recurring) // its amount is used for the coming months
  const [amount, setAmount] = useState(String(x.amount))
  const [note, setNote] = useState('')
  const [file, setFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const choose = (e) => {
    const chosen = e.target.files?.[0]
    e.target.value = ''
    if (!chosen) return
    const problem = checkFile(chosen, 'إيصال الدفع')
    if (problem) return toast(problem, 'error')
    setFile(chosen)
  }
  const submit = async () => {
    if (!fixedRecord && !(num(amount) > 0)) return toast(tr('أدخل المبلغ المدفوع'), 'error')
    setSaving(true)
    try {
      await payCompanyExpense(x.source, { amount: fixedRecord ? null : amount, note, receiptFile: file })
      toast(tr('✅ تم تسجيل الدفع'))
      onSaved()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }
  return (
    <Modal
      title={tr('تسجيل دفع: {0}', [x.description])}
      subtitle={[x.period && tr('شهر {0}', [x.period]), contract && tr('👔 من عقد: {0}', [contract.name])].filter(Boolean).join(' • ') || undefined}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {tr('إلغاء')}
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? tr('جاري...') : tr('✓ تم الدفع')}
          </Button>
        </>
      }
    >
      <Field label={tr('المبلغ المدفوع (ر.ع)')} hint={fixedRecord ? tr('هذا هو التسجيل الأصلي للمصروف الثابت — مبلغه يُستخدم للأشهر القادمة. لتغييره عدّل {0}.', [contract ? tr('العقد') : tr('المصروف')]) : tr('غيّره إن دُفع هذه المرة مبلغ مختلف (خصم أو مكافأة) — لا يغيّر الأشهر الأخرى.')}>
        <input className="input" type="number" min="0" step="0.001" value={amount} disabled={fixedRecord} onChange={(e) => setAmount(e.target.value)} />
      </Field>
      <Field label={tr('ملاحظة (اختياري)')}>
        <input className="input" placeholder={tr('مثال: تحويل بنكي 5 أكتوبر')} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <Field label={tr('إيصال التحويل (اختياري)')}>
        <div className="row-actions">
          <label className="btn btn-outline btn-sm file-pick">
            {file || x.receipt ? tr('🔄 تغيير الإيصال') : tr('📎 إرفاق إيصال')}
            <input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={choose} hidden />
          </label>
          <span className="muted small">{file ? `✓ ${file.name}` : x.receipt ? tr('✓ مرفق') : tr('بدون إيصال')}</span>
        </div>
      </Field>
    </Modal>
  )
}
