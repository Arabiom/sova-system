import { useState } from 'react'
import { listExhibitions } from '../api/exhibitions.js'
import { deleteExhibitor, listExhibitors, saveExhibitor } from '../api/exhibitors.js'
import Button from '../components/Button.jsx'
import { EmptyState, Loading } from '../components/Feedback.jsx'
import Field, { SelectOptions } from '../components/Field.jsx'
import Modal from '../components/Modal.jsx'
import PageHeader from '../components/PageHeader.jsx'
import StatusBadge, { Chip } from '../components/StatusBadge.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { BOOTH_SIZES, CATEGORIES, EXHIBITOR_STATUSES } from '../lib/constants.js'
import { balanceOf, newReference } from '../lib/finance.js'
import { exhibitionLabel, formatOMR } from '../lib/format.js'
import { downloadContract } from '../lib/pdf.js'
import { useData } from '../lib/useData.js'

const load = async () => {
  const [exhibitors, exhibitions] = await Promise.all([listExhibitors(), listExhibitions()])
  return { exhibitors, exhibitions }
}

function ExhibitorForm({ initial, id, exhibitions, onClose, onSaved }) {
  const toast = useToast()
  const [form, setForm] = useState(initial)
  const [saving, setSaving] = useState(false)
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const submit = async () => {
    if (!form.brand || !form.manager || !form.exhibition_id) return toast('أكمل البيانات المطلوبة', 'error')
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
        <Field label="اسم العلامة التجارية" required>
          <input className="input" placeholder="مثال: Bloom Beauty" value={form.brand || ''} onChange={set('brand')} />
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
        <Field label="المعرض المخصص" required>
          <select className="input" value={form.exhibition_id || ''} onChange={set('exhibition_id')}>
            <option value="">اختر...</option>
            {exhibitions.map((ex) => (
              <option key={ex.id} value={ex.id}>
                {exhibitionLabel(ex)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="رقم البوث">
          <input className="input" placeholder="مثال: A-01" value={form.booth === '—' ? '' : form.booth || ''} onChange={set('booth')} />
        </Field>
        <Field label="حجم البوث">
          <SelectOptions options={BOOTH_SIZES} value={form.booth_size || ''} onChange={set('booth_size')} />
        </Field>
        <Field label="قيمة العقد (ر.ع)">
          <input className="input" type="number" min="0" step="0.001" placeholder="450.000" value={form.contract ?? ''} onChange={set('contract')} />
        </Field>
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

export default function Exhibitors() {
  const toast = useToast()
  const { data, loading, reload } = useData(load, null)
  const [editing, setEditing] = useState(null)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')

  if (loading || !data) return <Loading />
  const { exhibitors, exhibitions } = data
  const exhibitionOf = (id) => exhibitions.find((ex) => ex.id === id)

  const q = search.trim().toLowerCase()
  const visible = exhibitors.filter(
    (e) =>
      (!q || e.brand?.toLowerCase().includes(q) || e.manager?.toLowerCase().includes(q) || e.phone?.includes(q)) &&
      (!category || e.category === category),
  )

  const remove = async (e) => {
    if (!confirm(`حذف العارض "${e.brand}" وكل بياناته؟`)) return
    try {
      await deleteExhibitor(e.id)
      toast('🗑️ تم الحذف')
      reload()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  const printContract = async (e) => {
    toast('📄 جاري طباعة العقد...')
    try {
      await downloadContract(e, exhibitionOf(e.exhibition_id), newReference('SOVA'))
    } catch (err) {
      toast(`تعذّر إنشاء العقد: ${err.message}`, 'error')
    }
  }

  return (
    <>
      <PageHeader title="العارضون والعقود" subtitle={`${exhibitors.length} عارض مسجل`}>
        <Button onClick={() => setEditing({ form: { status: 'مبدئي' }, id: null })}>+ إضافة عارض</Button>
      </PageHeader>

      <div className="toolbar">
        <input className="input toolbar-search" placeholder="🔍  ابحث بالاسم أو الجوال..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <SelectOptions className="input toolbar-select" options={CATEGORIES} placeholder="كل التصنيفات" value={category} onChange={(e) => setCategory(e.target.value)} />
        <div className="toolbar-count">{visible.length} نتيجة</div>
      </div>

      <div className="panel">
        <div className="table-wrap">
          <table className="table" style={{ minWidth: 950 }}>
            <thead>
              <tr>
                {['العلامة', 'المسؤول', 'الجوال', 'التصنيف', 'المعرض', 'البوث', 'العقد', 'المدفوع', 'الحالة', ''].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((e) => {
                const balance = balanceOf(e)
                return (
                  <tr key={e.id}>
                    <td className="strong">{e.brand}</td>
                    <td>{e.manager}</td>
                    <td className="ltr">{e.phone}</td>
                    <td>{e.category && <Chip>{e.category}</Chip>}</td>
                    <td className="small">{exhibitionLabel(exhibitionOf(e.exhibition_id))}</td>
                    <td>{e.booth || '—'}</td>
                    <td className="num">{formatOMR(e.contract)}</td>
                    <td>
                      <span className={`strong num ${balance > 0 ? 'text-dng' : 'text-suc'}`}>{formatOMR(e.paid)}</span>
                      {balance > 0 && <div className="tiny text-dng">متبقي {formatOMR(balance)}</div>}
                    </td>
                    <td>
                      <StatusBadge status={e.status} />
                    </td>
                    <td>
                      <div className="row-actions">
                        <Button size="sm" variant="outline" onClick={() => printContract(e)} title="طباعة عقد">
                          📄
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setEditing({ form: { ...e }, id: e.id })} title="تعديل">
                          ✏️
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => remove(e)} title="حذف">
                          🗑️
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {!visible.length && <EmptyState icon="🤝" text="لا يوجد عارضون" />}
      </div>

      {editing && (
        <ExhibitorForm
          initial={editing.form}
          id={editing.id}
          exhibitions={exhibitions}
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
