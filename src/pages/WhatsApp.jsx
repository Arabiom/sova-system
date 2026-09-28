import { useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { listClients } from '../api/clients.js'
import { listExhibitions } from '../api/exhibitions.js'
import { listExhibitors } from '../api/exhibitors.js'
import { listStaff } from '../api/staff.js'
import { deleteTemplate, groupCampaigns, lastContacts, listLog, listTemplates, saveTemplate } from '../api/whatsapp.js'
import Button from '../components/Button.jsx'
import { Loading } from '../components/Feedback.jsx'
import PageHeader from '../components/PageHeader.jsx'
import WhatsAppQueue from '../components/WhatsAppQueue.jsx'
import { WhatsAppText } from '../components/WhatsAppText.jsx'
import { useAuth, useCan } from '../context/AuthContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { CLIENT_STATUSES, EXHIBITOR_STATUSES } from '../lib/constants.js'
import { balanceOf } from '../lib/finance.js'
import { formatDayMonthYear } from '../lib/dates.js'
import { exhibitionLabel, formatDate, phoneKey, todayISO } from '../lib/format.js'
import { useData } from '../lib/useData.js'
import {
  BUILTIN_TEMPLATES,
  emptyValues,
  fillTemplate,
  FORMATS,
  insertAt,
  messageProblems,
  normalizePhone,
  OPEN_MODES,
  parseManualList,
  phoneProblem,
  recipientVars,
  toRecipient,
  uniqueByPhone,
  usesMoney,
  VARIABLES,
  wrapSelection,
} from '../lib/whatsapp.js'
import { tr, uiLocale } from '../lib/i18n.js'

const load = async () => {
  const [exhibitors, exhibitions, clients, templates, contacts, staff] = await Promise.all([
    listExhibitors({ orderBy: 'brand', ascending: true }),
    listExhibitions(),
    listClients().catch(() => []),
    listTemplates(),
    lastContacts(),
    listStaff().catch(() => []),
  ])
  return { exhibitors, exhibitions, clients, templates, contacts, staff }
}

const AUDIENCES = [
  { id: 'exhibitor', label: tr('🏛️ المشاركون في المعارض') },
  { id: 'client', label: tr('👥 قاعدة العملاء') },
  { id: 'manual', label: tr('✍️ أرقام أكتبها بنفسي') },
]

const EMOJIS = ['🌟', '✅', '📅', '📍', '🏛️', '🔢', '💰', '📞', '🎉', '🙏', '⏰', '📌', '🎁', '🔥', '❤️', '👋', '🌙', '🇴🇲']

const RECENT_DAYS = 7

const readPref = (key, fallback) => {
  try {
    return localStorage.getItem(key) || fallback
  } catch {
    return fallback
  }
}
const writePref = (key, value) => {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Private window: the choice just isn't remembered.
  }
}

const daysAgo = (iso) => Math.floor((Date.now() - new Date(iso)) / 86_400_000)
const agoText = (iso) => {
  const d = daysAgo(iso)
  return d <= 0 ? tr('اليوم') : d === 1 ? tr('أمس') : tr('قبل {0} يوم', [d])
}

export default function WhatsApp() {
  const { data, loading, reload } = useData(load, null)
  const [tab, setTab] = useState('compose')

  if (loading || !data) return <Loading />

  return (
    <>
      <PageHeader title={tr('واتساب 📱')} subtitle={tr('رسائل جماعية مخصّصة لكل شخص باسمه وبياناته، مع قوالب جاهزة وسجل لكل ما أُرسل')} />
      <div className="tabs tabs-underline mb-16">
        <button className={`tab ${tab === 'compose' ? 'active' : ''}`} onClick={() => setTab('compose')}>
          {tr('✉️ رسالة جديدة')}
        </button>
        <button className={`tab ${tab === 'history' ? 'active' : ''}`} onClick={() => setTab('history')}>
          {tr('🕘 سجل الإرسال')}
        </button>
      </div>
      {tab === 'compose' ? <Composer data={data} reload={reload} /> : <History staff={data.staff} />}
    </>
  )
}

// ─── Compose ────────────────────────────────────────────────────────────────────────

function Composer({ data, reload }) {
  const toast = useToast()
  const location = useLocation()
  const { session, role } = useAuth()
  const money = useCan('money.view')
  const uid = session?.user?.id
  const { exhibitors, exhibitions, clients, templates, contacts } = data
  const preset = location.state || {}

  // 1. Who
  const [audience, setAudience] = useState(preset.audience || 'exhibitor')
  const [exhibitionId, setExhibitionId] = useState(preset.exhibitionId || '')
  const [filters, setFilters] = useState({ status: '', sector: '', balance: '', q: '', fresh: false })
  const [selected, setSelected] = useState(() => new Set(preset.keys || []))
  const [manualText, setManualText] = useState('')

  // 2. What
  const initialTemplate = BUILTIN_TEMPLATES.find((t) => t.id === preset.template) || BUILTIN_TEMPLATES.find((t) => t.id === 'reminder')
  const [templateId, setTemplateId] = useState(initialTemplate.id)
  const [body, setBody] = useState(initialTemplate.body)
  const [savingName, setSavingName] = useState(null) // null | '' | name being typed
  const textRef = useRef(null)

  // 3. How
  const [mode, setModeState] = useState(() => readPref('sova.whatsapp.mode', 'wa'))
  const setMode = (m) => {
    setModeState(m)
    writePref('sova.whatsapp.mode', m)
  }
  const [queue, setQueue] = useState(null)
  const [previewIndex, setPreviewIndex] = useState(0)

  const exhibitionOf = (id) => exhibitions.find((e) => e.id === id) || null
  const chosenExhibition = exhibitionOf(exhibitionId)

  // Everyone who can be picked for the current audience, before selection.
  const pool = useMemo(() => {
    if (audience === 'manual') return parseManualList(manualText)
    const rows = audience === 'client' ? clients.map((c) => toRecipient('client', c)) : exhibitors.map((e) => toRecipient('exhibitor', e))
    const q = filters.q.trim().toLowerCase()
    return rows.filter((r) => {
      if (audience === 'exhibitor' && exhibitionId && r.exhibition_id !== exhibitionId) return false
      if (filters.status && r.status !== filters.status) return false
      if (filters.sector && !String(r.sector).includes(filters.sector)) return false
      if (money && audience === 'exhibitor' && filters.balance) {
        const due = balanceOf(r) > 0
        if ((filters.balance === 'due') !== due) return false
      }
      if (filters.fresh && contacts[phoneKey(r.phone)] && daysAgo(contacts[phoneKey(r.phone)].sent_at) < RECENT_DAYS) return false
      if (q && ![r.name, r.brand, r.phone, r.sector].some((v) => String(v || '').toLowerCase().includes(q))) return false
      return true
    })
  }, [audience, manualText, clients, exhibitors, exhibitionId, filters, money, contacts])

  const sectors = useMemo(() => {
    const rows = audience === 'client' ? clients.map((c) => c.sector) : exhibitors.map((e) => e.category)
    return [...new Set(rows.flatMap((s) => String(s || '').split(/[،,]/).map((x) => x.trim())).filter(Boolean))].sort()
  }, [audience, clients, exhibitors])

  const sendable = (r) => !phoneProblem(r.phone)
  const chosen = audience === 'manual' ? pool : pool.filter((r) => selected.has(r.key))
  const [unique, duplicates] = uniqueByPhone(chosen.filter(sendable))
  const invalid = chosen.filter((r) => !sendable(r))

  // The exhibition each recipient's message talks about.
  const exhibitionFor = (r) => (r.exhibition_id ? exhibitionOf(r.exhibition_id) : chosenExhibition)
  const varsFor = (r) => recipientVars(r, exhibitionFor(r), { money })
  const messages = unique.map((r) => {
    const vars = varsFor(r)
    return { recipient: r, text: fillTemplate(body, vars), problems: messageProblems(body, vars, { money }), empty: emptyValues(body, vars) }
  })
  const blocked = messages.filter((m) => m.problems.length)
  const gaps = messages.filter((m) => !m.problems.length && m.empty.length)

  const previewAt = Math.min(previewIndex, Math.max(0, messages.length - 1))
  const preview = messages[previewAt]

  // Templates
  const allowed = (t) => money || !usesMoney(t.body)
  const builtins = BUILTIN_TEMPLATES.filter(allowed)
  const saved = (templates || []).filter(allowed)
  const savedTemplate = saved.find((t) => t.id === templateId)
  const canManage = (t) => t && (t.created_by === uid || role === 'admin')

  const pickTemplate = (t) => {
    setTemplateId(t.id)
    setBody(t.body)
    setSavingName(null)
  }

  const edit = (fn) => {
    const el = textRef.current
    const start = el?.selectionStart ?? body.length
    const end = el?.selectionEnd ?? body.length
    const result = fn(body, start, end)
    setBody(result.text)
    requestAnimationFrame(() => {
      if (!el) return
      el.focus()
      el.setSelectionRange(result.start ?? result.cursor, result.end ?? result.cursor)
    })
  }
  const insert = (piece) => edit((text, s, e) => insertAt(text, s, e, piece))

  const saveAsTemplate = async () => {
    if (!savingName?.trim()) return toast(tr('اكتب اسماً للقالب'), 'error')
    if (!body.trim()) return toast(tr('الرسالة فارغة'), 'error')
    try {
      await saveTemplate({ name: savingName, body })
      toast(tr('✅ حُفظ القالب — يظهر لكل الفريق'))
      setSavingName(null)
      reload()
    } catch (err) {
      toast(err.message, 'error')
    }
  }
  const updateTemplate = async () => {
    try {
      await saveTemplate({ id: savedTemplate.id, name: savedTemplate.name, body })
      toast(tr('✅ حُدّث القالب'))
      reload()
    } catch (err) {
      toast(err.message, 'error')
    }
  }
  const removeTemplate = async () => {
    if (!window.confirm(tr('حذف القالب «{0}»؟', [savedTemplate.name]))) return
    try {
      await deleteTemplate(savedTemplate.id)
      pickTemplate(BUILTIN_TEMPLATES.find((t) => t.id === 'custom'))
      toast(tr('تم حذف القالب'))
      reload()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  const toggle = (key) =>
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  const selectAll = () => setSelected(new Set([...selected, ...pool.filter(sendable).map((r) => r.key)]))
  const clearAll = () => setSelected(new Set())

  const campaignName = () => {
    const t = [...builtins, ...saved].find((x) => x.id === templateId)
    const what = t && t.id !== 'custom' ? t.label || t.name : 'رسالة مخصصة'
    return `${what.replace(/^[^\p{L}\d]+/u, '')} — ${formatDayMonthYear(todayISO())}`
  }

  const start = () => {
    if (!body.trim()) return toast(tr('اكتب نص الرسالة أولاً'), 'error')
    if (!messages.length) return toast(tr('اختر رقماً واحداً على الأقل'), 'error')
    if (blocked.length) return toast(tr('صحّح الرسالة أولاً: {0}', [blocked[0].problems[0]]), 'error')
    setQueue({ id: crypto.randomUUID(), name: campaignName(), items: messages.map(({ recipient, text }) => ({ recipient, text })) })
  }

  const copyNumbers = async () => {
    try {
      await navigator.clipboard.writeText(unique.map((r) => `+${normalizePhone(r.phone)}`).join('\n'))
      toast(tr('✅ نُسخ {0} رقم — الصقها في «قائمة بث» في واتساب للأعمال', [unique.length]))
    } catch {
      toast(tr('تعذّر النسخ'), 'warn')
    }
  }
  const copyPreview = async () => {
    try {
      await navigator.clipboard.writeText(preview.text)
      toast(tr('✅ نُسخت الرسالة'))
    } catch {
      toast(tr('تعذّر النسخ'), 'warn')
    }
  }

  const setFilter = (key) => (e) => setFilters((f) => ({ ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))
  const switchAudience = (id) => {
    setAudience(id)
    setSelected(new Set())
    setFilters({ status: '', sector: '', balance: '', q: '', fresh: false })
  }

  const needsExhibition = audience !== 'exhibitor'
  const statuses = audience === 'client' ? CLIENT_STATUSES : EXHIBITOR_STATUSES

  return (
    <div className="wa-layout">
      <div>
        {/* 1 ─ Who */}
        <section className="panel panel-pad mb-16">
          <div className="step-title">{tr('1️⃣ لمن الرسالة؟')}</div>
          <div className="wa-seg mb-12">
            {AUDIENCES.map((a) => (
              <button key={a.id} className={audience === a.id ? 'active' : ''} onClick={() => switchAudience(a.id)}>
                {tr(a.label)}
              </button>
            ))}
          </div>

          <div className="wa-filters">
            <select className="input input-compact" value={exhibitionId} onChange={(e) => setExhibitionId(e.target.value)}>
              <option value="">{needsExhibition ? tr('— المعرض المقصود بالرسالة —') : tr('كل المعارض')}</option>
              {exhibitions.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {exhibitionLabel(ex)}
                </option>
              ))}
            </select>
            {audience !== 'manual' && (
              <>
                <input className="input input-compact" placeholder={tr('🔍 بحث بالاسم أو الرقم…')} value={filters.q} onChange={setFilter('q')} />
                <select className="input input-compact" value={filters.status} onChange={setFilter('status')}>
                  <option value="">{tr('كل الحالات')}</option>
                  {statuses.map((s) => (
                    <option key={s} value={s}>{tr(s)}</option>
                  ))}
                </select>
                <select className="input input-compact" value={filters.sector} onChange={setFilter('sector')}>
                  <option value="">{tr('كل القطاعات')}</option>
                  {sectors.map((s) => (
                    <option key={s} value={s}>{tr(s)}</option>
                  ))}
                </select>
                {money && audience === 'exhibitor' && (
                  <select className="input input-compact" value={filters.balance} onChange={setFilter('balance')}>
                    <option value="">{tr('كل المدفوعات')}</option>
                    <option value="due">{tr('عليهم مبالغ متبقية')}</option>
                    <option value="paid">{tr('دفعوا كامل المبلغ')}</option>
                  </select>
                )}
              </>
            )}
          </div>
          {audience !== 'manual' && (
            <label className="check-row mb-10">
              <input type="checkbox" checked={filters.fresh} onChange={setFilter('fresh')} />
              {tr('إخفاء من راسلناهم خلال آخر')}{' '}{tr(RECENT_DAYS)}{' '}{tr('أيام')}
            </label>
          )}

          {audience === 'manual' ? (
            <>
              <textarea
                className="input"
                rows={6}
                dir="auto"
                placeholder={tr('رقم في كل سطر، ويمكن كتابة الاسم معه:\nمتجر الورد 91234567\n+968 9876 5432')}
                value={manualText}
                onChange={(e) => setManualText(e.target.value)}
              />
              <div className="muted tiny mt-10">
                {pool.length}{' '}{tr('رقم • الأرقام العُمانية بدون رمز الدولة يُضاف لها 968 تلقائياً • الرقم المكرر يُحذف')}
              </div>
            </>
          ) : (
            <>
              <div className="select-bar">
                <Button size="sm" onClick={selectAll}>
                  {tr('تحديد الكل (')}{pool.filter(sendable).length})
                </Button>
                <Button size="sm" variant="outline" onClick={clearAll}>
                  {tr('إلغاء التحديد')}
                </Button>
                <span className="select-count">{chosen.length}{' '}{tr('محدد')}</span>
              </div>
              <div className="pick-list pick-list-tall">
                {pool.map((r) => {
                  const problem = phoneProblem(r.phone)
                  const last = contacts[phoneKey(r.phone)]
                  const ex = r.exhibition_id && exhibitionOf(r.exhibition_id)
                  return (
                    <label key={r.key} className={`pick-row ${selected.has(r.key) ? 'checked' : ''} ${problem ? 'disabled' : ''}`}>
                      <input type="checkbox" checked={selected.has(r.key)} disabled={!!problem} onChange={() => toggle(r.key)} />
                      <div className="flex-1 min-w-0">
                        <div className="strong small ellipsis">
                          {r.brand || r.name || tr('بدون اسم')}
                          {r.name && r.brand && r.name !== r.brand && <span className="muted"> • {tr(r.name)}</span>}
                        </div>
                        <div className="muted tiny ellipsis">
                          <span dir="ltr">{r.phone || '—'}</span>
                          {r.sector ? ` • ${tr(r.sector)}` : ''}
                          {audience === 'exhibitor' && !exhibitionId && ex ? ` • ${exhibitionLabel(ex)}` : ''}
                        </div>
                      </div>
                      {problem ? (
                        <span className="tiny text-dng strong">{tr(problem)}</span>
                      ) : (
                        last && (
                          <span className={`wa-last ${daysAgo(last.sent_at) < RECENT_DAYS ? 'recent' : ''}`} title={last.by ? tr('أرسلها {0}', [last.by]) : ''}>
                            💬 {agoText(last.sent_at)}
                          </span>
                        )
                      )}
                    </label>
                  )
                })}
                {!pool.length && <div className="empty-inline">{tr('لا يوجد أحد بهذه الشروط')}</div>}
              </div>
            </>
          )}
        </section>

        {/* 2 ─ What */}
        <section className="panel panel-pad mb-16">
          <div className="step-title">{tr('2️⃣ الرسالة')}</div>
          <div className="muted tiny mb-10">{tr('اختر قالباً جاهزاً ثم عدّل عليه كما تريد، أو ابدأ رسالة فارغة')}</div>
          <div className="wa-templates">
            {builtins.map((t) => (
              <button key={t.id} className={`type-btn ${templateId === t.id ? 'active' : ''}`} style={{ '--accent': t.color }} onClick={() => pickTemplate(t)}>
                {tr(t.label)}
              </button>
            ))}
            {saved.map((t) => (
              <button key={t.id} className={`type-btn ${templateId === t.id ? 'active' : ''}`} style={{ '--accent': 'var(--gold-d)' }} onClick={() => pickTemplate(t)}>
                💾 {tr(t.name)}
              </button>
            ))}
          </div>
          {templates === null && <div className="muted tiny mt-10">{tr('لحفظ قوالبك الخاصة وسجل الإرسال شغّل تحديث 015 في Supabase.')}</div>}

          <div className="wa-toolbar mt-12">
            {FORMATS.map((f) => (
              <button key={f.id} type="button" className={`wa-tool wa-tool-${f.id}`} title={f.title} onClick={() => edit((text, s, e) => wrapSelection(text, s, e, f.mark))}>
                {tr(f.label)}
              </button>
            ))}
            <span className="wa-tool-sep" />
            {EMOJIS.map((e) => (
              <button key={e} type="button" className="wa-tool" onClick={() => insert(e)}>
                {tr(e)}
              </button>
            ))}
          </div>
          <textarea
            ref={textRef}
            className="input wa-editor"
            rows={14}
            dir="auto"
            placeholder={tr('اكتب رسالتك هنا… استخدم المتغيرات بالأسفل ليظهر لكل شخص اسمه وبياناته')}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <div className="wa-editor-meta">
            <span>{body.length}{' '}{tr('حرف')}</span>
            <span>{tr('*عريض* _مائل_ ~مشطوب~')}</span>
          </div>

          <div className="field-label mt-12">{tr('المتغيرات — اضغط لإضافتها في مكان المؤشر:')}</div>
          <div className="wa-vars">
            {VARIABLES.filter((v) => money || !v.money).map((v) => (
              <button key={v.key} type="button" className="wa-var" title={v.hint} onClick={() => insert(`{${v.key}}`)}>
                {`{${v.key}}`}
              </button>
            ))}
          </div>

          <div className="wa-template-actions">
            {savingName === null ? (
              <>
                {templates !== null && (
                  <Button size="sm" variant="outline" onClick={() => setSavingName('')} disabled={!body.trim()}>
                    {tr('💾 حفظ كقالب جديد')}
                  </Button>
                )}
                {canManage(savedTemplate) && (
                  <>
                    <Button size="sm" variant="outline" onClick={updateTemplate} disabled={body === savedTemplate.body}>
                      {tr('تحديث «')}{tr(savedTemplate.name)}»
                    </Button>
                    <Button size="sm" variant="ghost" onClick={removeTemplate}>
                      {tr('🗑️ حذف القالب')}
                    </Button>
                  </>
                )}
              </>
            ) : (
              <>
                <input className="input input-compact flex-1" autoFocus placeholder={tr('اسم القالب، مثل: عرض رمضان')} value={savingName} onChange={(e) => setSavingName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveAsTemplate()} />
                <Button size="sm" onClick={saveAsTemplate}>
                  {tr('حفظ')}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSavingName(null)}>
                  {tr('إلغاء')}
                </Button>
              </>
            )}
          </div>
        </section>

        {/* 3 ─ Send */}
        <section className="panel panel-pad">
          <div className="step-title">{tr('3️⃣ الإرسال')}</div>
          <div className="wa-summary">
            <div>
              <strong>{messages.length}</strong>{' '}{tr('رقم سيستلم الرسالة')}
            </div>
            {duplicates.length > 0 && <div className="muted">🔁 {duplicates.length}{' '}{tr('رقم مكرر أُرسل له مرة واحدة فقط')}</div>}
            {invalid.length > 0 && <div className="text-dng">⚠️ {invalid.length}{' '}{tr('بدون رقم صحيح — لن يُرسل لهم')}</div>}
            {blocked.length > 0 && <div className="text-dng">⛔ {blocked[0].problems.map((x) => tr(x)).join(tr('، '))}</div>}
            {gaps.length > 0 && (
              <div className="text-wrn">
                ⚠️ {gaps.length}{' '}{tr('رسالة فيها خانة فارغة (')}{[...new Set(gaps.flatMap((g) => g.empty))].map((k) => `{${k}}`).join(tr('، '))}{tr(') — راجع المعاينة')}
              </div>
            )}
          </div>

          <div className="field-label mt-12">{tr('طريقة فتح واتساب:')}</div>
          <div className="wa-modes">
            {OPEN_MODES.map((m) => (
              <label key={m.id} className={`wa-mode ${mode === m.id ? 'active' : ''}`}>
                <input type="radio" name="wa-mode" checked={mode === m.id} onChange={() => setMode(m.id)} />
                <div>
                  <div className="strong small">{tr(m.label)}</div>
                  <div className="muted tiny">{tr(m.hint)}</div>
                </div>
              </label>
            ))}
          </div>

          <Button variant="whatsapp" size="lg" full onClick={start} disabled={!messages.length || !!blocked.length || !body.trim()}>
            {tr('📱 ابدأ الإرسال لـ')}{' '}{messages.length}{' '}{tr('رقم')}
          </Button>
          <div className="wa-secondary">
            <Button size="sm" variant="outline" onClick={copyNumbers} disabled={!messages.length}>
              {tr('📋 نسخ الأرقام (لقائمة بث)')}
            </Button>
          </div>
          <div className="muted tiny center mt-10">
            {tr('كل رسالة تخرج باسم صاحبها وبياناته. تُفتح المحادثات واحدة تلو الأخرى والرسالة جاهزة — تضغط «إرسال» في واتساب ثم تنتقل للتالي.')}
          </div>
        </section>
      </div>

      <div className="wa-side">
        <div className="wa-preview">
          <div className="wa-preview-head">
            <div className="wa-preview-title">{tr('📱 المعاينة')}</div>
            {messages.length > 1 && (
              <div className="wa-nav">
                <button onClick={() => setPreviewIndex(Math.max(0, previewAt - 1))} disabled={previewAt === 0}>
                  ›
                </button>
                <span>
                  {previewAt + 1}/{messages.length}
                </span>
                <button onClick={() => setPreviewIndex(Math.min(messages.length - 1, previewAt + 1))} disabled={previewAt >= messages.length - 1}>
                  ‹
                </button>
              </div>
            )}
          </div>
          {preview ? (
            <>
              <div className="wa-preview-to">
                {tr('إلى:')}{' '}<strong>{preview.recipient.brand || preview.recipient.name || tr('بدون اسم')}</strong> <span dir="ltr">+{normalizePhone(preview.recipient.phone)}</span>
                {exhibitionFor(preview.recipient) && <div>{tr('عن:')}{' '}{exhibitionLabel(exhibitionFor(preview.recipient))}</div>}
              </div>
              <div className="wa-chat">
                <div className="wa-bubble">
                  {preview.text ? <WhatsAppText text={preview.text} /> : <span className="muted">{tr('الرسالة فارغة')}</span>}
                </div>
                <div className="wa-time">✓✓ {new Date().toLocaleTimeString(uiLocale(), { hour: '2-digit', minute: '2-digit' })}</div>
              </div>
              {preview.problems.map((p) => (
                <div key={p} className="wa-warn">
                  ⛔ {tr(p)}
                </div>
              ))}
              {preview.empty.map((k) => (
                <div key={k} className="wa-warn soft">
                  ⚠️ {`{${k}}`}{' '}{tr('فارغ لهذا الشخص')}
                </div>
              ))}
              <button className="wa-copy" onClick={copyPreview}>
                {tr('📋 نسخ الرسالة')}
              </button>
            </>
          ) : (
            <div className="wa-empty">{audience === 'manual' ? tr('اكتب رقماً لمعاينة الرسالة') : tr('اختر شخصاً أو أكثر لمعاينة رسالته')}</div>
          )}
        </div>
      </div>

      {queue && (
        <WhatsAppQueue
          items={queue.items}
          mode={mode}
          campaign={queue}
          onClose={() => {
            setQueue(null)
            reload()
          }}
        />
      )}
    </div>
  )
}

// ─── History ────────────────────────────────────────────────────────────────────────

function History({ staff }) {
  const { session } = useAuth()
  const { data: rows, loading } = useData(listLog, null)
  const [open, setOpen] = useState(null)
  const [q, setQ] = useState('')

  if (loading) return <Loading />
  if (rows === null) {
    return (
      <div className="panel panel-pad">
        <div className="empty-inline">{tr('سجل الإرسال يحتاج تحديث قاعدة البيانات 015 — شغّله في Supabase ← SQL Editor ثم حدّث الصفحة.')}</div>
      </div>
    )
  }

  const who = (id) => (id === session?.user?.id ? tr('أنت') : staff.find((s) => s.user_id === id)?.name || staff.find((s) => s.user_id === id)?.email || '—')
  const needle = q.trim().toLowerCase()
  const campaigns = groupCampaigns(needle ? rows.filter((r) => [r.name, r.phone, r.body, r.campaign_name].some((v) => String(v || '').toLowerCase().includes(needle))) : rows)

  return (
    <section className="panel">
      <div className="panel-pad wa-history-head">
        <div>
          <div className="strong">{campaigns.length}{' '}{tr('عملية إرسال')}</div>
          <div className="muted tiny">{rows.length}{' '}{tr('رسالة في السجل (آخر 500)')}</div>
        </div>
        <input className="input input-compact" placeholder={tr('🔍 بحث باسم أو رقم أو نص…')} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {campaigns.map((c) => (
        <div key={c.id} className="wa-campaign">
          <button className="wa-campaign-row" onClick={() => setOpen(open === c.id ? null : c.id)}>
            <div className="flex-1 min-w-0">
              <div className="strong small ellipsis">{c.name || tr('رسالة')}</div>
              <div className="muted tiny">
                {formatDate(c.ended)} • {new Date(c.ended).toLocaleTimeString(uiLocale(), { hour: '2-digit', minute: '2-digit' })} • {who(c.sent_by)}
              </div>
            </div>
            <span className="badge badge-success">{c.rows.length}{' '}{tr('رسالة')}</span>
            <span className="muted">{open === c.id ? '▲' : '▼'}</span>
          </button>
          {open === c.id && (
            <div className="wa-campaign-body">
              <div className="wa-chat mb-12">
                <div className="wa-bubble">
                  <WhatsAppText text={c.rows[c.rows.length - 1].body} />
                </div>
              </div>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>{tr('الاسم')}</th>
                      <th>{tr('الرقم')}</th>
                      <th>{tr('الوقت')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.rows.map((r) => (
                      <tr key={r.id}>
                        <td>{r.name || '—'}</td>
                        <td dir="ltr">+{tr(r.phone)}</td>
                        <td>{new Date(r.sent_at).toLocaleTimeString(uiLocale(), { hour: '2-digit', minute: '2-digit' })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ))}
      {!campaigns.length && <div className="empty-inline">{tr('لا توجد رسائل في السجل بعد')}</div>}
    </section>
  )
}
