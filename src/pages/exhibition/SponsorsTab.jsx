import { useState } from 'react'
import { useCan } from '../../context/AuthContext.jsx'
import { deleteSponsor, saveSponsor } from '../../api/exhibitionFile.js'
import Button from '../../components/Button.jsx'
import { EmptyState } from '../../components/Feedback.jsx'
import Field, { SelectOptions } from '../../components/Field.jsx'
import Modal from '../../components/Modal.jsx'
import Panel from '../../components/Panel.jsx'
import StatusBadge from '../../components/StatusBadge.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { SPONSOR_STATUSES } from '../../lib/constants.js'
import { sumBy } from '../../lib/finance.js'
import { formatOMR } from '../../lib/format.js'
import { tr } from '../../lib/i18n.js'

function SponsorForm({ exhibitionId, initial, id, onClose, onSaved }) {
  const toast = useToast()
  const [form, setForm] = useState(initial)
  const [saving, setSaving] = useState(false)
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const submit = async () => {
    if (!form.name?.trim()) return toast(tr('اكتب اسم الراعي'), 'error')
    setSaving(true)
    try {
      await saveSponsor(form, exhibitionId, id)
      toast(id ? tr('✅ تم التحديث') : tr('✅ تمت إضافة الراعي'))
      onSaved()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={id ? tr('تعديل راعٍ') : tr('إضافة راعٍ')}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {tr('إلغاء')}
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? tr('جاري...') : tr('حفظ')}
          </Button>
        </>
      }
    >
      <div className="form-grid">
        <Field label={tr('اسم الراعي')} required>
          <input className="input" value={form.name || ''} onChange={set('name')} />
        </Field>
        <Field label={tr('قيمة الرعاية (ر.ع)')}>
          <input className="input" type="number" min="0" step="0.001" value={form.amount ?? ''} onChange={set('amount')} />
        </Field>
        <Field label={tr('الشخص المسؤول')}>
          <input className="input" value={form.contact_name || ''} onChange={set('contact_name')} />
        </Field>
        <Field label={tr('الهاتف')}>
          <input className="input" type="tel" dir="ltr" value={form.phone || ''} onChange={set('phone')} />
        </Field>
        <Field label={tr('الحالة')}>
          <SelectOptions options={SPONSOR_STATUSES} placeholder={null} value={form.status || 'متفق عليه'} onChange={set('status')} />
        </Field>
      </div>
      <Field label={tr('ملاحظات')} hint={tr('مثال: ما يحصل عليه الراعي (شعار على اللوحات، موقع مميز...)')}>
        <input className="input" value={form.notes || ''} onChange={set('notes')} />
      </Field>
    </Modal>
  )
}

export default function SponsorsTab({ exhibitionId, sponsors, onChanged }) {
  const toast = useToast()
  const canWrite = useCan('data.write') // the viewer only looks
  const [editing, setEditing] = useState(null)
  const total = sumBy(sponsors, 'amount')

  const remove = async (s) => {
    if (!confirm(tr('حذف الراعي "{0}"؟', [s.name]))) return
    try {
      await deleteSponsor(s.id)
      toast(tr('🗑️ تم الحذف'))
      onChanged()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  return (
    <Panel
      icon="⭐"
      title={tr('الرعاة')}
      subtitle={tr('{0} راعٍ • {1}', [sponsors.length, formatOMR(total)])}
      action={
        canWrite && (
          <Button size="sm" onClick={() => setEditing({ form: { status: 'متفق عليه' }, id: null })}>
            {tr('+ إضافة راعٍ')}
          </Button>
        )
      }
    >
      <div className="table-wrap">
        <table className="table table-numbered">
          <thead>
            <tr>
              {[tr('الراعي'), tr('المسؤول'), tr('الهاتف'), tr('القيمة'), tr('الحالة'), tr('ملاحظات'), ''].map((h) => (
                <th key={h}>{tr(h)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sponsors.map((s) => (
              <tr key={s.id}>
                <td className="strong">{tr(s.name)}</td>
                <td>{s.contact_name || '—'}</td>
                <td className="ltr">{tr(s.phone)}</td>
                <td className="num strong">{formatOMR(s.amount)}</td>
                <td>
                  <StatusBadge status={s.status} />
                </td>
                <td className="small muted truncate" title={s.notes}>
                  {s.notes || '—'}
                </td>
                <td>
                  {canWrite && (
                  <div className="row-actions">
                    <Button size="sm" variant="outline" onClick={() => setEditing({ form: { ...s }, id: s.id })} title={tr('تعديل')}>
                      ✏️
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => remove(s)} title={tr('حذف')}>
                      🗑️
                    </Button>
                  </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!sponsors.length && <EmptyState icon="⭐" text={tr('لا يوجد رعاة لهذا المعرض بعد')} />}

      {editing && (
        <SponsorForm
          exhibitionId={exhibitionId}
          initial={editing.form}
          id={editing.id}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            onChanged()
          }}
        />
      )}
    </Panel>
  )
}
