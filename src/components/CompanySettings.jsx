import { useState } from 'react'
import { fetchSettings, saveSettings } from '../api/settings.js'
import { useToast } from '../context/ToastContext.jsx'
import { useData } from '../lib/useData.js'
import Button from './Button.jsx'
import Field from './Field.jsx'
import Panel from './Panel.jsx'

/** Manager's company settings: VAT registration (off until the company registers). */
export default function CompanySettings() {
  const toast = useToast()
  const { data, loading, reload } = useData(fetchSettings, null)
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  if (loading || !data) return null
  const f = form || data
  const changed = f.vat_enabled !== data.vat_enabled || (f.vat_number || '') !== (data.vat_number || '')

  const save = async () => {
    if (f.vat_enabled && !f.vat_number?.trim()) return toast('اكتب رقم التسجيل في ضريبة القيمة المضافة', 'error')
    if (f.vat_enabled && !data.vat_enabled && !confirm('تشغيل الضريبة يضيف 5% على كل المبالغ والعقود والفواتير في النظام من الآن. متابعة؟')) return
    setSaving(true)
    try {
      await saveSettings({ vat_enabled: f.vat_enabled, vat_number: f.vat_number?.trim() || '' })
      toast('✅ تم حفظ الإعدادات — حدّث الصفحة لتطبيقها في كل النظام')
      setForm(null)
      reload()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Panel icon="⚙️" title="إعدادات الشركة" subtitle="ضريبة القيمة المضافة" className="mb-16">
      <div className="panel-pad">
        <label className="check-row mb-8">
          <input type="checkbox" checked={Boolean(f.vat_enabled)} onChange={(e) => setForm({ ...f, vat_enabled: e.target.checked })} />
          <strong>الشركة مسجلة في ضريبة القيمة المضافة (5%)</strong>
        </label>
        <div className="muted small mb-10">
          {f.vat_enabled
            ? 'تُضاف 5% على الأسعار في العقود والفواتير والتقارير، ويظهر الرقم الضريبي على الفاتورة.'
            : 'مطفأة: لا تُضاف أي ضريبة، والمبالغ في النظام هي المبالغ الفعلية. شغّلها بعد التسجيل لدى جهاز الضرائب.'}
        </div>
        {f.vat_enabled && (
          <Field label="رقم التسجيل في ضريبة القيمة المضافة (VATIN)" hint="كما في شهادة التسجيل — يبدأ عادةً بـ OM">
            <input className="input" dir="ltr" placeholder="OM1100XXXXXX" value={f.vat_number || ''} onChange={(e) => setForm({ ...f, vat_number: e.target.value })} />
          </Field>
        )}
        <Button onClick={save} disabled={saving || !changed}>
          {saving ? 'جاري الحفظ...' : 'حفظ الإعدادات'}
        </Button>
      </div>
    </Panel>
  )
}
