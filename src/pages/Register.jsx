import { useMemo, useRef, useState } from 'react'
import DateInput from '../components/DateInput.jsx'
import { listExhibitions } from '../api/exhibitions.js'
import { listExhibitors } from '../api/exhibitors.js'
import { listSites } from '../api/exhibitionFile.js'
import { registerParticipant, validateRegistration } from '../api/registration.js'
import { clientWithPhone } from '../api/clients.js'
import Button from '../components/Button.jsx'
import { EmptyState, Loading } from '../components/Feedback.jsx'
import ExhibitionMap from '../components/ExhibitionMap.jsx'
import Field from '../components/Field.jsx'
import PageHeader from '../components/PageHeader.jsx'
import Panel from '../components/Panel.jsx'
import { useCan } from '../context/AuthContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { BOOTH_EXTRAS, BOOTH_NOTE, BOOTH_PACKAGES, FORM_PAYMENT_METHODS, FORM_SECTORS } from '../lib/constants.js'
import { registrationTotals, vatEnabled, vatOf, withoutVat, withVat } from '../lib/finance.js'
import { exhibitionLabel, formatDate, formatOMR, num, phoneKey, todayISO } from '../lib/format.js'
import { downloadRegistrationInvoice } from '../lib/pdf.js'
import { useData } from '../lib/useData.js'
import { boothHolder } from '../lib/sites.js'
import { chosenExtras, MAX_SECTORS } from '../api/registration.js'
import { tr } from '../lib/i18n.js'

const load = async () => {
  const [exhibitions, sites, exhibitors] = await Promise.all([
    listExhibitions(),
    listSites(),
    listExhibitors({ columns: 'id,exhibition_id,brand,phone,booth' }),
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
  categories: [],
  products: '',
  package: '',
  site_id: '',
  booth_number: '',
  extras: {},
  extraPrices,
  otherExtras: '',
  otherAmount: '',
  discount: '',
  amount: '',
  method: '',
  transfer_ref: '',
  date: todayISO(),
  notes: '',
  terms_accepted: false,
})

/** Choice buttons that behave like the form's "tick one box" rows. */
function Choices({ options, value, onChange, render = (o) => tr(o), keyOf = (o) => o }) {
  const picked = (key) => (Array.isArray(value) ? value.includes(key) : value === key)
  return (
    <div className="choice-grid">
      {options.map((o) => {
        const key = keyOf(o)
        return (
          <button type="button" key={key} className={`choice ${picked(key) ? 'selected' : ''}`} aria-pressed={picked(key)} onClick={() => onChange(key)}>
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
  const [known, setKnown] = useState(null) // the number is already in the client database (anyone's)
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
  const amount = num(f.amount) // paid (VAT included when the company charges VAT)
  const withTax = vatEnabled() ? tr(' شامل الضريبة') : ''
  const amountNet = withoutVat(amount)
  const toggleSector = (name) => {
    const list = f.categories.includes(name) ? f.categories.filter((c) => c !== name) : [...f.categories, name]
    if (list.length > MAX_SECTORS) return toast(tr('يمكن اختيار {0} قطاعات كحد أقصى', [MAX_SECTORS]), 'error')
    setForm({ ...f, categories: list })
  }
  const duplicate =
    phoneKey(f.phone) &&
    data.exhibitors.find((e) => e.exhibition_id === f.exhibition_id && phoneKey(e.phone) === phoneKey(f.phone))

  // One site = one participant: a number typed by hand must not be taken in this exhibition.
  const takenBooth = !ownSites.length && f.booth_number?.trim() ? boothHolder(data.exhibitors, f.exhibition_id, f.booth_number) : null
  const setExtra = (name, qty) => setForm({ ...f, extras: { ...f.extras, [name]: Math.max(0, num(qty)) } })

  const submit = async () => {
    if (savingRef.current) return
    const errors = validateRegistration(f)
    if (ownSites.length && pkg && !f.site_id) errors.push(tr('رقم الموقع'))
    if (num(f.discount) > totals.boothPrice + totals.extrasTotal + 0.0005) errors.push('الخصم أكبر من قيمة الاشتراك والإضافات')
    if (errors.length) return toast(tr('أكمل: {0}', [errors.map((x) => tr(x)).join(tr('، '))]), 'error')
    if (takenBooth) return toast(tr('الموقع {0} محجوز مسبقاً لـ «{1}» في هذا المعرض', [takenBooth.numbers.join(tr('، ')), takenBooth.exhibitor.brand]), 'error')
    if (duplicate && !confirm(tr('{0} مسجّل بنفس رقم الهاتف في هذا المعرض. تسجيل مشاركة جديدة؟', [duplicate.brand]))) return
    if (amount > totals.total + 0.0005 && !confirm(tr('المبلغ المدفوع أكبر من الإجمالي{0} ({1}). متابعة؟', [withTax, formatOMR(totals.total)]))) return

    savingRef.current = true
    setSaving(true)
    try {
      const result = await registerParticipant(f, { pending, boothPrice: pkg.price })
      const invoice = { exhibitor: result.exhibitor, exhibition, payment: result.payment }
      setDone({ ...invoice, totals: result.totals, siteLost: result.siteLost })
      toast(tr('✅ تم تسجيل المشارك'))
      reload()
      try {
        await downloadRegistrationInvoice(invoice)
      } catch (err) {
        toast(tr('تم الحفظ، لكن تعذّر إنشاء الفاتورة: {0}', [err.message]), 'error')
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
        <PageHeader title={tr('تسجيل مشارك')} subtitle={tr('استمارة تسجيل المشاركين')} />
        <Panel icon="✅" title={tr('تم تسجيل {0}', [exhibitor.brand])}>
          {siteLost && (
            <div className="alert alert-warning">{tr('الموقع المختار حُجز لمشارك آخر في نفس اللحظة، فسُجّل المشارك بدون موقع. احجز له موقعاً من ملف المعرض.')}</div>
          )}
          {payment && pending && (
            <div className="alert alert-warning">{tr('الدفعة بانتظار تأكيد المالية أن المبلغ وصل. تظهر في الفاتورة بهذه الحالة.')}</div>
          )}
          <div className="summary-box">
            <div className="kv-row">
              <span>{tr('رقم الفاتورة')}</span>
              <strong className="mono">{payment?.invoice_no || '—'}</strong>
            </div>
            <div className="kv-row">
              <span>{tr('الإجمالي')}{tr(withTax)}</span>
              <strong>{formatOMR(t.total)}</strong>
            </div>
            <div className="kv-row">
              <span>{tr('المدفوع')}{tr(withTax)}</span>
              <strong className="text-suc">{formatOMR(withVat(payment?.amount || 0))}</strong>
            </div>
            <div className="kv-row kv-total">
              <span>{tr('المتبقي')}</span>
              <strong>{formatOMR(Math.max(0, t.total - withVat(payment?.amount || 0)))}</strong>
            </div>
          </div>
          <div className="row-actions mt-16">
            <Button onClick={() => downloadRegistrationInvoice(done).catch((err) => toast(err.message, 'error'))}>{tr('🧾 تحميل الفاتورة مرة أخرى')}</Button>
            <Button
              variant="outline"
              onClick={() => {
                setDone(null)
                setForm(blankForm(f.exhibition_id))
              }}
            >
              {tr('+ تسجيل مشارك جديد')}
            </Button>
          </div>
        </Panel>
      </>
    )
  }

  return (
    <>
      <PageHeader title={tr('تسجيل مشارك')} subtitle={tr('استمارة تسجيل المشاركين — تُصدر الفاتورة مباشرة بعد الحفظ')} />

      {!exhibitions.length && <EmptyState icon="🏛️" text={tr('لا توجد معارض قادمة. أضف معرضاً أولاً.')} />}

      {exhibitions.length > 0 && (
        <div className="register-form">
          <Panel icon="🏛️" title={tr('المعرض')}>
            <select className="input" value={f.exhibition_id} onChange={(e) => setForm({ ...f, exhibition_id: e.target.value, site_id: '' })}>
              <option value="">{tr('اختر المعرض...')}</option>
              {exhibitions.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {exhibitionLabel(ex)} — {tr(ex.mall)}
                </option>
              ))}
            </select>
          </Panel>

          <Panel icon="👤" title={tr('بيانات المشارك')}>
            <div className="form-grid">
              <Field label={tr('الاسم الكامل')} required>
                <input className="input" value={f.manager} onChange={set('manager')} />
              </Field>
              <Field label={tr('الرقم المدني')}>
                <input className="input" inputMode="numeric" dir="ltr" value={f.civil_id} onChange={set('civil_id')} />
              </Field>
              <Field label={tr('اسم المشروع')} required>
                <input className="input" value={f.brand} onChange={set('brand')} />
              </Field>
              <Field label={tr('رقم التواصل (واتساب)')} required>
                <input
                  className="input"
                  inputMode="tel"
                  dir="ltr"
                  placeholder="9XXXXXXX"
                  value={f.phone}
                  onChange={(e) => {
                    set('phone')(e)
                    setKnown(null)
                  }}
                  onBlur={() => clientWithPhone(f.phone).then(setKnown, () => setKnown(null))}
                />
              </Field>
            </div>
            {duplicate && <div className="alert alert-warning">⚠️ {tr(duplicate.brand)}{' '}{tr('مسجّل بنفس رقم الهاتف في هذا المعرض.')}</div>}
            {known && !known.owner_is_me && (
              <div className="alert alert-warning">
                {tr('ℹ️ هذا المشروع تمت إضافته من قبل في قاعدة العملاء: «')}{tr(known.name)}{tr('» — أضافه')}{' '}{tr(known.owner_name)}{' '}{tr('بتاريخ')}{' '}{formatDate(known.created_at)}{tr('. يُربط التسجيل بنفس العميل.')}
              </div>
            )}
            <Field label={tr('القطاع — اختر قطاعاً أو أكثر (حتى {0})', [MAX_SECTORS])} required>
              <Choices options={FORM_SECTORS} value={f.categories} onChange={toggleSector} />
            </Field>
            <Field label={tr('نوع المنتجات')}>
              <input className="input" value={f.products} onChange={set('products')} />
            </Field>
          </Panel>

          <Panel icon="📍" title={tr('نظام البوث والموقع')} subtitle={BOOTH_NOTE}>
            {exhibition?.map_path && (
              <details className="map-details mb-16">
                <summary>{tr('🗺️ عرض خارطة المعرض')}</summary>
                <ExhibitionMap key={exhibition.map_path} path={exhibition.map_path} />
              </details>
            )}
            <Choices
              options={BOOTH_PACKAGES}
              keyOf={(p) => p.name}
              value={f.package}
              onChange={(name) => setForm({ ...f, package: name, site_id: '' })}
              render={(p) => {
                const free = ownSites.filter((s) => !s.exhibitor_id && num(s.price) === p.price).length
                return (
                  <>
                    <span className="choice-title">{tr(p.name)}</span>
                    <span className="choice-price">{formatOMR(p.price)}</span>
                    <span className="choice-sub">{tr(p.includes)}</span>
                    {ownSites.length > 0 && <span className={`choice-sub ${free ? 'text-suc' : 'text-dng'}`}>{free ? tr('{0} موقع متاح', [free]) : tr('لا توجد مواقع متاحة')}</span>}
                  </>
                )
              }}
            />
            {pkg && ownSites.length > 0 && (
              <Field label={tr('رقم الموقع')} required>
                {freeSites.length ? (
                  <select className="input" value={f.site_id} onChange={set('site_id')}>
                    <option value="">{tr('اختر الموقع...')}</option>
                    {freeSites.map((s) => (
                      <option key={s.id} value={s.id}>
                        {tr('موقع')}{' '}{s.number}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="alert alert-danger">{tr('كل مواقع «')}{tr(pkg.name)}{tr('» محجوزة في هذا المعرض.')}</div>
                )}
              </Field>
            )}
            {pkg && !ownSites.length && (
              <Field label={tr('رقم الموقع')} hint={tr('هذا المعرض ليس له خارطة مواقع في النظام، فيُكتب الرقم يدوياً.')}>
                <input className={`input ${takenBooth ? 'input-invalid' : ''}`} value={f.booth_number} onChange={set('booth_number')} />
              </Field>
            )}
            {takenBooth && (
              <div className="alert alert-danger">
                ⛔ {tr('الموقع {0} محجوز مسبقاً لـ «{1}» في هذا المعرض — كل موقع لمشارك واحد فقط.', [takenBooth.numbers.join(tr('، ')), takenBooth.exhibitor.brand])}
              </div>
            )}
          </Panel>

          <Panel icon="➕" title={tr('إضافات اختيارية — برسوم إضافية')}>
            <div className="extras-grid">
              {BOOTH_EXTRAS.map((x) => (
                <div key={x.name} className="extra-row">
                  <label className="check-row">
                    <input type="checkbox" checked={num(f.extras[x.name]) > 0} onChange={(e) => setExtra(x.name, e.target.checked ? 1 : 0)} />
                    {tr(x.name)} <span className="muted small">{formatOMR(x.price)}</span>
                  </label>
                  {num(f.extras[x.name]) > 0 && (
                    <input className="input input-qty" type="number" min="1" value={f.extras[x.name]} onChange={(e) => setExtra(x.name, e.target.value)} title={tr('الكمية')} />
                  )}
                </div>
              ))}
            </div>
            <div className="form-grid mt-8">
              <Field label={tr('إضافات أخرى مطلوبة')}>
                <input className="input" value={f.otherExtras} onChange={set('otherExtras')} />
              </Field>
              <Field label={tr('رسومها (ر.ع)')}>
                <input className="input" type="number" min="0" step="0.001" value={f.otherAmount} onChange={set('otherAmount')} />
              </Field>
            </div>
            <div className="muted small">{tr('إجمالي الرسوم الإضافية:')}{' '}{formatOMR(totals.extrasTotal)}</div>
          </Panel>

          {!pending && (
            <Panel icon="🏷️" title={tr('خصم (اختياري)')} subtitle={tr('للمدير والمالية فقط — يظهر في الفاتورة سطراً مستقلاً، وتُحسب قيمة العقد بعده')}>
              <Field label={tr('مبلغ الخصم (ر.ع)')}>
                <input className="input" type="number" min="0" step="0.001" placeholder="0.000" value={f.discount} onChange={set('discount')} />
              </Field>
            </Panel>
          )}

          <Panel icon="💳" title={tr('السداد')}>
            <div className="summary-box mb-16">
              <div className="kv-row">
                <span>{tr('قيمة الاشتراك')}{' '}{pkg ? `(${pkg.name})` : ''}</span>
                <strong>{formatOMR(totals.boothPrice)}</strong>
              </div>
              <div className="kv-row">
                <span>{tr('الرسوم الإضافية')}</span>
                <strong>{formatOMR(totals.extrasTotal)}</strong>
              </div>
              {totals.discount > 0 && (
                <div className="kv-row">
                  <span>{tr('الخصم')}</span>
                  <strong className="text-dng">− {formatOMR(totals.discount)}</strong>
                </div>
              )}
              {vatEnabled() && (
                <div className="kv-row muted small">
                  <span>{tr('ضريبة القيمة المضافة 5%')}</span>
                  <span>{formatOMR(totals.vat)}</span>
                </div>
              )}
              <div className="kv-row kv-total">
                <span>{tr('الإجمالي')}{tr(withTax)}</span>
                <strong>{formatOMR(totals.total)}</strong>
              </div>
            </div>
            <div className="form-grid">
              <Field
                label={vatEnabled() ? tr('المبلغ المدفوع (شامل الضريبة)') : tr('المبلغ المدفوع')}
                hint={
                  amount > 0 && vatEnabled()
                    ? tr('منها {0} قيمة الاشتراك + {1} ضريبة 5%', [formatOMR(amountNet), formatOMR(vatOf(amountNet))])
                    : tr('المبلغ الذي استلمته فعلاً من المشارك. اتركه فارغاً إذا لم يدفع بعد')
                }
              >
                <div className="input-with-action">
                  <input className="input" type="number" min="0" step="0.001" placeholder="0.000" value={f.amount} onChange={set('amount')} />
                  {totals.total > 0 && (
                    <Button size="sm" variant="outline" onClick={() => setForm({ ...f, amount: String(totals.total) })}>
                      {tr('دفع كامل')}
                    </Button>
                  )}
                </div>
              </Field>
              <Field label={tr('التاريخ')}>
                <DateInput value={f.date} onChange={set('date')} />
              </Field>
            </div>
            <Field label={tr('طريقة السداد')} required={amount > 0}>
              <Choices options={FORM_PAYMENT_METHODS} keyOf={(m) => m.value} render={(m) => tr(m.label)} value={f.method} onChange={set('method')} />
            </Field>
            {f.method && f.method !== 'نقد' && (
              <Field label={tr('رقم الحساب أو رقم الشخص الذي تم التحويل إليه')}>
                <input className="input" dir="auto" value={f.transfer_ref} onChange={set('transfer_ref')} />
              </Field>
            )}
            {pending && amount > 0 && <div className="alert alert-warning">{tr('تُسجَّل الدفعة «بانتظار التأكيد» حتى تتأكد المالية من وصول المبلغ.')}</div>}
          </Panel>

          <Panel icon="📝" title={tr('الملاحظات والموافقة')}>
            <Field label={tr('ملاحظات')}>
              <textarea className="input" rows={2} value={f.notes} onChange={set('notes')} />
            </Field>
            <label className="check-row terms-row">
              <input type="checkbox" checked={f.terms_accepted} onChange={set('terms_accepted')} />
              {tr('أقرّ بأن المشارك اطّلع على الشروط والأحكام ووافق عليها')}
            </label>
          </Panel>

          <div className="register-submit">
            <Button onClick={submit} disabled={saving} full>
              {saving ? tr('جاري الحفظ...') : tr('💾 حفظ وإصدار الفاتورة')}
            </Button>
          </div>
        </div>
      )}
    </>
  )
}
