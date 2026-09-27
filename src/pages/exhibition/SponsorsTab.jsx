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

function SponsorForm({ exhibitionId, initial, id, onClose, onSaved }) {
  const toast = useToast()
  const [form, setForm] = useState(initial)
  const [saving, setSaving] = useState(false)
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const submit = async () => {
    if (!form.name?.trim()) return toast('اكتب اسم الراعي', 'error')
    setSaving(true)
    try {
      await saveSponsor(form, exhibitionId, id)
      toast(id ? '✅ تم التحديث' : '✅ تمت إضافة الراعي')
      onSaved()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={id ? 'تعديل راعٍ' : 'إضافة راعٍ'}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            إلغاء
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? 'جاري...' : 'حفظ'}
          </Button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="اسم الراعي" required>
          <input className="input" value={form.name || ''} onChange={set('name')} />
        </Field>
        <Field label="قيمة الرعاية (ر.ع)">
          <input className="input" type="number" min="0" step="0.001" value={form.amount ?? ''} onChange={set('amount')} />
        </Field>
        <Field label="الشخص المسؤول">
          <input className="input" value={form.contact_name || ''} onChange={set('contact_name')} />
        </Field>
        <Field label="الهاتف">
          <input className="input" type="tel" dir="ltr" value={form.phone || ''} onChange={set('phone')} />
        </Field>
        <Field label="الحالة">
          <SelectOptions options={SPONSOR_STATUSES} placeholder={null} value={form.status || 'متفق عليه'} onChange={set('status')} />
        </Field>
      </div>
      <Field label="ملاحظات" hint="مثال: ما يحصل عليه الراعي (شعار على اللوحات، موقع مميز...)">
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
    if (!confirm(`حذف الراعي "${s.name}"؟`)) return
    try {
      await deleteSponsor(s.id)
      toast('🗑️ تم الحذف')
      onChanged()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  return (
    <Panel
      icon="⭐"
      title="الرعاة"
      subtitle={`${sponsors.length} راعٍ • ${formatOMR(total)}`}
      action={
        canWrite && (
          <Button size="sm" onClick={() => setEditing({ form: { status: 'متفق عليه' }, id: null })}>
            + إضافة راعٍ
          </Button>
        )
      }
    >
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              {['الراعي', 'المسؤول', 'الهاتف', 'القيمة', 'الحالة', 'ملاحظات', ''].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sponsors.map((s) => (
              <tr key={s.id}>
                <td className="strong">{s.name}</td>
                <td>{s.contact_name || '—'}</td>
                <td className="ltr">{s.phone}</td>
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
                    <Button size="sm" variant="outline" onClick={() => setEditing({ form: { ...s }, id: s.id })} title="تعديل">
                      ✏️
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => remove(s)} title="حذف">
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
      {!sponsors.length && <EmptyState icon="⭐" text="لا يوجد رعاة لهذا المعرض بعد" />}

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
