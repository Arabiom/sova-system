import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { listClients } from '../api/clients.js'
import { addOptOut, createCampaign, deleteCampaign, deleteFollowup, loadDigital, optOutKeys, removeOptOut, saveFollowup, setCampaignStatus, setFollowupDone } from '../api/digital.js'
import { loadProspects } from '../api/prospects.js'
import { listStaff } from '../api/staff.js'
import { listTemplates } from '../api/whatsapp.js'
import Button from '../components/Button.jsx'
import DateInput from '../components/DateInput.jsx'
import { EmptyState, Loading } from '../components/Feedback.jsx'
import Field from '../components/Field.jsx'
import Modal from '../components/Modal.jsx'
import PageHeader from '../components/PageHeader.jsx'
import Prospects from '../components/Prospects.jsx'
import Panel from '../components/Panel.jsx'
import StatCard from '../components/StatCard.jsx'
import { WhatsAppText } from '../components/WhatsAppText.jsx'
import { useAuth, useCan } from '../context/AuthContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { CLIENT_STATUSES, CONTACT_SOURCES } from '../lib/constants.js'
import { CAMPAIGN_BADGE, campaignActions, digitalEmployees, segmentClients } from '../lib/digital.js'
import { formatDate, phoneKey, todayISO } from '../lib/format.js'
import { tr } from '../lib/i18n.js'
import { omanDay } from '../lib/team.js'
import { useData } from '../lib/useData.js'
import { BUILTIN_TEMPLATES } from '../lib/whatsapp.js'

const load = async () => {
  // the staff list is readable by the admin, finance and viewers; others see their own name only
  const [digital, clients, saved, staff, research] = await Promise.all([
    loadDigital(),
    listClients(),
    listTemplates().catch(() => null),
    listStaff().catch(() => []),
    loadProspects().catch(() => ({
      ready: false,
      prospects: [],
      feedSince: null,
      plan: null,
      runs: [],
    })),
  ])
  const templates = [...(saved || []).map((t) => ({ name: t.name, body: t.body })), ...BUILTIN_TEMPLATES.map((t) => ({ name: t.label, body: t.body }))]
  return { ...digital, clients, templates, staff, research }
}

const TABS = {
  campaigns: '📣 الحملات',
  optouts: '⛔ قائمة الإيقاف',
  followups: '📞 المتابعات',
  research: '🔎 الفرص',
  plan: '🧭 خطة البحث والسجل',
}

/** The front page: each digital employee, its numbers and what it needs from the team. */
function Overview({ employees }) {
  const navigate = useNavigate()
  const open = (id, tab) => navigate(`/digital/${id}${tab ? `?tab=${tab}` : ''}`)
  return (
    <div className="emp-grid">
      {employees.map((e) => (
        <article key={e.id} className="emp-card" role="link" tabIndex={0} onClick={() => open(e.id)} onKeyDown={(ev) => ev.key === 'Enter' && open(e.id)}>
          <header className="emp-head">
            <span className="emp-icon" aria-hidden="true">
              {e.icon}
            </span>
            <div className="emp-title">
              <h2>{tr(e.name)}</h2>
              <span className={`badge badge-${e.tone}`}>{tr(e.state)}</span>
            </div>
          </header>
          <p className="emp-role">{tr(e.role)}</p>
          <div className="emp-kpis">
            {e.kpis.map((k) => (
              <div key={k.label} className="emp-kpi">
                <div className="emp-kpi-value num">{k.value}</div>
                <div className="emp-kpi-label">{tr(k.label)}</div>
              </div>
            ))}
          </div>
          <div className="emp-needs">
            <div className="emp-needs-title">{tr('يحتاج منك')}</div>
            {e.needs.length ? (
              <ul>
                {e.needs.map((n) => (
                  <li key={n.text}>
                    <button
                      type="button"
                      className={`emp-need emp-need-${n.tone}`}
                      onClick={(ev) => {
                        ev.stopPropagation()
                        open(e.id, n.tab)
                      }}
                    >
                      {tr(n.text, n.args)}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="emp-ok">{tr('✓ لا شيء الآن')}</div>
            )}
          </div>
          <div className="emp-open">{tr('فتح أدوات الموظف ←')}</div>
        </article>
      ))}
    </div>
  )
}

/** Toggle a value in a list (multi-choice chips). */
const toggle = (list, v) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

/** Choose who a campaign goes to, and its message. Saved as a draft (or sent for approval). */
function CampaignForm({ data, onClose, onSaved }) {
  const toast = useToast()
  const [name, setName] = useState('')
  const [template, setTemplate] = useState('')
  const [body, setBody] = useState('')
  const [filter, setFilter] = useState({
    sources: [],
    sectors: [],
    cities: [],
    statuses: ['نشط', 'محتمل'],
    notContactedDays: '',
  })
  const [saving, setSaving] = useState(false)
  const keys = useMemo(() => optOutKeys(data.optOuts), [data.optOuts])
  const seg = segmentClients(data.clients, filter, keys, omanDay())
  const values = (k) => [...new Set(data.clients.map((c) => c[k]).filter(Boolean))].sort()
  const unsure = !filter.sources.length || filter.sources.includes('قائمة مستوردة')

  const pickTemplate = (e) => {
    const t = data.templates.find((x) => x.name === e.target.value)
    setTemplate(e.target.value)
    if (t) setBody(t.body)
  }
  const save = async (submit) => {
    if (!name.trim()) return toast(tr('اكتب اسم الحملة'), 'error')
    if (!body.trim()) return toast(tr('اختر قالباً أو اكتب نص الرسالة'), 'error')
    if (!seg.recipients.length) return toast(tr('لا يوجد عميل في هذه الشريحة'), 'error')
    setSaving(true)
    try {
      const id = await createCampaign({ name, body, template_name: template, segment: filter }, seg.recipients)
      if (submit) await setCampaignStatus(id, 'بانتظار الاعتماد')
      toast(submit ? tr('✅ أُرسلت الحملة للاعتماد') : tr('✅ حُفظت الحملة مسودة'))
      onSaved()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }
  const chips = (k, options) => (
    <div className="chips-row">
      {options.map((o) => (
        <button
          key={o || '-'}
          type="button"
          className={`chip-btn ${filter[k].includes(o) ? 'active' : ''}`}
          aria-pressed={filter[k].includes(o)}
          onClick={() => setFilter((f) => ({ ...f, [k]: toggle(f[k], o) }))}
        >
          {o ? tr(o) : tr('غير محدد')}
        </button>
      ))}
    </div>
  )

  return (
    <Modal
      title={tr('حملة جديدة')}
      subtitle={tr('تُحفظ مسودة، ولا تُرسل إلا بعد اعتماد المدير')}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {tr('إلغاء')}
          </Button>
          <Button variant="outline" onClick={() => save(false)} disabled={saving}>
            {tr('حفظ مسودة')}
          </Button>
          <Button onClick={() => save(true)} disabled={saving}>
            {saving ? tr('جاري...') : tr('حفظ وإرسال للاعتماد')}
          </Button>
        </>
      }
    >
      <div className="form-grid">
        <Field label={tr('اسم الحملة')} required>
          <input id="campaign-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={tr('مثال: دعوة معرض نزوى — العملاء النشطون')} />
        </Field>
        <Field label={tr('القالب')}>
          <select id="campaign-template" className="input" value={template} onChange={pickTemplate}>
            <option value="">{tr('اختر قالباً...')}</option>
            {data.templates.map((t) => (
              <option key={t.name} value={t.name}>
                {tr(t.name)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label={tr('نص الرسالة')} required hint={tr('المتغيرات مثل {الاسم} تُملأ لكل مستلم عند الإرسال')}>
        <textarea id="campaign-body" className="input" rows={6} value={body} onChange={(e) => setBody(e.target.value)} />
      </Field>

      <div className="section-label">{tr('الشريحة')}</div>
      <Field label={tr('مصدر الرقم')} hint={tr('بدون اختيار = كل المصادر')}>
        {chips('sources', [...CONTACT_SOURCES, ''])}
      </Field>
      <Field label={tr('حالة العميل')}>{chips('statuses', CLIENT_STATUSES)}</Field>
      {values('sector').length > 0 && <Field label={tr('القطاع')}>{chips('sectors', values('sector'))}</Field>}
      {values('city').length > 0 && <Field label={tr('المدينة')}>{chips('cities', values('city'))}</Field>}
      <Field label={tr('لم نتواصل معه منذ (يوم)')} hint={tr('اتركه فارغاً لكل العملاء')}>
        <input id="campaign-days" className="input" type="number" min="0" value={filter.notContactedDays} onChange={(e) => setFilter((f) => ({ ...f, notContactedDays: e.target.value }))} />
      </Field>

      <div className={`alert ${seg.recipients.length ? 'alert-info' : 'alert-warning'}`}>
        <strong>{tr('ستصل إلى {0} رقم', [seg.recipients.length])}</strong>
        {(seg.left.optedOut > 0 || seg.left.noPhone > 0 || seg.left.duplicate > 0) && (
          <div className="small mt-4">
            {[
              seg.left.optedOut && tr('{0} في قائمة الإيقاف', [seg.left.optedOut]),
              seg.left.noPhone && tr('{0} بلا رقم صحيح', [seg.left.noPhone]),
              seg.left.duplicate && tr('{0} رقم مكرر', [seg.left.duplicate]),
            ]
              .filter(Boolean)
              .join(tr(' • '))}{' '}
            — {tr('استُبعدوا تلقائياً')}
          </div>
        )}
      </div>
      {unsure && <div className="alert alert-warning">{tr('⚠️ تأكد أن أصحاب هذه الأرقام وافقوا على التواصل معهم على واتساب. مراسلة أرقام بلا موافقة قد تؤدي إلى حظر رقم الشركة.')}</div>}
    </Modal>
  )
}

/** One campaign: its message, who it goes to, and the actions allowed now. */
function CampaignDetails({ campaign, recipients, staffName, onClose, onChanged }) {
  const toast = useToast()
  const { role } = useAuth()
  const canWrite = useCan('data.write')
  const [busy, setBusy] = useState(false)
  const can = campaignActions(campaign, { role, canWrite })
  const act = async (fn, done) => {
    setBusy(true)
    try {
      await fn()
      toast(done)
      onChanged()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setBusy(false)
    }
  }
  const counts = recipients.reduce((m, r) => ({ ...m, [r.status]: (m[r.status] || 0) + 1 }), {})
  return (
    <Modal
      title={campaign.name}
      subtitle={[tr(campaign.status), tr('{0} مستلم', [recipients.length]), formatDate(campaign.created_at)].join(' • ')}
      onClose={onClose}
      size="lg"
      footer={
        <>
          {can.remove && (
            <Button variant="danger" disabled={busy} onClick={() => confirm(tr('حذف الحملة «{0}»؟', [campaign.name])) && act(() => deleteCampaign(campaign.id), tr('تم الحذف'))}>
              {tr('حذف')}
            </Button>
          )}
          {can.cancel && (
            <Button variant="outline" disabled={busy} onClick={() => act(() => setCampaignStatus(campaign.id, 'ملغاة'), tr('أُلغيت الحملة'))}>
              {tr('إلغاء الحملة')}
            </Button>
          )}
          {can.backToDraft && (
            <Button variant="outline" disabled={busy} onClick={() => act(() => setCampaignStatus(campaign.id, 'مسودة'), tr('أُعيدت مسودة'))}>
              {tr('إعادة مسودة')}
            </Button>
          )}
          {can.submit && (
            <Button disabled={busy} onClick={() => act(() => setCampaignStatus(campaign.id, 'بانتظار الاعتماد'), tr('✅ أُرسلت للاعتماد'))}>
              {tr('إرسال للاعتماد')}
            </Button>
          )}
          {can.approve && (
            <Button disabled={busy} onClick={() => act(() => setCampaignStatus(campaign.id, 'معتمدة'), tr('✅ اعتُمدت الحملة'))}>
              {tr('✓ اعتماد الحملة')}
            </Button>
          )}
        </>
      }
    >
      {campaign.status === 'بانتظار الاعتماد' && role !== 'admin' && <div className="alert alert-info">{tr('بانتظار اعتماد المدير.')}</div>}
      {campaign.status === 'معتمدة' && (
        <div className="alert alert-success">
          {tr('اعتمدها {0} بتاريخ {1}.', [staffName(campaign.approved_by), formatDate(campaign.approved_at)])} {tr('الإرسال الفعلي يُفعَّل في المرحلة الثانية.')}
        </div>
      )}
      <Panel icon="💬" title={tr('الرسالة')} className="mb-16">
        <div className="panel-pad">
          <WhatsAppText text={campaign.body} />
        </div>
      </Panel>
      <Panel
        icon="👥"
        title={tr('المستلمون ({0})', [recipients.length])}
        subtitle={Object.entries(counts)
          .map(([s, n]) => `${tr(s)} ${n}`)
          .join(' • ')}
      >
        <div className="table-wrap" style={{ maxHeight: 320 }}>
          <table className="table table-compact">
            <thead>
              <tr>
                <th>{tr('الاسم')}</th>
                <th>{tr('الرقم')}</th>
                <th>{tr('الحالة')}</th>
              </tr>
            </thead>
            <tbody>
              {recipients.map((r) => (
                <tr key={r.id}>
                  <td>{tr(r.name) || '—'}</td>
                  <td className="ltr small">{r.phone}</td>
                  <td className="small">{tr(r.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </Modal>
  )
}

function FollowupForm({ clients, people, uid, onClose, onSaved }) {
  const toast = useToast()
  const [form, setForm] = useState({
    client_id: '',
    assigned_to: uid || '',
    due_date: todayISO(),
    note: '',
  })
  const [saving, setSaving] = useState(false)
  const submit = async () => {
    if (!form.client_id) return toast(tr('اختر العميل'), 'error')
    if (!form.note.trim()) return toast(tr('اكتب سبب المتابعة'), 'error')
    setSaving(true)
    try {
      await saveFollowup(form)
      toast(tr('✅ أُضيفت المتابعة'))
      onSaved()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }
  return (
    <Modal
      title={tr('متابعة جديدة')}
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
      <Field label={tr('العميل')} required>
        <select id="followup-client" className="input" value={form.client_id} onChange={(e) => setForm((f) => ({ ...f, client_id: e.target.value }))}>
          <option value="">{tr('اختر...')}</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.phone ? ` — ${c.phone}` : ''}
            </option>
          ))}
        </select>
      </Field>
      {people.length > 1 && (
        <Field label={tr('المكلَّف')}>
          <select id="followup-owner" className="input" value={form.assigned_to} onChange={(e) => setForm((f) => ({ ...f, assigned_to: e.target.value }))}>
            {people.map((p) => (
              <option key={p.user_id} value={p.user_id}>
                {p.user_id === uid ? tr('أنت') : p.name || p.email}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field label={tr('موعد المتابعة')}>
        <DateInput value={form.due_date} onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))} />
      </Field>
      <Field label={tr('السبب / ماذا نقول له')} required>
        <textarea id="followup-note" className="input" rows={3} value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
      </Field>
    </Modal>
  )
}

/**
 * «الموظفون الرقميون» (phase 1): campaigns prepared from the client base and approved by the
 * admin, follow-ups, and the stop list. Nothing is sent from here yet.
 */
export default function Digital() {
  const toast = useToast()
  const { role, session } = useAuth()
  const uid = session?.user?.id
  const canWrite = useCan('data.write')
  const { data, loading, reload } = useData(load, null)
  const { employee: employeeId } = useParams()
  const [search, setSearch] = useSearchParams()
  const [creating, setCreating] = useState(false)
  const [open, setOpen] = useState(null)
  const [addingFollowup, setAddingFollowup] = useState(false)
  const [stop, setStop] = useState({ phone: '', reason: '' })
  if (loading || !data) return <Loading />

  const today = omanDay()
  const employees = digitalEmployees({
    campaigns: data.campaigns,
    recipients: data.recipients,
    followups: data.followups,
    optOuts: data.optOuts,
    prospects: data.research.prospects,
    prospectsReady: data.research.ready,
    feedSince: data.research.feedSince,
    runs: data.research.runs,
    role,
    today,
  })
  const employee = employees.find((e) => e.id === employeeId)
  const tab = employee?.tabs.includes(search.get('tab')) ? search.get('tab') : employee?.tabs[0]
  const setTab = (t) => setSearch(t === employee.tabs[0] ? {} : { tab: t }, { replace: true })
  const byCampaign = data.recipients.reduce((m, r) => ((m[r.campaign_id] ||= []).push(r), m), {})
  const clientName = (id) => data.clients.find((c) => c.id === id)?.name || '—'
  const clientPhone = (id) => data.clients.find((c) => c.id === id)?.phone || ''
  const clientByPhone = (phone) => data.clients.find((c) => phoneKey(c.whatsapp || c.phone) === phoneKey(phone) || phoneKey(c.phone) === phoneKey(phone))
  const people = data.staff.length ? data.staff : uid ? [{ user_id: uid }] : []
  const count = (s) => data.campaigns.filter((c) => c.status === s).length
  const openFollowups = data.followups.filter((f) => f.status === 'مفتوحة')
  const staffName = (id) => {
    if (!id) return '—'
    if (id === uid) return tr('أنت')
    const s = data.staff.find((p) => p.user_id === id)
    return s ? s.name || s.email : tr('المدير')
  }
  const run = async (fn, done) => {
    try {
      await fn()
      toast(done)
      reload()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  if (!data.ready)
    return (
      <>
        <PageHeader title={tr('الموظفون الرقميون')} />
        <div className="alert alert-warning">{tr('هذا القسم يحتاج تحديث قاعدة البيانات 034. شغّل ملف التحديث في Supabase ثم حدّث الصفحة.')}</div>
      </>
    )

  if (!employee)
    return (
      <>
        <PageHeader title={tr('الموظفون الرقميون')} subtitle={tr('فريق يعمل معكم: كل موظف رقمي، أداؤه، وما يحتاجه منكم الآن')} />
        <Overview employees={employees} />
      </>
    )

  return (
    <>
      <div className="mb-16">
        <Link to="/digital" className="back-link">
          {tr('→ كل الموظفين الرقميين')}
        </Link>
      </div>
      <PageHeader title={`${employee.icon} ${tr(employee.name)}`} subtitle={tr(employee.role)}>
        {canWrite && tab === 'campaigns' && <Button onClick={() => setCreating(true)}>{tr('+ حملة جديدة')}</Button>}
        {canWrite && tab === 'followups' && <Button onClick={() => setAddingFollowup(true)}>{tr('+ متابعة')}</Button>}
      </PageHeader>

      {employee.id === 'marketing' && (
        <>
          <div className="alert alert-info mb-16">{tr('المرحلة الأولى: تجهيز الحملات واعتمادها فقط — الإرسال الفعلي يُفعَّل بعد ربط LetsBot.')}</div>
          <div className="grid-4 mb-16">
            <StatCard flat label={tr('مسودات')} value={count('مسودة')} icon="📝" accent="var(--ink)" onClick={() => setTab('campaigns')} />
            <StatCard flat label={tr('بانتظار الاعتماد')} value={count('بانتظار الاعتماد')} icon="⏳" accent="var(--wrn)" onClick={() => setTab('campaigns')} />
            <StatCard flat label={tr('معتمدة')} value={count('معتمدة')} icon="✅" accent="var(--suc)" onClick={() => setTab('campaigns')} />
            <StatCard flat label={tr('في قائمة الإيقاف')} value={data.optOuts.length} icon="⛔" accent="var(--dng)" onClick={() => setTab('optouts')} />
          </div>
        </>
      )}
      {employee.id === 'sales' && (
        <div className="grid-4 mb-16">
          {employee.kpis.map((k, i) => (
            <StatCard key={k.label} flat label={tr(k.label)} value={k.value} icon={['📞', '⏰', '✅'][i]} accent={['var(--info)', 'var(--dng)', 'var(--suc)'][i]} />
          ))}
          <StatCard flat label={tr('عملاء في القاعدة')} value={data.clients.length} icon="👥" accent="var(--ink)" />
        </div>
      )}
      {employee.id === 'research' && (
        <div className="grid-4 mb-16">
          {[...employee.kpis, ...employee.extra.slice(0, 1)].map((k, i) => (
            <StatCard key={k.label} flat label={tr(k.label)} value={k.value} icon={['🔎', '🆕', '🤝', '📅'][i]} accent={['var(--ink)', 'var(--info)', 'var(--suc)', 'var(--wrn)'][i]} />
          ))}
        </div>
      )}

      {employee.tabs.length > 1 && (
        <div className="tabs tabs-underline mb-16">
          {employee.tabs.map((id) => (
            <button key={id} type="button" className={`tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>
              {tr(TABS[id])}
            </button>
          ))}
        </div>
      )}

      {tab === 'campaigns' && (
        <Panel icon="📣" title={tr('الحملات')}>
          {data.campaigns.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{tr('الحملة')}</th>
                    <th>{tr('الحالة')}</th>
                    <th>{tr('المستلمون')}</th>
                    <th>{tr('أُنشئت')}</th>
                    <th>{tr('الاعتماد')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.campaigns.map((c) => (
                    <tr key={c.id} className="clickable" onClick={() => setOpen(c)}>
                      <td>
                        <div className="strong">{c.name}</div>
                        {c.template_name && <div className="muted tiny">{tr(c.template_name)}</div>}
                      </td>
                      <td>
                        <span className={`badge ${CAMPAIGN_BADGE[c.status]}`}>{tr(c.status)}</span>
                      </td>
                      <td className="num">{(byCampaign[c.id] || []).length}</td>
                      <td className="small nowrap">{formatDate(c.created_at)}</td>
                      <td className="small nowrap">{c.approved_at ? formatDate(c.approved_at) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState icon="📣" text={tr('لا توجد حملات بعد — اضغط «+ حملة جديدة»')} />
          )}
        </Panel>
      )}

      {tab === 'followups' && (
        <Panel icon="📞" title={tr('المتابعات')} subtitle={tr('من نتصل به، ومتى، ولماذا')}>
          {data.followups.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{tr('العميل')}</th>
                    <th>{tr('المكلَّف')}</th>
                    <th>{tr('الموعد')}</th>
                    <th>{tr('السبب')}</th>
                    <th>{tr('الحالة')}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {[...openFollowups, ...data.followups.filter((f) => f.status !== 'مفتوحة')].map((f) => (
                    <tr key={f.id} className={f.status === 'تمت' ? 'muted' : ''}>
                      <td>
                        <div className="strong">{clientName(f.client_id)}</div>
                        <div className="ltr tiny muted">{clientPhone(f.client_id)}</div>
                      </td>
                      <td className="small nowrap">{staffName(f.assigned_to || f.created_by)}</td>
                      <td className={`small nowrap ${f.status === 'مفتوحة' && f.due_date < today ? 'text-dng strong' : ''}`}>{formatDate(f.due_date)}</td>
                      <td className="small">{f.note}</td>
                      <td>
                        <span className={`badge ${f.status === 'تمت' ? 'badge-success' : f.due_date < today ? 'badge-danger' : 'badge-warning'}`}>
                          {f.status === 'مفتوحة' && f.due_date < today ? tr('متأخرة') : tr(f.status)}
                        </span>
                      </td>
                      <td className="nowrap">
                        {canWrite && (
                          <Button size="sm" variant="outline" onClick={() => run(() => setFollowupDone(f.id, f.status !== 'تمت'), f.status === 'تمت' ? tr('أُعيد فتحها') : tr('✅ تمت المتابعة'))}>
                            {f.status === 'تمت' ? tr('إعادة فتح') : tr('✓ تمت')}
                          </Button>
                        )}{' '}
                        {canWrite && (role === 'admin' || f.created_by === uid) && (
                          <Button size="sm" variant="ghost" onClick={() => confirm(tr('حذف هذه المتابعة؟')) && run(() => deleteFollowup(f.id), tr('تم الحذف'))}>
                            {tr('حذف')}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState icon="📞" text={tr('لا توجد متابعات بعد')} />
          )}
        </Panel>
      )}

      {tab === 'research' && <Prospects />}
      {tab === 'plan' && <Prospects view="plan" />}

      {tab === 'optouts' && (
        <Panel icon="⛔" title={tr('قائمة الإيقاف')} subtitle={tr('أرقام طلبت الإيقاف — لا تُضاف لأي حملة، وتُحذف تلقائياً من الحملات التي لم تُرسل')}>
          {canWrite && (
            <div className="toolbar panel-pad">
              <input id="optout-phone" className="input" dir="ltr" placeholder="9XXXXXXX" value={stop.phone} onChange={(e) => setStop((s) => ({ ...s, phone: e.target.value }))} />
              <input id="optout-reason" className="input" placeholder={tr('السبب (اختياري)')} value={stop.reason} onChange={(e) => setStop((s) => ({ ...s, reason: e.target.value }))} />
              <Button
                variant="danger"
                onClick={() =>
                  stop.phone.replace(/\D/g, '').length < 8
                    ? toast(tr('رقم غير صحيح'), 'error')
                    : run(async () => {
                        await addOptOut({
                          ...stop,
                          client_id: clientByPhone(stop.phone)?.id,
                        })
                        setStop({ phone: '', reason: '' })
                      }, tr('✅ أُضيف الرقم لقائمة الإيقاف'))
                }
              >
                {tr('+ إيقاف هذا الرقم')}
              </Button>
            </div>
          )}
          {data.optOuts.length ? (
            <div className="table-wrap">
              <table className="table table-compact">
                <thead>
                  <tr>
                    <th>{tr('الرقم')}</th>
                    <th>{tr('العميل')}</th>
                    <th>{tr('السبب')}</th>
                    <th>{tr('التاريخ')}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.optOuts.map((o) => (
                    <tr key={o.id}>
                      <td className="ltr">{o.phone}</td>
                      <td>{o.client_id ? clientName(o.client_id) : clientByPhone(o.phone)?.name || '—'}</td>
                      <td className="small">{tr(o.reason) || '—'}</td>
                      <td className="small nowrap">{formatDate(o.created_at)}</td>
                      <td>
                        {role === 'admin' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => confirm(tr('إزالة {0} من قائمة الإيقاف؟ سيصبح ممكناً مراسلته مرة أخرى.', [o.phone])) && run(() => removeOptOut(o.id), tr('أُزيل من القائمة'))}
                          >
                            {tr('إزالة')}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState icon="✅" text={tr('القائمة فارغة')} />
          )}
        </Panel>
      )}

      {creating && (
        <CampaignForm
          data={data}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false)
            reload()
          }}
        />
      )}
      {open && (
        <CampaignDetails
          campaign={data.campaigns.find((c) => c.id === open.id) || open}
          recipients={byCampaign[open.id] || []}
          staffName={staffName}
          onClose={() => setOpen(null)}
          onChanged={() => {
            setOpen(null)
            reload()
          }}
        />
      )}
      {addingFollowup && (
        <FollowupForm
          clients={data.clients}
          people={people}
          uid={uid}
          onClose={() => setAddingFollowup(false)}
          onSaved={() => {
            setAddingFollowup(false)
            reload()
          }}
        />
      )}
    </>
  )
}
