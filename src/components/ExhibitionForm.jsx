import { useState } from 'react'
import DateInput from './DateInput.jsx'
import { formTiers, saveExhibition } from '../api/exhibitions.js'
import { checkMapFile, MAP_MAX_MB, removeMapFile, uploadMap } from '../api/maps.js'
import ExhibitionMap from './ExhibitionMap.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { CITIES, EXHIBITION_STATUSES } from '../lib/constants.js'
import { num } from '../lib/format.js'
import Button from './Button.jsx'
import Field, { SelectOptions } from './Field.jsx'
import Modal from './Modal.jsx'
import { tr } from '../lib/i18n.js'

const TIER_PLACEHOLDERS = ['مثال: ركن مدخل', 'مثال: كورنر هاير', 'مثال: وسط المعرض', 'مثال: صف داخلي']

export default function ExhibitionForm({ initial, id, onClose, onSaved }) {
  const toast = useToast()
  const [form, setForm] = useState(() => ({ ...initial, tiers: formTiers(initial) }))
  const [saving, setSaving] = useState(false)
  // Map: a newly chosen file (uploaded on save), or the saved one being removed.
  const [mapFile, setMapFile] = useState(null)
  const [mapPreview, setMapPreview] = useState('')
  const [removeMap, setRemoveMap] = useState(false)
  const savedMap = initial.map_path || ''

  const chooseMap = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const problem = checkMapFile(file)
    if (problem) return toast(problem, 'error')
    if (mapPreview) URL.revokeObjectURL(mapPreview)
    setMapFile(file)
    setMapPreview(file.type.startsWith('image/') ? URL.createObjectURL(file) : '')
    setRemoveMap(false)
  }
  const clearMap = () => {
    if (mapPreview) URL.revokeObjectURL(mapPreview)
    setMapFile(null)
    setMapPreview('')
    setRemoveMap(Boolean(savedMap))
  }
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  const tierBooths = form.tiers.reduce((t, x) => t + num(x.count), 0)
  const setTier = (index, key) => (e) =>
    setForm((f) => ({ ...f, tiers: f.tiers.map((t, i) => (i === index ? { ...t, [key]: e.target.value } : t)) }))
  const addTier = () => setForm((f) => ({ ...f, tiers: [...f.tiers, { name: '', price: '', count: '' }] }))
  const removeTier = (index) => setForm((f) => ({ ...f, tiers: f.tiers.filter((_, i) => i !== index) }))
  const totalBooths = num(form.booths) || tierBooths

  const submit = async () => {
    if (!form.city || !form.mall || !form.date_from || !form.date_to) return toast(tr('أكمل البيانات المطلوبة'), 'error')
    if (form.date_to < form.date_from) return toast(tr('تاريخ النهاية قبل تاريخ البداية'), 'error')
    setSaving(true)
    try {
      let map_path = savedMap
      if (mapFile) map_path = await uploadMap(mapFile)
      else if (removeMap) map_path = ''
      const mapChanged = map_path !== savedMap
      await saveExhibition(mapChanged ? { ...form, map_path } : form, id)
      if (mapChanged && savedMap) await removeMapFile(savedMap)
      toast(id ? tr('✅ تم التحديث') : tr('✅ تم إضافة المعرض'))
      onSaved()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={id ? tr('تعديل المعرض') : tr('إضافة معرض جديد')}
      onClose={onClose}
      size="wide"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {tr('إلغاء')}
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? tr('جاري...') : id ? tr('حفظ التعديلات') : tr('إضافة المعرض')}
          </Button>
        </>
      }
    >
      <div className="form-grid">
        <Field label={tr('المدينة')} required>
          <SelectOptions options={CITIES} value={form.city || ''} onChange={set('city')} />
        </Field>
        <Field label={tr('اسم المعرض')} className="span-2" hint={tr('اتركه فارغاً ليظهر باسم SOVA والمدينة')}>
          <input className="input" placeholder={tr('مثال: معرض سوفا للمشاريع الواعدة')} value={form.name || ''} onChange={set('name')} />
        </Field>
        <Field label={tr('اسم المجمع التجاري')} required>
          <input className="input" placeholder={tr('مثال: سيتي سنتر مسقط')} value={form.mall || ''} onChange={set('mall')} />
        </Field>
        <Field label={tr('تاريخ البداية')} required>
          <DateInput value={form.date_from || ''} onChange={set('date_from')} />
        </Field>
        <Field label={tr('تاريخ النهاية')} required>
          <DateInput value={form.date_to || ''} onChange={set('date_to')} />
        </Field>
        <Field label={tr('الحالة')}>
          <SelectOptions options={EXHIBITION_STATUSES} placeholder={null} value={form.status || 'تخطيط'} onChange={set('status')} />
        </Field>
        <Field
          label={tr('إجمالي البوثات')}
          hint={
            num(form.booths) && tierBooths && num(form.booths) !== tierBooths
              ? tr('⚠️ مجموع الفئات تحت {0} بوث', [tierBooths])
              : tr('عدد البوثات في هذا المعرض')
          }
        >
          <input className="input" type="number" min="0" placeholder={tierBooths ? String(tierBooths) : tr('مثال: 46')} value={form.booths || ''} onChange={set('booths')} />
        </Field>
        <Field label={tr('المناسبة')}>
          <input className="input" placeholder={tr('مثال: العيد الوطني')} value={form.occasion || ''} onChange={set('occasion')} />
        </Field>
        <Field label={tr('أوقات العمل')}>
          <input className="input" placeholder={tr('مثال: 10 صباحاً – 10 مساءً')} value={form.hours || ''} onChange={set('hours')} />
        </Field>
        <Field label={tr('العنوان')} className="span-2">
          <input className="input" placeholder={tr('الشارع، المنطقة، الولاية')} value={form.address || ''} onChange={set('address')} />
        </Field>
      </div>

      <div className="tier-box">
        <div className="tier-box-title">{tr('🏷️ فئات البوثات وأسعارها (اختياري — تقدير مبدئي)')}</div>
        <div className="muted tiny mb-10">{tr('تُستخدم للتخطيط فقط. الخارطة التفصيلية (أرقام المواقع وفئاتها) تُضاف من ملف المعرض.')}</div>
        {form.tiers.map((tier, index) => (
          <div key={index} className="tier-row">
            <Field label={tr('اسم الفئة {0}', [index + 1])}>
              <input className="input" placeholder={tr(TIER_PLACEHOLDERS[index] || 'اسم الفئة')} value={tier.name ?? ''} onChange={setTier(index, 'name')} />
            </Field>
            <Field label={tr('السعر (ر.ع)')}>
              <input className="input" type="number" min="0" step="0.001" placeholder="0.000" value={tier.price ?? ''} onChange={setTier(index, 'price')} />
            </Field>
            <Field label={tr('العدد')}>
              <input className="input" type="number" min="0" placeholder="0" value={tier.count ?? ''} onChange={setTier(index, 'count')} />
            </Field>
            <button type="button" className="tier-remove" title={tr('حذف الفئة')} onClick={() => removeTier(index)}>
              ✕
            </button>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={addTier} className="mb-10">
          {tr('+ إضافة فئة')}
        </Button>
        <div className="tier-total">
          {tr('مجموع الفئات:')}{' '}<strong>{tr(tierBooths)}{' '}{tr('بوث')}</strong>{' '}{tr('— إجمالي المعرض:')}{' '}<strong>{tr(totalBooths)}{' '}{tr('بوث')}</strong>
        </div>
      </div>

      <div className="tier-box mt-14">
        <div className="tier-box-title">{tr('🗺️ خارطة المعرض')}</div>
        <div className="muted tiny mb-10">{tr('صورة الخارطة التي صممتها (PNG أو JPG أو PDF، حتى')}{' '}{tr(MAP_MAX_MB)}{' '}{tr('ميجابايت). تظهر في ملف المعرض وصفحة تسجيل المشارك.')}</div>
        {mapFile ? (
          <div className="map-chosen">
            {mapPreview ? <img src={mapPreview} alt={tr('الخارطة المختارة')} className="map-img" /> : <div className="map-pdf">📄 {tr(mapFile.name)}</div>}
            <div className="muted tiny">{tr('تُرفع عند الحفظ')}</div>
          </div>
        ) : savedMap && !removeMap ? (
          <ExhibitionMap path={savedMap} compact />
        ) : (
          <div className="muted small mb-10">{removeMap ? tr('ستُحذف الخارطة عند الحفظ.') : tr('لا توجد خارطة مرفقة.')}</div>
        )}
        <div className="row-actions mt-8">
          <label className="btn btn-outline btn-sm file-pick">
            {mapFile || (savedMap && !removeMap) ? tr('🔄 استبدال الخارطة') : tr('📎 إرفاق خارطة')}
            <input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={chooseMap} hidden />
          </label>
          {(mapFile || (savedMap && !removeMap)) && (
            <Button size="sm" variant="danger" onClick={clearMap}>
              {tr('🗑️ إزالة')}
            </Button>
          )}
        </div>
      </div>

      <Field label={tr('ملاحظات')} className="mt-14">
        <textarea className="input" rows={2} placeholder={tr('أي تفاصيل إضافية...')} value={form.notes || ''} onChange={set('notes')} />
      </Field>
    </Modal>
  )
}
