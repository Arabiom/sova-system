import { useState } from 'react'
import { saveExhibitor } from '../api/exhibitors.js'
import { useToast } from '../context/ToastContext.jsx'
import { BOOTH_SIZES, CATEGORIES, EXHIBITOR_STATUSES } from '../lib/constants.js'
import { exhibitionLabel } from '../lib/format.js'
import Button from './Button.jsx'
import Field, { SelectOptions } from './Field.jsx'
import Modal from './Modal.jsx'
import { boothHolder } from '../lib/sites.js'
import { useCan } from '../context/AuthContext.jsx'

/**
 * Add / edit an exhibitor (one participation in one exhibition).
 * Typing a brand that exists in `clients` links the exhibitor to that client and fills in
 * their details; otherwise a client record is created on save.
 */
export default function ExhibitorForm({ initial, id, exhibitions, clients = [], exhibitors = [], onClose, onSaved }) {
  const toast = useToast()
  const [form, setForm] = useState(initial)
  const [saving, setSaving] = useState(false)
  const money = useCan('money.view') // marketing does not see or change contract values
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  const linked = clients.find((c) => c.id === form.client_id)

  const onBrand = (e) => {
    const value = e.target.value
    const client = clients.find((c) => c.name === value)
    setForm((f) =>
      client
        ? {
            ...f,
            brand: client.name,
            client_id: client.id,
            manager: f.manager || client.contact_name || '',
            phone: f.phone || client.phone || '',
            email: f.email || client.email || '',
          }
        : { ...f, brand: value, client_id: f.client_id && linked?.name === value ? f.client_id : null },
    )
  }

  // One site = one participant in each exhibition (the database refuses it too).
  const takenBooth = boothHolder(exhibitors, form.exhibition_id, form.booth, id)

  const submit = async () => {
    if (!form.brand || !form.manager || !form.exhibition_id) return toast('أكمل البيانات المطلوبة', 'error')
    if (takenBooth) return toast(`الموقع ${takenBooth.numbers.join('، ')} محجوز مسبقاً لـ «${takenBooth.exhibitor.brand}» في هذا المعرض`, 'error')
    setSaving(true)
    try {
      await saveExhibitor(form, id)
      toast(id ? '✅ تم التحديث' : '✅ تم إضافة العارض')
      onSaved()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={id ? 'تعديل العارض' : 'إضافة عارض جديد'}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            إلغاء
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? 'جاري...' : id ? 'حفظ' : 'إضافة العارض'}
          </Button>
        </>
      }
    >
      <div className="form-grid">
        <Field
          label="اسم العلامة التجارية"
          required
          hint={linked ? `✓ مرتبط بالعميل: ${linked.name}` : clients.length ? 'اكتب لتختار من العملاء المسجلين، أو اسماً جديداً ليُضاف كعميل' : undefined}
        >
          <input className="input" list="client-names" placeholder="مثال: Bloom Beauty" value={form.brand || ''} onChange={onBrand} />
          <datalist id="client-names">
            {clients.map((c) => (
              <option key={c.id} value={c.name}>
                {[c.contact_name, c.phone].filter(Boolean).join(' • ')}
              </option>
            ))}
          </datalist>
        </Field>
        <Field label="اسم المسؤول" required>
          <input className="input" placeholder="الاسم الكامل" value={form.manager || ''} onChange={set('manager')} />
        </Field>
        <Field label="رقم الجوال">
          <input className="input" type="tel" dir="ltr" placeholder="+968 XXXXXXXX" value={form.phone || ''} onChange={set('phone')} />
        </Field>
        <Field label="البريد الإلكتروني">
          <input className="input" type="email" dir="ltr" placeholder="example@email.com" value={form.email || ''} onChange={set('email')} />
        </Field>
        <Field label="تصنيف النشاط">
          <SelectOptions options={CATEGORIES} value={form.category || ''} onChange={set('category')} />
        </Field>
        <Field label="المعرض المخصص" required hint={id ? 'تغيير المعرض (مثل التحويل لمعرض قادم) يحرر مواقعه في المعرض السابق' : undefined}>
          <select className="input" value={form.exhibition_id || ''} onChange={set('exhibition_id')}>
            <option value="">اختر...</option>
            {exhibitions.map((ex) => (
              <option key={ex.id} value={ex.id}>
                {exhibitionLabel(ex)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="رقم البوث" hint="إذا كان للمعرض خارطة مواقع، احجز الموقع من ملف المعرض ويُحدَّث هذا الحقل تلقائياً">
          <input className={`input ${takenBooth ? 'input-invalid' : ''}`} placeholder="مثال: A-01" value={form.booth === '—' ? '' : form.booth || ''} onChange={set('booth')} />
          {takenBooth && (
            <span className="field-hint text-dng">
              ⛔ محجوز لـ «{takenBooth.exhibitor.brand}»
            </span>
          )}
        </Field>
        <Field label="حجم البوث">
          <SelectOptions options={BOOTH_SIZES} value={form.booth_size || ''} onChange={set('booth_size')} />
        </Field>
        {money && (
          <Field label="قيمة العقد (ر.ع)">
            <input className="input" type="number" min="0" step="0.001" placeholder="450.000" value={form.contract ?? ''} onChange={set('contract')} />
          </Field>
        )}
        <Field label="حالة العقد">
          <SelectOptions options={EXHIBITOR_STATUSES} placeholder={null} value={form.status || 'مبدئي'} onChange={set('status')} />
        </Field>
      </div>
      <Field label="ملاحظات">
        <textarea className="input" rows={2} value={form.notes || ''} onChange={set('notes')} />
      </Field>
    </Modal>
  )
}
