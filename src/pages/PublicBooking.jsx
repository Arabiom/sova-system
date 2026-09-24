import { useState } from 'react'
import { submitBooking } from '../api/bookings.js'
import { listOpenExhibitions } from '../api/exhibitions.js'
import Field, { SelectOptions } from '../components/Field.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { BOOTH_SIZES, CATEGORIES, COMPANY } from '../lib/constants.js'
import { exhibitionLabel } from '../lib/format.js'
import { useData } from '../lib/useData.js'

/** Public page (no login) where brands request a booth: /book */
export default function PublicBooking() {
  const toast = useToast()
  const { data: exhibitions } = useData(listOpenExhibitions, [])
  const [form, setForm] = useState({})
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    if (!form.brand || !form.manager || !form.phone || !form.exhibition_id) return toast('أكمل البيانات المطلوبة', 'error')
    setSending(true)
    try {
      await submitBooking(form)
      setSent(true)
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSending(false)
    }
  }

  if (sent) {
    return (
      <div className="public-page">
        <div className="public-card public-done">
          <div className="public-done-icon">✅</div>
          <div className="public-done-title">تم إرسال طلبك!</div>
          <div className="muted">سيتواصل معك فريق SOVA خلال 24 ساعة للتأكيد.</div>
          <div className="public-company">{COMPANY.name}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="public-page">
      <form className="public-card" onSubmit={submit}>
        <div className="public-head">
          <div className="public-brand">SOVA</div>
          <div className="strong">طلب حجز بوث</div>
          <div className="muted small">{COMPANY.name}</div>
        </div>

        <div className="form-grid">
          <Field label="اسم العلامة التجارية" required>
            <input className="input" placeholder="مثال: My Brand" value={form.brand || ''} onChange={set('brand')} />
          </Field>
          <Field label="اسم المسؤول" required>
            <input className="input" placeholder="الاسم الكامل" value={form.manager || ''} onChange={set('manager')} />
          </Field>
          <Field label="رقم الجوال" required>
            <input className="input" type="tel" dir="ltr" placeholder="+968 XXXXXXXX" value={form.phone || ''} onChange={set('phone')} />
          </Field>
          <Field label="البريد الإلكتروني">
            <input className="input" type="email" dir="ltr" placeholder="example@email.com" value={form.email || ''} onChange={set('email')} />
          </Field>
          <Field label="تصنيف النشاط">
            <SelectOptions options={CATEGORIES} value={form.category || ''} onChange={set('category')} />
          </Field>
          <Field label="المعرض المطلوب" required>
            <select className="input" value={form.exhibition_id || ''} onChange={set('exhibition_id')}>
              <option value="">اختر...</option>
              {exhibitions.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {exhibitionLabel(ex)}
                  {ex.mall ? ` • ${ex.mall}` : ''}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="حجم البوث المطلوب">
          <SelectOptions options={BOOTH_SIZES} value={form.booth_size || ''} onChange={set('booth_size')} />
        </Field>
        <Field label="رسالة أو ملاحظة">
          <textarea className="input" rows={3} placeholder="أي تفاصيل إضافية أو أسئلة..." value={form.message || ''} onChange={set('message')} />
        </Field>

        <button type="submit" className="btn btn-primary btn-lg btn-full mt-14" disabled={sending}>
          {sending ? 'جاري الإرسال...' : 'إرسال طلب الحجز'}
        </button>
      </form>
    </div>
  )
}
