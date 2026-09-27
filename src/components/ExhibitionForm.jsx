import { useState } from 'react'
import DateInput from './DateInput.jsx'
import { formTiers, saveExhibition } from '../api/exhibitions.js'
import { useToast } from '../context/ToastContext.jsx'
import { CITIES, EXHIBITION_STATUSES } from '../lib/constants.js'
import { num } from '../lib/format.js'
import Button from './Button.jsx'
import Field, { SelectOptions } from './Field.jsx'
import Modal from './Modal.jsx'

const TIER_PLACEHOLDERS = ['مثال: ركن مدخل', 'مثال: كورنر هاير', 'مثال: وسط المعرض', 'مثال: صف داخلي']

export default function ExhibitionForm({ initial, id, onClose, onSaved }) {
  const toast = useToast()
  const [form, setForm] = useState(() => ({ ...initial, tiers: formTiers(initial) }))
  const [saving, setSaving] = useState(false)
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  const tierBooths = form.tiers.reduce((t, x) => t + num(x.count), 0)
  const setTier = (index, key) => (e) =>
    setForm((f) => ({ ...f, tiers: f.tiers.map((t, i) => (i === index ? { ...t, [key]: e.target.value } : t)) }))
  const addTier = () => setForm((f) => ({ ...f, tiers: [...f.tiers, { name: '', price: '', count: '' }] }))
  const removeTier = (index) => setForm((f) => ({ ...f, tiers: f.tiers.filter((_, i) => i !== index) }))
  const totalBooths = num(form.booths) || tierBooths

  const submit = async () => {
    if (!form.city || !form.mall || !form.date_from || !form.date_to) return toast('أكمل البيانات المطلوبة', 'error')
    if (form.date_to < form.date_from) return toast('تاريخ النهاية قبل تاريخ البداية', 'error')
    setSaving(true)
    try {
      await saveExhibition(form, id)
      toast(id ? '✅ تم التحديث' : '✅ تم إضافة المعرض')
      onSaved()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={id ? 'تعديل المعرض' : 'إضافة معرض جديد'}
      onClose={onClose}
      size="wide"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            إلغاء
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? 'جاري...' : id ? 'حفظ التعديلات' : 'إضافة المعرض'}
          </Button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="المدينة" required>
          <SelectOptions options={CITIES} value={form.city || ''} onChange={set('city')} />
        </Field>
        <Field label="اسم المعرض" className="span-2" hint="اتركه فارغاً ليظهر باسم SOVA والمدينة">
          <input className="input" placeholder="مثال: معرض سوفا للمشاريع الواعدة" value={form.name || ''} onChange={set('name')} />
        </Field>
        <Field label="اسم المجمع التجاري" required>
          <input className="input" placeholder="مثال: سيتي سنتر مسقط" value={form.mall || ''} onChange={set('mall')} />
        </Field>
        <Field label="تاريخ البداية" required>
          <DateInput value={form.date_from || ''} onChange={set('date_from')} />
        </Field>
        <Field label="تاريخ النهاية" required>
          <DateInput value={form.date_to || ''} onChange={set('date_to')} />
        </Field>
        <Field label="الحالة">
          <SelectOptions options={EXHIBITION_STATUSES} placeholder={null} value={form.status || 'تخطيط'} onChange={set('status')} />
        </Field>
        <Field
          label="إجمالي البوثات"
          hint={
            num(form.booths) && tierBooths && num(form.booths) !== tierBooths
              ? `⚠️ مجموع الفئات تحت ${tierBooths} بوث`
              : 'عدد البوثات في هذا المعرض'
          }
        >
          <input className="input" type="number" min="0" placeholder={tierBooths ? String(tierBooths) : 'مثال: 46'} value={form.booths || ''} onChange={set('booths')} />
        </Field>
        <Field label="المناسبة">
          <input className="input" placeholder="مثال: العيد الوطني" value={form.occasion || ''} onChange={set('occasion')} />
        </Field>
        <Field label="أوقات العمل">
          <input className="input" placeholder="مثال: 10 صباحاً – 10 مساءً" value={form.hours || ''} onChange={set('hours')} />
        </Field>
        <Field label="العنوان" className="span-2">
          <input className="input" placeholder="الشارع، المنطقة، الولاية" value={form.address || ''} onChange={set('address')} />
        </Field>
      </div>

      <div className="tier-box">
        <div className="tier-box-title">🏷️ فئات البوثات وأسعارها (اختياري — تقدير مبدئي)</div>
        <div className="muted tiny mb-10">تُستخدم للتخطيط فقط. الخارطة التفصيلية (أرقام المواقع وفئاتها) تُضاف من ملف المعرض.</div>
        {form.tiers.map((tier, index) => (
          <div key={index} className="tier-row">
            <Field label={`اسم الفئة ${index + 1}`}>
              <input className="input" placeholder={TIER_PLACEHOLDERS[index] || 'اسم الفئة'} value={tier.name ?? ''} onChange={setTier(index, 'name')} />
            </Field>
            <Field label="السعر (ر.ع)">
              <input className="input" type="number" min="0" step="0.001" placeholder="0.000" value={tier.price ?? ''} onChange={setTier(index, 'price')} />
            </Field>
            <Field label="العدد">
              <input className="input" type="number" min="0" placeholder="0" value={tier.count ?? ''} onChange={setTier(index, 'count')} />
            </Field>
            <button type="button" className="tier-remove" title="حذف الفئة" onClick={() => removeTier(index)}>
              ✕
            </button>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={addTier} className="mb-10">
          + إضافة فئة
        </Button>
        <div className="tier-total">
          مجموع الفئات: <strong>{tierBooths} بوث</strong> — إجمالي المعرض: <strong>{totalBooths} بوث</strong>
        </div>
      </div>

      <Field label="ملاحظات" className="mt-14">
        <textarea className="input" rows={2} placeholder="أي تفاصيل إضافية..." value={form.notes || ''} onChange={set('notes')} />
      </Field>
    </Modal>
  )
}
