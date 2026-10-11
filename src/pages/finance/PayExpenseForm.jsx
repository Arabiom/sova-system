import { useState } from 'react'
import { paidSoFar, payCompanyExpense } from '../../api/companyExpenses.js'
import { checkFile } from '../../api/storage.js'
import Button from '../../components/Button.jsx'
import DateInput from '../../components/DateInput.jsx'
import Field from '../../components/Field.jsx'
import Modal from '../../components/Modal.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { formatOMR, num, todayISO } from '../../lib/format.js'
import { tr } from '../../lib/i18n.js'

/**
 * Record a payment of a company expense (a salary, rent…): all that is left or a part of it,
 * when it was paid, the transfer receipt and a note. A part leaves the rest due; a settlement
 * closes it at what was paid (a deduction).
 */
export default function PayExpenseForm({ x, contract, onClose, onSaved }) {
  const toast = useToast()
  const total = num(x.source.amount)
  const before = paidSoFar(x.source)
  const left = Math.max(0, Math.round((total - before) * 1000) / 1000)
  const [amount, setAmount] = useState(String(left || total))
  const [date, setDate] = useState(todayISO())
  const [note, setNote] = useState('')
  const [settle, setSettle] = useState(false)
  const [file, setFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const part = num(amount) > 0 && num(amount) < left - 0.0005
  const rest = Math.max(0, Math.round((left - num(amount)) * 1000) / 1000)
  const choose = (e) => {
    const chosen = e.target.files?.[0]
    e.target.value = ''
    if (!chosen) return
    const problem = checkFile(chosen, 'إيصال الدفع')
    if (problem) return toast(problem, 'error')
    setFile(chosen)
  }
  const submit = async () => {
    if (!(num(amount) > 0)) return toast(tr('أدخل المبلغ المدفوع'), 'error')
    if (num(amount) > left + 0.0005 && !confirm(tr('المبلغ أكبر من المتبقي ({0}). متابعة؟', [formatOMR(left)]))) return
    setSaving(true)
    try {
      await payCompanyExpense(x.source, { amount, date, note, receiptFile: file, settle: part && settle })
      toast(part && !settle ? tr('✅ سُجِّلت دفعة {0} — المتبقي {1}', [formatOMR(amount), formatOMR(rest)]) : tr('✅ تم تسجيل الدفع'))
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
            {saving ? tr('جاري...') : part && !settle ? tr('💵 تسجيل الدفعة') : tr('✓ تم الدفع')}
          </Button>
        </>
      }
    >
      <div className="summary-box mb-16">
        <div className="kv-row">
          <span>{tr('المبلغ المستحق')}</span>
          <strong>{formatOMR(total)}</strong>
        </div>
        {before > 0 && (
          <div className="kv-row">
            <span>{tr('مدفوع سابقاً')}</span>
            <span className="text-suc">{formatOMR(before)}</span>
          </div>
        )}
        <div className="kv-row kv-total">
          <span>{tr('المتبقي')}</span>
          <strong className="text-wrn">{formatOMR(left)}</strong>
        </div>
      </div>
      <div className="form-grid">
        <Field label={tr('المبلغ المدفوع الآن (ر.ع)')} required hint={tr('اكتب جزءاً من المبلغ إن كان الباقي سيُدفع لاحقاً')}>
          <input className="input" type="number" min="0" step="0.001" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label={tr('تاريخ الدفع')}>
          <DateInput value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      {part && (
        <>
          <div className="alert alert-info">{tr('يبقى {0} مستحقاً على هذا الراتب، ويظهر «مدفوع جزئياً» حتى يكتمل.', [formatOMR(rest)])}</div>
          <label className="check-row mb-16">
            <input type="checkbox" checked={settle} onChange={(e) => setSettle(e.target.checked)} />
            <span>
              {tr('تسوية نهائية: لن يُدفع الباقي ({0}) — خصم', [formatOMR(rest)])}
              {x.source.recurring && <span className="muted small"> — {tr('يُغلق هذا الشهر فقط؛ مبلغ الأشهر القادمة لا يتغير')}</span>}
            </span>
          </label>
        </>
      )}
      <Field label={tr('ملاحظة (اختياري)')}>
        <input className="input" placeholder={tr('مثال: تحويل بنكي — الباقي نهاية الشهر')} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <Field label={tr('إيصال التحويل (اختياري)')}>
        <div className="row-actions">
          <label className="btn btn-outline btn-sm file-pick">
            {file ? tr('🔄 تغيير الإيصال') : tr('📎 إرفاق إيصال')}
            <input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={choose} hidden />
          </label>
          <span className="muted small">{file ? `✓ ${file.name}` : tr('بدون إيصال')}</span>
        </div>
      </Field>
    </Modal>
  )
}
