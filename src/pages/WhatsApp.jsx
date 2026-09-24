import { useState } from 'react'
import { listExhibitions } from '../api/exhibitions.js'
import { listExhibitors } from '../api/exhibitors.js'
import Button from '../components/Button.jsx'
import ExhibitionFilter from '../components/ExhibitionFilter.jsx'
import { Loading } from '../components/Feedback.jsx'
import PageHeader from '../components/PageHeader.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { MESSAGE_TYPES, openWhatsApp } from '../lib/whatsapp.js'
import { useData } from '../lib/useData.js'

const load = async () => {
  const [exhibitors, exhibitions] = await Promise.all([
    listExhibitors({ orderBy: 'brand', ascending: true }),
    listExhibitions(),
  ])
  return { exhibitors, exhibitions }
}

const SEND_DELAY_MS = 1500

export default function WhatsApp() {
  const toast = useToast()
  const { data, loading } = useData(load, null)
  const [type, setType] = useState('reminder')
  const [custom, setCustom] = useState('')
  const [scope, setScope] = useState('all')
  const [selected, setSelected] = useState([])
  const [progress, setProgress] = useState(null) // number sent so far while sending

  if (loading || !data) return <Loading />
  const { exhibitors, exhibitions } = data

  const exhibitionOf = (id) => exhibitions.find((ex) => ex.id === id)
  const visible = scope === 'all' ? exhibitors : exhibitors.filter((e) => e.exhibition_id === scope)
  const messageFor = (exhibitor) => {
    const template = MESSAGE_TYPES.find((m) => m.id === type)
    return template?.build ? template.build(exhibitor, exhibitionOf(exhibitor.exhibition_id)) : custom
  }
  const previewTarget = exhibitors.find((e) => selected.includes(e.id))
  const preview = previewTarget ? messageFor(previewTarget) : ''

  const toggle = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))

  const send = async () => {
    if (!selected.length) return toast('اختر عارض واحد على الأقل', 'error')
    if (type === 'custom' && !custom.trim()) return toast('اكتب نص الرسالة أولاً', 'error')
    const targets = exhibitors.filter((e) => selected.includes(e.id) && e.phone)
    let sent = 0
    setProgress(0)
    for (const exhibitor of targets) {
      openWhatsApp(exhibitor.phone, messageFor(exhibitor))
      sent += 1
      setProgress(sent)
      if (sent < targets.length) await new Promise((r) => setTimeout(r, SEND_DELAY_MS))
    }
    setProgress(null)
    const skipped = selected.length - targets.length
    toast(`✅ تم فتح واتساب لـ ${sent} عارض${skipped ? ` (تم تخطي ${skipped} بدون رقم)` : ''}`)
  }

  const copyPreview = async () => {
    try {
      await navigator.clipboard.writeText(preview)
      toast('✅ تم نسخ الرسالة')
    } catch {
      toast('تعذّر النسخ', 'warn')
    }
  }

  const sending = progress !== null

  return (
    <>
      <PageHeader title="واتساب SOVA 📱" subtitle="أرسل إشعارات للعارضين مباشرة عبر واتساب" />

      <div className="grid-2">
        <div>
          <section className="panel panel-pad mb-16">
            <div className="step-title">1️⃣ نوع الرسالة</div>
            <div className="type-grid">
              {MESSAGE_TYPES.map((m) => (
                <button key={m.id} className={`type-btn ${type === m.id ? 'active' : ''}`} style={{ '--accent': m.color }} onClick={() => setType(m.id)}>
                  {m.label}
                </button>
              ))}
            </div>
            {type === 'custom' && (
              <textarea className="input mt-12" rows={5} placeholder="اكتب رسالتك هنا..." value={custom} onChange={(e) => setCustom(e.target.value)} />
            )}
          </section>

          <section className="panel panel-pad mb-16">
            <div className="step-title">2️⃣ اختر العارضين</div>
            <ExhibitionFilter
              className="w-full mb-10"
              exhibitions={exhibitions}
              value={scope}
              onChange={(value) => {
                setScope(value)
                setSelected([])
              }}
            />
            <div className="select-bar">
              <Button size="sm" onClick={() => setSelected(visible.map((e) => e.id))}>
                تحديد الكل ({visible.length})
              </Button>
              <Button size="sm" variant="outline" onClick={() => setSelected([])}>
                إلغاء الكل
              </Button>
              <span className="select-count">{selected.length} محدد</span>
            </div>
            <div className="pick-list">
              {visible.map((e) => {
                const checked = selected.includes(e.id)
                return (
                  <label key={e.id} className={`pick-row ${checked ? 'checked' : ''}`}>
                    <input type="checkbox" checked={checked} onChange={() => toggle(e.id)} />
                    <div className="flex-1">
                      <div className="strong small">{e.brand}</div>
                      <div className="muted tiny">
                        {e.phone || 'لا يوجد رقم'}
                        {e.category ? ` • ${e.category}` : ''}
                      </div>
                    </div>
                    {!e.phone && <span className="tiny text-dng strong">بدون رقم</span>}
                  </label>
                )
              })}
              {!visible.length && <div className="empty-inline">لا يوجد عارضون</div>}
            </div>
          </section>

          <section className="panel panel-pad">
            <div className="step-title">3️⃣ إرسال</div>
            <Button variant="whatsapp" size="lg" full onClick={send} disabled={sending || !selected.length}>
              📱 {sending ? `جاري الإرسال... ${progress}/${selected.length}` : `إرسال لـ ${selected.length} عارض عبر واتساب`}
            </Button>
            <div className="muted tiny center mt-10">سيفتح واتساب تلقائياً لكل عارض مع الرسالة جاهزة — فقط اضغط إرسال</div>
          </section>
        </div>

        <div className="wa-preview">
          <div className="wa-preview-title">📱 معاينة الرسالة</div>
          {preview ? (
            <>
              <div className="wa-chat">
                <div className="wa-bubble">{preview}</div>
                <div className="wa-time">✓✓ {new Date().toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' })}</div>
              </div>
              <button className="wa-copy" onClick={copyPreview}>
                📋 نسخ الرسالة
              </button>
            </>
          ) : (
            <div className="wa-empty">اختر عارضاً لمعاينة الرسالة</div>
          )}
        </div>
      </div>
    </>
  )
}
