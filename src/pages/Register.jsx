import { useMemo, useRef, useState } from 'react'
import DateInput from '../components/DateInput.jsx'
import { listExhibitions } from '../api/exhibitions.js'
import { listExhibitors } from '../api/exhibitors.js'
import { listSites } from '../api/exhibitionFile.js'
import { registerParticipant, validateRegistration } from '../api/registration.js'
import Button from '../components/Button.jsx'
import { EmptyState, Loading } from '../components/Feedback.jsx'
import Field from '../components/Field.jsx'
import PageHeader from '../components/PageHeader.jsx'
import Panel from '../components/Panel.jsx'
import { useCan } from '../context/AuthContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { BOOTH_EXTRAS, BOOTH_NOTE, BOOTH_PACKAGES, FORM_PAYMENT_METHODS, FORM_SECTORS } from '../lib/constants.js'
import { registrationTotals, withVat } from '../lib/finance.js'
import { exhibitionLabel, formatOMR, num, phoneKey, todayISO } from '../lib/format.js'
import { downloadRegistrationInvoice } from '../lib/pdf.js'
import { useData } from '../lib/useData.js'
import { chosenExtras } from '../api/registration.js'

const load = async () => {
  const [exhibitions, sites, exhibitors] = await Promise.all([
    listExhibitions(),
    listSites(),
    listExhibitors({ columns: 'id,exhibition_id,brand,phone' }),
  ])
  return { exhibitions: exhibitions.filter((ex) => !['منتهي', 'ملغى'].includes(ex.status)), sites, exhibitors }
}

const extraPrices = Object.fromEntries(BOOTH_EXTRAS.map((x) => [x.name, x.price]))

const blankForm = (exhibitionId = '') => ({
  exhibition_id: exhibitionId,
  manager: '',
  civil_id: '',
  brand: '',
  phone: '',
  category: '',
  products: '',
  package: '',
  site_id: '',
  booth_number: '',
  extras: {},
  extraPrices,
  otherExtras: '',
  otherAmount: '',
  amount: '',
  method: '',
  transfer_ref: '',
  date: todayISO(),
  notes: '',
  terms_accepted: false,
})

/** Choice buttons that behave like the form's "tick one box" rows. */
function Choices({ options, value, onChange, render = (o) => o, keyOf = (o) => o }) {
  return (
    <div className="choice-grid">
      {options.map((o) => {
        const key = keyOf(o)
        return (
          <button type="button" key={key} className={`choice ${value === key ? 'selected' : ''}`} onClick={() => onChange(key)}>
            {render(o)}
          </button>
        )
      })}
    </div>
  )
}

export default function Register() {
  const toast = useToast()
  const { data, loading, reload } = useData(load, null)
  const pending = !useCan('payments.write') // marketing: the payment waits for finance to confirm it
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(null)
  const savingRef = useRef(false)

  const exhibitions = useMemo(() => data?.exhibitions || [], [data])
  const defaultExhibition = exhibitions.length === 1 ? exhibitions[0].id : ''
  const f = form || blankForm(defaultExhibition)
  const set = (key) => (e) => setForm({ ...f, [key]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e })

  if (loading || !data) return <Loading />

  const exhibition = exhibitions.find((ex) => ex.id === f.exhibition_id)
  const pkg = BOOTH_PACKAGES.find((p) => p.name === f.package)
  const ownSites = data.sites.filter((s) => s.exhibition_id === f.exhibition_id)
  const freeSites = pkg ? ownSites.filter((s) => !s.exhibitor_id && num(s.price) === pkg.price) : []
  const extras = chosenExtras(f)
  const totals = registrationTotals({ boothPrice: pkg?.price || 0, extras })
  const amount = num(f.amount)
  const duplicate =
    phoneKey(f.phone) &&
    data.exhibitors.find((e) => e.exhibition_id === f.exhibition_id && phoneKey(e.phone) === phoneKey(f.phone))

  const setExtra = (name, qty) => setForm({ ...f, extras: { ...f.extras, [name]: Math.max(0, num(qty)) } })

  const submit = async () => {
    if (savingRef.current) return
    const errors = validateRegistration(f)
    if (ownSites.length && pkg && !f.site_id) errors.push('رقم الموقع')
    if (errors.length) return toast(`أكمل: ${errors.join('، ')}`, 'error')
    if (duplicate && !confirm(`${duplicate.brand} مسجّل بنفس رقم الهاتف في هذا المعرض. تسجيل مشاركة جديدة؟`)) return
    if (amount > totals.subtotal && !confirm(`المبلغ المدفوع أكبر من قيمة الاشتراك (${formatOMR(totals.subtotal)}). متابعة؟`)) return

    savingRef.current = true
    setSaving(true)
    try {
      const result = await registerParticipant(f, { pending, boothPrice: pkg.price })
      const invoice = { exhibitor: result.exhibitor, exhibition, payment: result.payment }
      setDone({ ...invoice, totals: result.totals, siteLost: result.siteLost })
      toast('✅ تم تسجيل المشارك')
      reload()
      try {
        await downloadRegistrationInvoice(invoice)
      } catch (err) {
        toast(`تم الحفظ، لكن تعذّر إنشاء الفاتورة: ${err.message}`, 'error')
      }
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  if (done) {
    const { exhibitor, payment, totals: t, siteLost } = done
    return (
      <>
        <PageHeader title="تسجيل مشارك" subtitle="استمارة تسجيل المشاركين" />
        <Panel icon="✅" title={`تم تسجيل ${exhibitor.brand}`}>
          {siteLost && (
            <div className="alert alert-warning">الموقع المختار حُجز لمشارك آخر في نفس اللحظة، فسُجّل المشارك بدون موقع. احجز له موقعاً من ملف المعرض.</div>
          )}
          {payment && pending && (
            <div className="alert alert-warning">الدفعة بانتظار تأكيد المالية أن المبلغ وصل. تظهر في الفاتورة بهذه الحالة.</div>
          )}
          <div className="summary-box">
            <div className="kv-row">
              <span>رقم الفاتورة</span>
              <strong className="mono">{payment?.invoice_no || '—'}</strong>
            </div>
            <div className="kv-row">
              <span>الإجمالي شامل الضريبة</span>
              <strong>{formatOMR(t.total)}</strong>
            </div>
            <div className="kv-row">
              <span>المدفوع شامل الضريبة</span>
              <strong className="text-suc">{formatOMR(withVat(payment?.amount || 0))}</strong>
            </div>
            <div className="kv-row kv-total">
              <span>المتبقي</span>
              <strong>{formatOMR(Math.max(0, t.total - withVat(payment?.amount || 0)))}</strong>
            </div>
          </div>
          <div className="row-actions mt-16">
            <Button onClick={() => downloadRegistrationInvoice(done).catch((err) => toast(err.message, 'error'))}>🧾 تحميل الفاتورة مرة أخرى</Button>
            <Button
              variant="outline"
              onClick={() => {
                setDone(null)
                setForm(blankForm(f.exhibition_id))
              }}
            >
              + تسجيل مشارك جديد
            </Button>
          </div>
        </Panel>
      </>
    )
  }

  return (
    <>
      <PageHeader title="تسجيل مشارك" subtitle="استمارة تسجيل المشاركين — تُصدر الفاتورة الضريبية مباشرة بعد الحفظ" />

      {!exhibitions.length && <EmptyState icon="🏛️" text="لا توجد معارض قادمة. أضف معرضاً أولاً." />}

      {exhibitions.length > 0 && (
        <div className="register-form">
          <Panel icon="🏛️" title="المعرض">
            <select className="input" value={f.exhibition_id} onChange={(e) => setForm({ ...f, exhibition_id: e.target.value, site_id: '' })}>
              <option value="">اختر المعرض...</option>
              {exhibitions.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {exhibitionLabel(ex)} — {ex.mall}
                </option>
              ))}
            </select>
          </Panel>

          <Panel icon="👤" title="بيانات المشارك">
            <div className="form-grid">
              <Field label="الاسم الكامل" required>
                <input className="input" value={f.manager} onChange={set('manager')} />
              </Field>
              <Field label="الرقم المدني">
                <input className="input" inputMode="numeric" dir="ltr" value={f.civil_id} onChange={set('civil_id')} />
              </Field>
              <Field label="اسم المشروع" required>
                <input className="input" value={f.brand} onChange={set('brand')} />
              </Field>
              <Field label="رقم التواصل (واتساب)" required>
                <input className="input" inputMode="tel" dir="ltr" placeholder="9XXXXXXX" value={f.phone} onChange={set('phone')} />
              </Field>
            </div>
            {duplicate && <div className="alert alert-warning">⚠️ {duplicate.brand} مسجّل بنفس رقم الهاتف في هذا المعرض.</div>}
            <Field label="القطاع — اختر واحداً" required>
              <Choices options={FORM_SECTORS} value={f.category} onChange={set('category')} />
            </Field>
            <Field label="نوع المنتجات">
              <input className="input" value={f.products} onChange={set('products')} />
            </Field>
          </Panel>

          <Panel icon="📍" title="نظام البوث والموقع" subtitle={BOOTH_NOTE}>
            <Choices
              options={BOOTH_PACKAGES}
              keyOf={(p) => p.name}
              value={f.package}
              onChange={(name) => setForm({ ...f, package: name, site_id: '' })}
              render={(p) => {
                const free = ownSites.filter((s) => !s.exhibitor_id && num(s.price) === p.price).length
                return (
                  <>
                    <span className="choice-title">{p.name}</span>
                    <span className="choice-price">{formatOMR(p.price)}</span>
                    <span className="choice-sub">{p.includes}</span>
                    {ownSites.length > 0 && <span className={`choice-sub ${free ? 'text-suc' : 'text-dng'}`}>{free ? `${free} موقع متاح` : 'لا توجد مواقع متاحة'}</span>}
                  </>
                )
              }}
            />
            {pkg && ownSites.length > 0 && (
              <Field label="رقم الموقع" required>
                {freeSites.length ? (
                  <select className="input" value={f.site_id} onChange={set('site_id')}>
                    <option value="">اختر الموقع...</option>
                    {freeSites.map((s) => (
                      <option key={s.id} value={s.id}>
                        موقع {s.number}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="alert alert-danger">كل مواقع «{pkg.name}» محجوزة في هذا المعرض.</div>
                )}
              </Field>
            )}
            {pkg && !ownSites.length && (
              <Field label="رقم الموقع" hint="هذا المعرض ليس له خارطة مواقع في النظام، فيُكتب الرقم يدوياً.">
                <input className="input" value={f.booth_number} onChange={set('booth_number')} />
              </Field>
            )}
          </Panel>

          <Panel icon="➕" title="إضافات اختيارية — برسوم إضافية">
            <div className="extras-grid">
              {BOOTH_EXTRAS.map((x) => (
                <div key={x.name} className="extra-row">
                  <label className="check-row">
                    <input type="checkbox" checked={num(f.extras[x.name]) > 0} onChange={(e) => setExtra(x.name, e.target.checked ? 1 : 0)} />
                    {x.name} <span className="muted small">{formatOMR(x.price)}</span>
                  </label>
                  {num(f.extras[x.name]) > 0 && (
                    <input className="input input-qty" type="number" min="1" value={f.extras[x.name]} onChange={(e) => setExtra(x.name, e.target.value)} title="الكمية" />
                  )}
                </div>
              ))}
            </div>
            <div className="form-grid mt-8">
              <Field label="إضافات أخرى مطلوبة">
                <input className="input" value={f.otherExtras} onChange={set('otherExtras')} />
              </Field>
              <Field label="رسومها (ر.ع)">
                <input className="input" type="number" min="0" step="0.001" value={f.otherAmount} onChange={set('otherAmount')} />
              </Field>
            </div>
            <div className="muted small">إجمالي الرسوم الإضافية: {formatOMR(totals.extrasTotal)}</div>
          </Panel>

          <Panel icon="💳" title="السداد">
            <div className="summary-box mb-16">
              <div className="kv-row">
                <span>قيمة الاشتراك {pkg ? `(${pkg.name})` : ''}</span>
                <strong>{formatOMR(totals.boothPrice)}</strong>
              </div>
              <div className="kv-row">
                <span>الرسوم الإضافية</span>
                <strong>{formatOMR(totals.extrasTotal)}</strong>
              </div>
              <div className="kv-row muted small">
                <span>ضريبة القيمة المضافة 5%</span>
                <span>{formatOMR(totals.vat)}</span>
              </div>
              <div className="kv-row kv-total">
                <span>الإجمالي شامل الضريبة</span>
                <strong>{formatOMR(totals.total)}</strong>
              </div>
            </div>
            <div className="form-grid">
              <Field label="قيمة الاشتراك المدفوعة (قبل الضريبة)" hint={amount > 0 ? `المستلم فعلياً شامل الضريبة: ${formatOMR(withVat(amount))}` : 'اتركه صفراً إذا لم يدفع بعد'}>
                <div className="input-with-action">
                  <input className="input" type="number" min="0" step="0.001" placeholder="0.000" value={f.amount} onChange={set('amount')} />
                  {totals.subtotal > 0 && (
                    <Button size="sm" variant="outline" onClick={() => setForm({ ...f, amount: String(totals.subtotal) })}>
                      دفع كامل
                    </Button>
                  )}
                </div>
              </Field>
              <Field label="التاريخ">
                <DateInput value={f.date} onChange={set('date')} />
              </Field>
            </div>
            <Field label="طريقة السداد" required={amount > 0}>
              <Choices options={FORM_PAYMENT_METHODS} keyOf={(m) => m.value} render={(m) => m.label} value={f.method} onChange={set('method')} />
            </Field>
            {f.method && f.method !== 'نقد' && (
              <Field label="رقم الحساب أو رقم الشخص الذي تم التحويل إليه">
                <input className="input" dir="auto" value={f.transfer_ref} onChange={set('transfer_ref')} />
              </Field>
            )}
            {pending && amount > 0 && <div className="alert alert-warning">تُسجَّل الدفعة «بانتظار التأكيد» حتى تتأكد المالية من وصول المبلغ.</div>}
          </Panel>

          <Panel icon="📝" title="الملاحظات والموافقة">
            <Field label="ملاحظات">
              <textarea className="input" rows={2} value={f.notes} onChange={set('notes')} />
            </Field>
            <label className="check-row terms-row">
              <input type="checkbox" checked={f.terms_accepted} onChange={set('terms_accepted')} />
              أقرّ بأن المشارك اطّلع على الشروط والأحكام ووافق عليها
            </label>
          </Panel>

          <div className="register-submit">
            <Button onClick={submit} disabled={saving} full>
              {saving ? 'جاري الحفظ...' : '💾 حفظ وإصدار الفاتورة'}
            </Button>
          </div>
        </div>
      )}
    </>
  )
}
