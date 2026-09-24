import { useState } from 'react'
import { deleteExhibition, listExhibitions, saveExhibition } from '../api/exhibitions.js'
import { listExhibitors } from '../api/exhibitors.js'
import { listPayments } from '../api/payments.js'
import Button from '../components/Button.jsx'
import Field, { SelectOptions } from '../components/Field.jsx'
import { Loading } from '../components/Feedback.jsx'
import Modal from '../components/Modal.jsx'
import PageHeader from '../components/PageHeader.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { CITIES, DEFAULT_TIERS, EXHIBITION_STATUSES } from '../lib/constants.js'
import { exhibitionStats, tiersOf } from '../lib/finance.js'
import { formatOMR, num } from '../lib/format.js'
import { useData } from '../lib/useData.js'

const load = async () => {
  const [exhibitions, exhibitors, payments] = await Promise.all([
    listExhibitions(),
    listExhibitors({ columns: 'id,exhibition_id,paid,contract' }),
    listPayments('amount,exhibitor_id'),
  ])
  return { exhibitions, exhibitors, payments }
}

function newExhibitionForm() {
  const form = { status: 'تخطيط' }
  DEFAULT_TIERS.forEach((tier, idx) => {
    form[`booth_tier${idx + 1}_name`] = tier.name
    form[`booth_tier${idx + 1}_price`] = tier.price
    form[`booth_tier${idx + 1}_count`] = tier.count
  })
  return form
}

const TIER_PLACEHOLDERS = ['مثال: أمامي VIP', 'مثال: وسط', 'مثال: خلفي اقتصادي']

function ExhibitionForm({ initial, id, onClose, onSaved }) {
  const toast = useToast()
  const [form, setForm] = useState(initial)
  const [saving, setSaving] = useState(false)
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  const totalBooths = [1, 2, 3].reduce((t, i) => t + num(form[`booth_tier${i}_count`]), 0)

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
        <Field label="اسم المجمع التجاري" required>
          <input className="input" placeholder="مثال: سيتي سنتر مسقط" value={form.mall || ''} onChange={set('mall')} />
        </Field>
        <Field label="تاريخ البداية" required>
          <input className="input" type="date" value={form.date_from || ''} onChange={set('date_from')} />
        </Field>
        <Field label="تاريخ النهاية" required>
          <input className="input" type="date" value={form.date_to || ''} onChange={set('date_to')} />
        </Field>
        <Field label="الحالة">
          <SelectOptions options={EXHIBITION_STATUSES} placeholder={null} value={form.status || 'تخطيط'} onChange={set('status')} />
        </Field>
        <Field label="إجمالي البوثات">
          <input className="input input-readonly" value={`${totalBooths} بوث`} readOnly />
        </Field>
      </div>

      <div className="tier-box">
        <div className="tier-box-title">🏷️ فئات البوثات وأسعارها</div>
        {[1, 2, 3].map((i) => (
          <div key={i} className="tier-row">
            <Field label={`اسم الفئة ${i}`}>
              <input className="input" placeholder={TIER_PLACEHOLDERS[i - 1]} value={form[`booth_tier${i}_name`] || ''} onChange={set(`booth_tier${i}_name`)} />
            </Field>
            <Field label="السعر (ر.ع)">
              <input className="input" type="number" min="0" step="0.001" placeholder="0.000" value={form[`booth_tier${i}_price`] ?? ''} onChange={set(`booth_tier${i}_price`)} />
            </Field>
            <Field label="العدد">
              <input className="input" type="number" min="0" placeholder="0" value={form[`booth_tier${i}_count`] ?? ''} onChange={set(`booth_tier${i}_count`)} />
            </Field>
          </div>
        ))}
        <div className="tier-total">
          الإجمالي: <strong>{totalBooths} بوث</strong>
        </div>
      </div>

      <Field label="ملاحظات" className="mt-14">
        <textarea className="input" rows={2} placeholder="أي تفاصيل إضافية..." value={form.notes || ''} onChange={set('notes')} />
      </Field>
    </Modal>
  )
}

export default function Exhibitions() {
  const toast = useToast()
  const { data, loading, reload } = useData(load, null)
  const [editing, setEditing] = useState(null) // { form, id } while the modal is open

  if (loading || !data) return <Loading />
  const { exhibitions, exhibitors, payments } = data

  const remove = async (ex) => {
    if (!confirm(`حذف معرض ${ex.city} وكل بياناته؟`)) return
    try {
      await deleteExhibition(ex.id)
      toast('🗑️ تم الحذف')
      reload()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  const openNew = () => setEditing({ form: newExhibitionForm(), id: null })

  return (
    <>
      <PageHeader title="المعارض والمواعيد" subtitle={`${exhibitions.length} معرض مسجل`}>
        <Button onClick={openNew}>🏛️ + إضافة معرض</Button>
      </PageHeader>

      <div className="cards-grid">
        {exhibitions.map((ex) => {
          const stats = exhibitionStats(ex, exhibitors, payments)
          return (
            <article key={ex.id} className="ex-card">
              <div className="ex-card-head">
                <div className="ex-card-city">{ex.city} • سلطنة عُمان</div>
                <div className="ex-card-brand">SOVA</div>
                <div className="ex-card-meta">
                  📅 {ex.date_from} – {ex.date_to}
                </div>
                <div className="ex-card-meta dim">📍 {ex.mall}</div>
                <div className="ex-card-status">
                  <StatusBadge status={ex.status} />
                </div>
              </div>
              <div className="ex-card-tiers">
                {tiersOf(ex, DEFAULT_TIERS).map((tier, idx) => (
                  <div key={idx} className="tier-chip">
                    <div className="strong small">{tier.name}</div>
                    <div className="tier-chip-price">{tier.price} ر.ع</div>
                    <div className="muted tiny">{tier.count} بوث</div>
                  </div>
                ))}
              </div>
              <div className="ex-card-stats">
                {[
                  ['البوثات المحجوزة', `${stats.booked} / ${stats.capacity}`],
                  ['إجمالي العقود', formatOMR(stats.contract)],
                  ['المحصّل', formatOMR(stats.collected)],
                  ['المتبقي', formatOMR(stats.remaining)],
                ].map(([label, value]) => (
                  <div key={label} className="kv-row">
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
              <div className="ex-card-actions">
                <Button size="sm" variant="outline" onClick={() => setEditing({ form: { ...ex }, id: ex.id })}>
                  ✏️ تعديل
                </Button>
                <Button size="sm" variant="danger" onClick={() => remove(ex)} aria-label="حذف">
                  🗑️
                </Button>
              </div>
            </article>
          )
        })}

        <button className="add-card" onClick={openNew}>
          <div className="add-card-icon">🏛️</div>
          <div className="strong">+ إضافة معرض جديد</div>
        </button>
      </div>

      {editing && (
        <ExhibitionForm
          initial={editing.form}
          id={editing.id}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            reload()
          }}
        />
      )}
    </>
  )
}
