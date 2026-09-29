import { useEffect, useState } from 'react'
import { KIND_BOOKING, KIND_INQUIRY, listPublicExhibitions, submitPublicBooking } from '../api/publicBooking.js'
import Icon from '../components/Icon.jsx'
import LanguageSwitch from '../components/LanguageSwitch.jsx'
import { CATEGORIES, COMPANY } from '../lib/constants.js'
import { formatOMR } from '../lib/format.js'
import { tr, uiLocale } from '../lib/i18n.js'
import { whatsappUrl } from '../lib/whatsapp.js'

const EMPTY = { kind: KIND_BOOKING, brand: '', manager: '', phone: '', email: '', category: '', exhibition_id: '', package: '', message: '' }

const titleOf = (ex) => ex.name?.trim() || `${COMPANY.brand} ${tr(ex.city)}`
/** "27 ديسمبر 2026" — words, so the dates read right in Arabic and English. */
const longDate = (d) => new Date(`${d}T00:00:00`).toLocaleDateString(uiLocale(), { day: 'numeric', month: 'long', year: 'numeric' })
const packageLabel = (p) => [p.name, p.area].filter(Boolean).join(' — ')

function ExhibitionCard({ ex, selected, onPick }) {
  return (
    <button type="button" className={`pub-ex ${selected ? 'active' : ''}`} onClick={onPick}>
      <div className="pub-ex-title">{tr(titleOf(ex))}</div>
      <div className="pub-ex-meta">
        <span><Icon name="mapPin" size={14} /> {tr(ex.city)}{ex.mall ? ` • ${tr(ex.mall)}` : ''}</span>
        <span><Icon name="calendar" size={14} /> {longDate(ex.date_from)} – {longDate(ex.date_to)}</span>
        {ex.hours && <span><Icon name="clock" size={14} /> {tr(ex.hours)}</span>}
      </div>
      {ex.packages?.length > 0 && (
        <div className="pub-ex-packages">
          {ex.packages.map((p) => (
            <span key={p.name} className="pub-pkg">
              {tr(packageLabel(p))}
              {Number(p.price) > 0 && <strong>{formatOMR(p.price)}</strong>}
            </span>
          ))}
        </div>
      )}
    </button>
  )
}

/** Public page (no account): booking request or inquiry → «طلبات الحجز». */
export default function PublicBooking() {
  const [exhibitions, setExhibitions] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [form, setForm] = useState(EMPTY)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(null)

  useEffect(() => {
    listPublicExhibitions()
      .then(setExhibitions)
      .catch((err) => {
        setExhibitions([])
        setLoadError(err.message)
      })
  }, [])

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  const pick = (id) => setForm((f) => ({ ...f, exhibition_id: f.exhibition_id === id ? '' : id, package: '' }))
  const chosen = exhibitions?.find((ex) => ex.id === form.exhibition_id)
  const booking = form.kind === KIND_BOOKING

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!form.manager.trim()) return setError(tr('اكتب اسمك'))
    if (form.phone.replace(/\D/g, '').length < 8) return setError(tr('رقم الجوال غير صحيح — 8 أرقام على الأقل'))
    if (booking && !form.brand.trim()) return setError(tr('اكتب اسم المشروع أو البراند'))
    if (booking && !form.exhibition_id) return setError(tr('اختر المعرض من القائمة'))
    if (!booking && !form.message.trim()) return setError(tr('اكتب استفسارك'))
    setBusy(true)
    try {
      await submitPublicBooking(form)
      setSent({ kind: form.kind, exhibition: chosen })
      setForm(EMPTY)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const waText = tr('السلام عليكم، أرغب بالاستفسار عن معارض {0}', [COMPANY.brand])

  return (
    <div className="pub">
      <div className="login-glow login-glow-a" />
      <div className="login-glow login-glow-b" />
      <LanguageSwitch className="login-lang" />

      <div className="pub-box slide-in">
        <div className="login-brand pub-brand">
          <img className="login-logo" src={COMPANY.logoLight} alt={COMPANY.nameEn} />
          <div className="pub-headline">{tr('احجز مساحتك في معارض {0}', [COMPANY.brand])}</div>
          <div className="login-sub">{tr('أرسل طلب حجز أو استفسار، ويتواصل معك فريقنا في أقرب وقت')}</div>
        </div>

        {sent ? (
          <div className="login-card center pub-done">
            <div className="pub-done-icon"><Icon name="checkCircle" size={44} /></div>
            <div className="login-title">{sent.kind === KIND_BOOKING ? tr('وصلنا طلب الحجز ✔') : tr('وصلنا استفسارك ✔')}</div>
            <div className="login-hint">
              {sent.exhibition ? tr('طلبك لمعرض {0}. سيتواصل معك فريقنا لتأكيد الموقع والسعر.', [tr(titleOf(sent.exhibition))]) : tr('سيتواصل معك فريقنا قريباً.')}
            </div>
            <button type="button" className="btn btn-outline btn-full" onClick={() => setSent(null)}>
              {tr('إرسال طلب آخر')}
            </button>
          </div>
        ) : (
          <form className="login-card pub-card" onSubmit={submit} noValidate>
            <div className="pub-kinds" role="tablist">
              {[
                [KIND_BOOKING, 'طلب حجز في معرض', 'package'],
                [KIND_INQUIRY, 'استفسار / تواصل معنا', 'message'],
              ].map(([kind, label, icon]) => (
                <button key={kind} type="button" role="tab" aria-selected={form.kind === kind} className={`pub-kind ${form.kind === kind ? 'active' : ''}`} onClick={() => setForm((f) => ({ ...f, kind }))}>
                  <Icon name={icon} size={18} /> {tr(label)}
                </button>
              ))}
            </div>

            {error && <div className="alert alert-danger">⚠️ {error}</div>}

            <div className="pub-section">{booking ? tr('اختر المعرض') : tr('عن أي معرض؟ (اختياري)')}</div>
            {exhibitions === null && <div className="muted small mb-16">{tr('جاري تحميل المعارض...')}</div>}
            {exhibitions?.length === 0 && <div className="alert alert-info mb-16">{loadError || tr('لا توجد معارض مفتوحة للحجز حالياً — أرسل استفساراً وسنبلغك بالمعارض القادمة.')}</div>}
            <div className="pub-ex-list">
              {exhibitions?.map((ex) => (
                <ExhibitionCard key={ex.id} ex={ex} selected={form.exhibition_id === ex.id} onPick={() => pick(ex.id)} />
              ))}
            </div>

            {booking && chosen?.packages?.length > 0 && (
              <label className="field">
                <span className="field-label">{tr('الباقة المطلوبة')}</span>
                <select className="input input-lg" value={form.package} onChange={set('package')}>
                  <option value="">{tr('لم أحدد بعد')}</option>
                  {chosen.packages.map((p) => (
                    <option key={p.name} value={packageLabel(p)}>
                      {tr(packageLabel(p))}{Number(p.price) > 0 ? ` — ${formatOMR(p.price)}` : ''}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <div className="pub-section">{tr('بياناتك')}</div>
            <div className="pub-grid">
              <label className="field">
                <span className="field-label">{tr('الاسم')} *</span>
                <input className="input input-lg" autoComplete="name" maxLength={120} value={form.manager} onChange={set('manager')} />
              </label>
              <label className="field">
                <span className="field-label">{tr('رقم الجوال / واتساب')} *</span>
                <input className="input input-lg" type="tel" dir="ltr" inputMode="tel" autoComplete="tel" placeholder="9xxxxxxx" maxLength={20} value={form.phone} onChange={set('phone')} />
              </label>
              <label className="field">
                <span className="field-label">{tr('اسم المشروع / البراند')}{booking ? ' *' : ''}</span>
                <input className="input input-lg" maxLength={120} value={form.brand} onChange={set('brand')} />
              </label>
              <label className="field">
                <span className="field-label">{tr('البريد الإلكتروني (اختياري)')}</span>
                <input className="input input-lg" type="email" dir="ltr" autoComplete="email" maxLength={160} value={form.email} onChange={set('email')} />
              </label>
              {booking && (
                <label className="field">
                  <span className="field-label">{tr('نشاط المشروع')}</span>
                  <select className="input input-lg" value={form.category} onChange={set('category')}>
                    <option value="">{tr('اختر')}</option>
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>{tr(c)}</option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            <label className="field">
              <span className="field-label">{booking ? tr('ملاحظات (اختياري)') : tr('استفسارك')} {booking ? '' : '*'}</span>
              <textarea className="input" rows={4} maxLength={1000} value={form.message} onChange={set('message')} />
            </label>

            <button type="submit" className="btn btn-primary btn-lg btn-full login-submit" disabled={busy}>
              {busy ? tr('جاري الإرسال...') : booking ? tr('إرسال طلب الحجز') : tr('إرسال الاستفسار')}
            </button>
          </form>
        )}

        <div className="pub-contact">
          <a href={whatsappUrl(COMPANY.whatsapp, waText)} target="_blank" rel="noopener noreferrer"><Icon name="message" size={16} /> {tr('واتساب')}</a>
          <a href={`tel:${COMPANY.phone}`} dir="ltr"><Icon name="phone" size={16} /> {COMPANY.phone}</a>
          <a href={`mailto:${COMPANY.email}`} dir="ltr"><Icon name="mail" size={16} /> {COMPANY.email}</a>
          <a href={`https://instagram.com/${COMPANY.instagram.replace('@', '')}`} target="_blank" rel="noopener noreferrer" dir="ltr"><Icon name="camera" size={16} /> {COMPANY.instagram}</a>
        </div>
        <div className="login-cr center pub-legal">
          {tr(COMPANY.legalName)} • {tr(COMPANY.cr)}
        </div>
      </div>
    </div>
  )
}
