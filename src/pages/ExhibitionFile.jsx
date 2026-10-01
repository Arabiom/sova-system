import { useState } from 'react'
import { IconText } from '../components/Glyph.jsx'
import { Link, useParams } from 'react-router-dom'
import { listClients } from '../api/clients.js'
import { isPdfPath } from '../api/maps.js'
import { listExpenses, listSites, listSponsors } from '../api/exhibitionFile.js'
import { getExhibition, listExhibitions } from '../api/exhibitions.js'
import { listExhibitors } from '../api/exhibitors.js'
import { listPayments } from '../api/payments.js'
import { listStaffExpenses } from '../api/staffExpenses.js'
import Button from '../components/Button.jsx'
import ExhibitionForm from '../components/ExhibitionForm.jsx'
import ExhibitionMap from '../components/ExhibitionMap.jsx'
import Panel from '../components/Panel.jsx'
import { EmptyState, Loading } from '../components/Feedback.jsx'
import { ProgressBar } from '../components/Progress.jsx'
import StatCard from '../components/StatCard.jsx'
import PlanHealth from '../components/PlanHealth.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { DEFAULT_TIERS } from '../lib/constants.js'
import { downloadCsv } from '../lib/csv.js'
import { claimsOf, exhibitionFinancials } from '../lib/finance.js'
import { exhibitionTitle, formatOMR, todayISO } from '../lib/format.js'
import { downloadExhibitionFile } from '../lib/pdf.js'
import { siteStatus } from '../lib/sites.js'
import { useData } from '../lib/useData.js'
import ExpensesTab from './exhibition/ExpensesTab.jsx'
import ParticipantsTab from './exhibition/ParticipantsTab.jsx'
import SitesTab from './exhibition/SitesTab.jsx'
import SponsorsTab from './exhibition/SponsorsTab.jsx'
import { useCan } from '../context/AuthContext.jsx'
import { tr } from '../lib/i18n.js'

const TABS = [
  { id: 'sites', label: tr('🗺️ المواقع والأسعار') },
  { id: 'participants', label: tr('🤝 المشاركون') },
  { id: 'expenses', label: tr('🧾 المصروفات') },
  { id: 'sponsors', label: tr('⭐ الرعاة') },
]

async function loadFile(id) {
  const [exhibition, sites, expenses, sponsors, exhibitors, payments, exhibitions, clients] = await Promise.all([
    getExhibition(id),
    listSites(id),
    listExpenses(id),
    listSponsors(id),
    listExhibitors(),
    listPayments('id,exhibitor_id,amount'),
    listExhibitions(),
    listClients(),
  ])
  // Staff claims tied to this exhibition count in its costs (only readable by finance roles).
  const staffExpenses = await listStaffExpenses().catch(() => [])
  return { exhibition, sites, expenses, sponsors, exhibitors, payments, exhibitions, clients, staffExpenses }
}

function Summary({ f, internal }) {
  return (
    <>
      {internal && <PlanHealth f={f} title={tr('تقييم خطة المعرض')} />}

      <div className="section-label">{tr('المواقع')}</div>
      <div className={internal ? 'grid-4' : 'grid-2'}>
        <StatCard flat label={tr('المواقع المحجوزة')} icon="🗺️" accent="var(--ink)" value={`${f.booked} / ${f.capacity}`} sub={tr('{0} متاح • إشغال {1}%', [f.available, f.occupancy])} />
        {internal && <StatCard flat label={tr('متوسط سعر الموقع')} icon="🏷️" accent="var(--gold)" value={formatOMR(f.avgPrice)} sub={tr('الدخل الممكن {0}', [formatOMR(f.fullRevenue)])} />}
        {internal && <StatCard flat label={tr('المحصّل')} icon="💵" accent="var(--suc)" value={formatOMR(f.collected)} sub={tr('المتبقي للتحصيل {0}', [formatOMR(f.outstanding)])} />}
        {internal && <StatCard flat label={tr('الرصيد النقدي الآن')} icon="🏦" accent={f.cashPosition >= 0 ? 'var(--suc)' : 'var(--dng)'} value={formatOMR(f.cashPosition)} sub={tr('المحصّل + الرعايات المدفوعة − المصروفات المدفوعة')} />}
      </div>
      <div className="occupancy-bar mb-16">
        <ProgressBar pct={f.occupancy} height={10} color="linear-gradient(90deg,var(--gold),var(--gold-l))" />
        {internal && f.capacity > 0 && f.expensesTotal > 0 && f.breakEven > 0 && f.breakEven <= f.capacity && (
          <span className="breakeven-mark" style={{ insetInlineStart: `${f.breakEvenPct}%` }} title={tr('نقطة التعادل: {0} موقع', [f.breakEven])} />
        )}
      </div>
      {internal && f.capacity > 0 && f.expensesTotal > 0 && <div className="muted tiny mb-16">{tr('الخط العمودي على الشريط = نقطة التعادل ({0} موقع)', [f.breakEven])}</div>}
    </>
  )
}

export default function ExhibitionFile() {
  const { id } = useParams()
  const toast = useToast()
  const { data, loading, reload } = useData(() => loadFile(id), null)
  const [tab, setTab] = useState('sites')
  const [editing, setEditing] = useState(false)
  const [printing, setPrinting] = useState(false)
  const canManage = useCan('exhibitions.manage')
  const internal = useCan('finance.internal')

  if (loading || !data) return <Loading />
  if (!data.exhibition) return <EmptyState icon="🏛️" text={tr('المعرض غير موجود أو تم حذفه')} />

  const { exhibition: ex, sites, expenses, sponsors, exhibitors, payments, exhibitions, clients, staffExpenses } = data
  const own = exhibitors.filter((e) => e.exhibition_id === ex.id)
  const claims = claimsOf(staffExpenses, ex.id)
  const f = exhibitionFinancials({ exhibition: ex, sites, exhibitors, payments, expenses, sponsors, staffExpenses }, DEFAULT_TIERS)
  const title = exhibitionTitle(ex)

  const print = async () => {
    setPrinting(true)
    toast(tr('📄 جاري تجهيز ملف المعرض...'))
    try {
      // Approved staff claims print as expense lines, so the lines add up to the file's totals.
      const claimLines = claims.map((x) => ({ id: x.id, item: `مطالبة موظف: ${x.description}`, category: x.category, amount: x.amount, due_date: x.date, paid: x.status === 'تم التعويض' }))
      await downloadExhibitionFile({ exhibition: ex, sites, exhibitors: own, expenses: [...expenses, ...claimLines], sponsors, financials: f })
    } catch (err) {
      toast(tr('تعذّر إنشاء الملف: {0}', [err.message]), 'error')
    } finally {
      setPrinting(false)
    }
  }

  const exportSites = () => {
    const byId = new Map(own.map((e) => [e.id, e]))
    downloadCsv(`${title}-المواقع-${todayISO()}.csv`, sites, [
      { label: tr('رقم الموقع'), value: (s) => s.number },
      { label: tr('الفئة'), value: (s) => s.tier },
      { label: tr('السعر'), value: (s) => Number(s.price).toFixed(3) },
      { label: tr('الحالة'), value: (s) => siteStatus(s, byId.get(s.exhibitor_id)) },
      { label: tr('المشارك'), value: (s) => byId.get(s.exhibitor_id)?.brand || '' },
      { label: tr('المسؤول'), value: (s) => byId.get(s.exhibitor_id)?.manager || '' },
      { label: tr('الهاتف'), value: (s) => byId.get(s.exhibitor_id)?.phone || '' },
      { label: tr('النشاط'), value: (s) => byId.get(s.exhibitor_id)?.category || '' },
      // Contract and paid amounts: admin/finance only.
      ...(internal
        ? [
            { label: tr('قيمة عقد المشارك'), value: (s) => (byId.get(s.exhibitor_id) ? Number(byId.get(s.exhibitor_id).contract).toFixed(3) : '') },
            { label: tr('مدفوع المشارك'), value: (s) => (byId.get(s.exhibitor_id) ? Number(byId.get(s.exhibitor_id).paid).toFixed(3) : '') },
          ]
        : []),
    ])
  }

  const details = [
    ['📅 التاريخ', `${ex.date_from} – ${ex.date_to}`],
    ['🕙 أوقات العمل', ex.hours],
    ['📍 المول', ex.mall],
    ['🗺️ العنوان', ex.address],
    ['🎉 المناسبة', ex.occasion],
  ].filter(([, v]) => v)

  return (
    <>
      <Link to="/exhibitions" className="back-link">
        {tr('→ كل المعارض')}
      </Link>

      <div className="file-hero">
        <div>
          <div className="file-hero-kicker">
            {tr(ex.city)}{' '}{tr('• ملف المعرض')}{' '}<StatusBadge status={ex.status} />
          </div>
          <h1 className="file-hero-title">{tr(title)}</h1>
          <div className="file-hero-meta">
            {details.map(([label, value]) => (
              <span key={label}>
                {tr(label.split(' ')[0])} {tr(value)}
              </span>
            ))}
          </div>
          {ex.notes && <div className="file-hero-notes">{tr(ex.notes)}</div>}
        </div>
        <div className="page-actions">
          {canManage && (
            <Button variant="outline" onClick={() => setEditing(true)}>
              {tr('✏️ تعديل البيانات')}
            </Button>
          )}
          <Button variant="outline" onClick={exportSites} disabled={!sites.length}>
            {tr('⬇️ تصدير Excel')}
          </Button>
          {internal && (
            <Button onClick={print} disabled={printing}>
              {tr('🖨️ طباعة ملف المعرض')}
            </Button>
          )}
        </div>
      </div>

      <Summary f={f} internal={internal} />

      <div className="tabs tabs-underline mb-16">
        {TABS.filter((t) => internal || !['expenses', 'sponsors'].includes(t.id)).map((t) => (
          <button key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
            <IconText text={tr(t.label)} size={16} />
            {t.id === 'participants' && <span className="tab-count">{own.length}</span>}
            {t.id === 'expenses' && <span className="tab-count">{expenses.length}</span>}
            {t.id === 'sponsors' && <span className="tab-count">{sponsors.length}</span>}
          </button>
        ))}
      </div>

      {/* An image map with sites becomes the interactive map inside the sites tab. */}
      {tab === 'sites' && ex.map_path && (isPdfPath(ex.map_path) || !sites.length) && (
        <Panel icon="🗺️" title={tr('خارطة المعرض')} className="map-panel">
          <ExhibitionMap key={ex.map_path} path={ex.map_path} />
        </Panel>
      )}
      {tab === 'sites' && <SitesTab exhibition={ex} sites={sites} exhibitors={own} canManage={canManage} onChanged={reload} />}
      {tab === 'participants' && <ParticipantsTab exhibition={ex} exhibitions={exhibitions} exhibitors={own} clients={clients} onChanged={reload} />}
      {internal && tab === 'expenses' && <ExpensesTab exhibitionId={ex.id} expenses={expenses} claims={claims} onChanged={reload} />}
      {internal && tab === 'sponsors' && <SponsorsTab exhibitionId={ex.id} sponsors={sponsors} onChanged={reload} />}

      {editing && (
        <ExhibitionForm
          initial={{ ...ex }}
          id={ex.id}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false)
            reload()
          }}
        />
      )}
    </>
  )
}
