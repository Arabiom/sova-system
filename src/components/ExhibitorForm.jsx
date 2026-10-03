import { useState } from 'react'
import { saveExhibitor } from '../api/exhibitors.js'
import { listReferrers } from '../api/referrals.js'
import { useData } from '../lib/useData.js'
import { recordPayment } from '../api/payments.js'
import { confirmIfPaid } from '../api/registration.js'
import { useToast } from '../context/ToastContext.jsx'
import { BOOTH_SIZES, CATEGORIES, EXHIBITOR_STATUSES, PAYMENT_METHODS } from '../lib/constants.js'
import { daysBetween, paymentDeadline, PAYMENT_DEADLINE_DAYS, vatEnabled, withVat } from '../lib/finance.js'
import { exhibitionLabel, formatDate, formatOMR, num } from '../lib/format.js'
import { omanDay } from '../lib/team.js'
import { packagesOf } from '../lib/packages.js'
import Button from './Button.jsx'
import Field, { SelectOptions } from './Field.jsx'
import Modal from './Modal.jsx'
import { boothHolder } from '../lib/sites.js'
import { useCan } from '../context/AuthContext.jsx'
import { tr } from '../lib/i18n.js'

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
  const canPay = useCan('payments.write') // admin + finance record money received
  const [payment, setPayment] = useState({ amount: '', method: PAYMENT_METHODS[0] })
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  const canRate = useCan('payments.write') // the rate is set by admin / finance only
  const { data: referrers } = useData(() => listReferrers().catch(() => null), null)
  const referrer = referrers?.find((r) => r.id === form.referrer_id)
  const linked = clients.find((c) => c.id === form.client_id)
  const exhibitionOfForm = exhibitions.find((ex) => ex.id === form.exhibition_id)
  const packages = packagesOf(exhibitionOfForm) // this exhibition's own packages (or the defaults)
  const pkg = packages.find((p) => p.name === form.booth_type)

  // Paid so far comes from the payment records (never typed), so the books always agree.
  const paid = num(initial.paid)
  const newPayment = canPay ? Math.max(0, num(payment.amount)) : 0
  const contract = num(form.contract)
  const remaining = Math.round((contract - paid - newPayment) * 1000) / 1000
  const exhibition = exhibitionOfForm
  const deadline = paymentDeadline(exhibition)
  const daysLeft = deadline ? daysBetween(omanDay(), deadline) : null

  // Picking a package fills its price in — unless a different contract value was already agreed.
  const onPackage = (e) => {
    const next = packages.find((p) => p.name === e.target.value)
    setForm((f) => {
      const before = packages.find((p) => p.name === f.booth_type)
      const keepPrice = f.contract !== '' && f.contract != null && num(f.contract) !== (before?.price ?? 0)
      const keepSize = f.booth_size && f.booth_size !== (before?.area || '')
      return {
        ...f,
        booth_type: e.target.value,
        contract: next && !keepPrice ? next.price : f.contract,
        booth_size: next?.area && !keepSize ? next.area : f.booth_size,
      }
    })
  }

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
    if (!form.brand || !form.manager || !form.exhibition_id) return toast(tr('أكمل البيانات المطلوبة'), 'error')
    if (takenBooth) return toast(tr('الموقع {0} محجوز مسبقاً لـ «{1}» في هذا المعرض', [takenBooth.numbers.join(tr('، ')), takenBooth.exhibitor.brand]), 'error')
    if (newPayment > 0 && remaining < -0.0005 && !confirm(tr('الدفعة أكبر من المتبقي على العقد ({0}). متابعة؟', [formatOMR(contract - paid)]))) return
    setSaving(true)
    try {
      const savedId = await saveExhibitor(form, id)
      if (newPayment > 0) {
        const { invoice_no: invoice } = await recordPayment({
          exhibitor_id: savedId,
          amount: newPayment,
          method: payment.method,
          type: remaining <= 0.0005 ? (paid > 0 ? 'أخيرة' : 'كامل') : paid > 0 ? 'جزئية' : 'مقدمة',
          note: 'من نموذج العارض',
        })
        await confirmIfPaid(savedId)
        toast(tr('✅ تم الحفظ وتسجيل الدفعة — {0}', [invoice]))
      } else toast(id ? tr('✅ تم التحديث') : tr('✅ تمت إضافة العارض'))
      onSaved()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={id ? tr('تعديل العارض') : tr('إضافة عارض جديد')}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {tr('إلغاء')}
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? tr('جاري...') : id ? tr('حفظ') : tr('إضافة العارض')}
          </Button>
        </>
      }
    >
      <div className="form-grid">
        <Field
          label={tr('اسم العلامة التجارية')}
          required
          hint={linked ? tr('✓ مرتبط بالعميل: {0}', [linked.name]) : clients.length ? tr('اكتب لتختار من العملاء المسجلين، أو اسماً جديداً ليُضاف كعميل') : undefined}
        >
          <input className="input" list="client-names" placeholder={tr('مثال: Bloom Beauty')} value={form.brand || ''} onChange={onBrand} />
          <datalist id="client-names">
            {clients.map((c) => (
              <option key={c.id} value={c.name}>
                {[c.contact_name, c.phone].filter(Boolean).join(' • ')}
              </option>
            ))}
          </datalist>
        </Field>
        <Field label={tr('اسم المسؤول')} required>
          <input className="input" placeholder={tr('الاسم الكامل')} value={form.manager || ''} onChange={set('manager')} />
        </Field>
        <Field label={tr('رقم الجوال')}>
          <input className="input" type="tel" dir="ltr" placeholder="+968 XXXXXXXX" value={form.phone || ''} onChange={set('phone')} />
        </Field>
        <Field label={tr('البريد الإلكتروني')}>
          <input className="input" type="email" dir="ltr" placeholder="example@email.com" value={form.email || ''} onChange={set('email')} />
        </Field>
        <Field label={tr('تصنيف النشاط')}>
          <SelectOptions options={CATEGORIES} value={form.category || ''} onChange={set('category')} />
        </Field>
        <Field label={tr('المعرض المخصص')} required hint={id ? tr('تغيير المعرض (مثل التحويل لمعرض قادم) يحرر مواقعه في المعرض السابق') : undefined}>
          <select className="input" value={form.exhibition_id || ''} onChange={set('exhibition_id')}>
            <option value="">{tr('اختر...')}</option>
            {exhibitions.map((ex) => (
              <option key={ex.id} value={ex.id}>
                {exhibitionLabel(ex)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={tr('رقم البوث')} hint={tr('إذا كان للمعرض خارطة مواقع، احجز الموقع من ملف المعرض ويُحدَّث هذا الحقل تلقائياً')}>
          <input className={`input ${takenBooth ? 'input-invalid' : ''}`} placeholder={tr('مثال: A-01')} value={form.booth === '—' ? '' : form.booth || ''} onChange={set('booth')} />
          {takenBooth && (
            <span className="field-hint text-dng">
              {tr('⛔ محجوز لـ «')}{tr(takenBooth.exhibitor.brand)}»
            </span>
          )}
        </Field>
        <Field label={tr('حجم البوث')}>
          <SelectOptions options={[...new Set([...BOOTH_SIZES, form.booth_size].filter(Boolean))]} value={form.booth_size || ''} onChange={set('booth_size')} />
        </Field>
        <Field label={tr('نظام البوث (الباقة)')}>
          <select className="input" value={form.booth_type || ''} onChange={onPackage}>
            <option value="">{tr('— بدون باقة —')}</option>
            {packages.map((p) => (
              <option key={p.name} value={p.name}>
                {tr(p.name)}{money ? ` — ${formatOMR(p.price)}` : ''}
              </option>
            ))}
            {form.booth_type && !pkg && <option value={form.booth_type}>{tr(form.booth_type)}</option>}
          </select>
        </Field>
        <Field label={tr('حالة العقد')}>
          <SelectOptions options={EXHIBITOR_STATUSES} placeholder={null} value={form.status || 'مبدئي'} onChange={set('status')} />
        </Field>
      </div>
      {referrers?.length > 0 && (
        <div className="form-grid">
          <Field label={tr('جلبه (عمولة استقطاب)')} hint={!canRate && id ? tr('تغييره للإدارة والمالية') : undefined}>
            <select
              className="input"
              value={form.referrer_id || ''}
              disabled={Boolean(id) && !canRate}
              onChange={(e) => setForm((f) => ({ ...f, referrer_id: e.target.value, referral_pct: '' }))}
            >
              <option value="">{tr('— لا أحد —')}</option>
              {referrers
                .filter((r) => r.active !== false || r.id === form.referrer_id)
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}{money ? ` — ${num(r.rate)}%` : ''}
                  </option>
                ))}
            </select>
          </Field>
          {money && form.referrer_id && (
            <Field label={tr('نسبته من هذا المشارك %')} hint={tr('من المبلغ المدفوع فعلاً — فارغ = نسبته العامة {0}%', [num(referrer?.rate)])}>
              <input className="input" type="number" min="0" max="100" step="0.5" dir="ltr" disabled={!canRate} value={form.referral_pct ?? ''} onChange={set('referral_pct')} />
            </Field>
          )}
        </div>
      )}
      {pkg && (
        <div className="summary-box mb-12 small">
          <strong>{tr('يشمل «{0}»:', [tr(pkg.name)])}</strong> {tr(pkg.includes) || '—'}
          {pkg.area && <span className="muted"> • 📐 {tr(pkg.area)}</span>}
        </div>
      )}

      {money && (
        <fieldset className="money-box">
          <legend>{tr('💰 العقد والدفعات')}{vatEnabled() ? <span className="muted small"> {tr('— المبالغ قبل الضريبة')}</span> : null}</legend>
          <div className="form-grid">
            <Field label={tr('قيمة العقد الإجمالية (ر.ع)')}>
              <input className="input" type="number" min="0" step="0.001" placeholder="450.000" value={form.contract ?? ''} onChange={set('contract')} />
            </Field>
            {id && (
              <Field label={tr('المدفوع حتى الآن')} hint={tr('من سجل الدفعات المؤكدة — يتغير بتسجيل دفعة')}>
                <div className="input input-readonly num text-suc">{formatOMR(paid)}</div>
              </Field>
            )}
            {canPay && (
              <>
                <Field
                  label={id ? tr('دفعة جديدة الآن (ر.ع)') : tr('المبلغ المدفوع (ر.ع)')}
                  hint={id ? tr('اتركها فارغة إذا لم يُدفع شيء — تُسجَّل في «المالية ← الإيرادات والدفعات» بإيصال') : tr('ما دفعه العارض عند التسجيل — اتركه فارغاً إذا لم يدفع. يُسجَّل دفعةً بإيصال في المالية')}
                >
                  <input className="input" type="number" min="0" step="0.001" placeholder="0.000" value={payment.amount} onChange={(e) => setPayment((p) => ({ ...p, amount: e.target.value }))} />
                </Field>
                <Field label={tr('طريقة الدفع')}>
                  <SelectOptions options={PAYMENT_METHODS} placeholder={null} value={payment.method} onChange={(e) => setPayment((p) => ({ ...p, method: e.target.value }))} />
                </Field>
              </>
            )}
          </div>
          <div className={`money-remaining ${remaining > 0.0005 ? 'is-due' : remaining < -0.0005 ? 'is-over' : 'is-paid'}`}>
            <span>{remaining < -0.0005 ? tr('زيادة عن العقد') : tr('المتبقي')}</span>
            <strong className="num">{formatOMR(Math.abs(remaining))}</strong>
            {vatEnabled() && Math.abs(remaining) > 0.0005 && <span className="muted small">{tr('{0} شامل الضريبة', [formatOMR(withVat(Math.abs(remaining)))])}</span>}
            {remaining <= 0.0005 && remaining >= -0.0005 && contract > 0 && <span>{tr('✅ مدفوع بالكامل')}</span>}
          </div>
          {deadline && (
            <div className={`small mt-8 ${remaining > 0.0005 && daysLeft < 0 ? 'text-dng strong' : remaining > 0.0005 && daysLeft <= 7 ? 'text-wrn strong' : 'muted'}`}>
              ⏰ {tr('آخر موعد لتحصيل كل الرسوم: {0} ({1} أيام قبل الافتتاح)', [formatDate(deadline), PAYMENT_DEADLINE_DAYS])}
              {remaining > 0.0005 && (daysLeft < 0 ? ` — ${tr('تجاوز الموعد بـ {0} يوم', [-daysLeft])}` : ` — ${tr('باقي {0} يوم', [daysLeft])}`)}
            </div>
          )}
        </fieldset>
      )}
      <Field label={tr('ملاحظات')}>
        <textarea className="input" rows={2} value={form.notes || ''} onChange={set('notes')} />
      </Field>
    </Modal>
  )
}
