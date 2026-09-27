import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { listClients } from '../api/clients.js'
import { listExpenses, listSites, listSponsors } from '../api/exhibitionFile.js'
import { getExhibition, listExhibitions } from '../api/exhibitions.js'
import { listExhibitors } from '../api/exhibitors.js'
import { listPayments } from '../api/payments.js'
import Button from '../components/Button.jsx'
import ExhibitionForm from '../components/ExhibitionForm.jsx'
import ExhibitionMap from '../components/ExhibitionMap.jsx'
import Panel from '../components/Panel.jsx'
import { EmptyState, Loading } from '../components/Feedback.jsx'
import { ProgressBar } from '../components/Progress.jsx'
import StatCard from '../components/StatCard.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { DEFAULT_TIERS } from '../lib/constants.js'
import { downloadCsv } from '../lib/csv.js'
import { exhibitionFinancials } from '../lib/finance.js'
import { exhibitionTitle, formatOMR, todayISO } from '../lib/format.js'
import { downloadExhibitionFile } from '../lib/pdf.js'
import { siteStatus } from '../lib/sites.js'
import { useData } from '../lib/useData.js'
import ExpensesTab from './exhibition/ExpensesTab.jsx'
import ParticipantsTab from './exhibition/ParticipantsTab.jsx'
import SitesTab from './exhibition/SitesTab.jsx'
import SponsorsTab from './exhibition/SponsorsTab.jsx'
import { useCan } from '../context/AuthContext.jsx'

const TABS = [
  { id: 'sites', label: '🗺️ المواقع والأسعار' },
  { id: 'participants', label: '🤝 المشاركون' },
  { id: 'expenses', label: '🧾 المصروفات' },
  { id: 'sponsors', label: '⭐ الرعاة' },
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
  return { exhibition, sites, expenses, sponsors, exhibitors, payments, exhibitions, clients }
}

function Summary({ f, internal }) {
  const tone = (v) => (v >= 0 ? 'var(--suc)' : 'var(--dng)')
  return (
    <>
      <div className="section-label">الإشغال والتعادل</div>
      <div className="grid-4">
        <StatCard flat label="المواقع المحجوزة" icon="🗺️" accent="var(--ink)" value={`${f.booked} / ${f.capacity}`} sub={`${f.available} متاح • إشغال ${f.occupancy}%`} />
        {internal && (
        <StatCard
          flat
          label="نقطة التعادل"
          icon="⚖️"
          accent={!f.expensesTotal ? 'var(--muted)' : f.booked >= f.breakEven ? 'var(--suc)' : 'var(--wrn)'}
          value={f.expensesTotal && f.capacity ? `${f.breakEven} موقع` : '—'}
          sub={
            !f.capacity
              ? 'أضف المواقع أولاً'
              : !f.expensesTotal
                ? 'أضف المصروفات لحسابها'
                : `${f.breakEvenPct}% من المواقع • ${f.booked >= f.breakEven ? '✓ تم تجاوزها' : `باقي ${f.breakEven - f.booked} موقع`}`
          }
        />
        )}
        <StatCard flat label="الإيراد عند البيع الكامل" icon="🎯" accent="var(--gold)" value={formatOMR(f.fullRevenue)} sub={`متوسط سعر الموقع ${formatOMR(f.avgPrice)}`} />
        {internal && <StatCard flat label="المصروفات" icon="🧾" accent="var(--wrn)" value={formatOMR(f.expensesTotal)} sub={`مدفوع ${formatOMR(f.expensesPaid)}`} />}
      </div>
      <div className="occupancy-bar mb-16">
        <ProgressBar pct={f.occupancy} height={10} color="linear-gradient(90deg,var(--gold),var(--gold-l))" />
        {internal && f.capacity > 0 && f.expensesTotal > 0 && f.breakEven > 0 && f.breakEven <= f.capacity && (
          <span className="breakeven-mark" style={{ right: `${f.breakEvenPct}%` }} title={`نقطة التعادل: ${f.breakEven} موقع`} />
        )}
      </div>

      <div className="section-label">المالية</div>
      <div className="grid-4 mb-24">
        <StatCard flat label="إجمالي العقود" icon="📋" accent="var(--ink)" value={formatOMR(f.contract)} sub={internal && f.sponsorship ? `+ رعايات ${formatOMR(f.sponsorship)}` : undefined} />
        <StatCard flat label="المحصّل" icon="💵" accent="var(--suc)" value={formatOMR(f.collected)} sub={`المتبقي للتحصيل ${formatOMR(f.outstanding)}`} />
        {internal && <StatCard flat label="الصافي حسب العقود الحالية" icon="📈" accent={tone(f.netOnContracts)} value={formatOMR(f.netOnContracts)} sub="العقود + الرعايات − المصروفات" />}
        {internal && <StatCard flat label="الصافي عند البيع الكامل" icon="🏆" accent={tone(f.netAtFull)} value={formatOMR(f.netAtFull)} sub={`الرصيد النقدي الآن ${formatOMR(f.cashPosition)}`} />}
      </div>
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
  if (!data.exhibition) return <EmptyState icon="🏛️" text="المعرض غير موجود أو تم حذفه" />

  const { exhibition: ex, sites, expenses, sponsors, exhibitors, payments, exhibitions, clients } = data
  const own = exhibitors.filter((e) => e.exhibition_id === ex.id)
  const f = exhibitionFinancials({ exhibition: ex, sites, exhibitors, payments, expenses, sponsors }, DEFAULT_TIERS)
  const title = exhibitionTitle(ex)

  const print = async () => {
    setPrinting(true)
    toast('📄 جاري تجهيز ملف المعرض...')
    try {
      await downloadExhibitionFile({ exhibition: ex, sites, exhibitors: own, expenses, sponsors, financials: f })
    } catch (err) {
      toast(`تعذّر إنشاء الملف: ${err.message}`, 'error')
    } finally {
      setPrinting(false)
    }
  }

  const exportSites = () => {
    const byId = new Map(own.map((e) => [e.id, e]))
    downloadCsv(`${title}-المواقع-${todayISO()}.csv`, sites, [
      { label: 'رقم الموقع', value: (s) => s.number },
      { label: 'الفئة', value: (s) => s.tier },
      { label: 'السعر', value: (s) => Number(s.price).toFixed(3) },
      { label: 'الحالة', value: (s) => siteStatus(s, byId.get(s.exhibitor_id)) },
      { label: 'المشارك', value: (s) => byId.get(s.exhibitor_id)?.brand || '' },
      { label: 'المسؤول', value: (s) => byId.get(s.exhibitor_id)?.manager || '' },
      { label: 'الهاتف', value: (s) => byId.get(s.exhibitor_id)?.phone || '' },
      { label: 'النشاط', value: (s) => byId.get(s.exhibitor_id)?.category || '' },
      { label: 'قيمة عقد المشارك', value: (s) => (byId.get(s.exhibitor_id) ? Number(byId.get(s.exhibitor_id).contract).toFixed(3) : '') },
      { label: 'مدفوع المشارك', value: (s) => (byId.get(s.exhibitor_id) ? Number(byId.get(s.exhibitor_id).paid).toFixed(3) : '') },
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
        → كل المعارض
      </Link>

      <div className="file-hero">
        <div>
          <div className="file-hero-kicker">
            {ex.city} • ملف المعرض <StatusBadge status={ex.status} />
          </div>
          <h1 className="file-hero-title">{title}</h1>
          <div className="file-hero-meta">
            {details.map(([label, value]) => (
              <span key={label}>
                {label.split(' ')[0]} {value}
              </span>
            ))}
          </div>
          {ex.notes && <div className="file-hero-notes">{ex.notes}</div>}
        </div>
        <div className="page-actions">
          {canManage && (
            <Button variant="outline" onClick={() => setEditing(true)}>
              ✏️ تعديل البيانات
            </Button>
          )}
          <Button variant="outline" onClick={exportSites} disabled={!sites.length}>
            ⬇️ تصدير Excel
          </Button>
          {internal && (
            <Button onClick={print} disabled={printing}>
              🖨️ طباعة ملف المعرض
            </Button>
          )}
        </div>
      </div>

      <Summary f={f} internal={internal} />

      <div className="tabs tabs-underline mb-16">
        {TABS.filter((t) => internal || !['expenses', 'sponsors'].includes(t.id)).map((t) => (
          <button key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
            {t.id === 'participants' && <span className="tab-count">{own.length}</span>}
            {t.id === 'expenses' && <span className="tab-count">{expenses.length}</span>}
            {t.id === 'sponsors' && <span className="tab-count">{sponsors.length}</span>}
          </button>
        ))}
      </div>

      {tab === 'sites' && ex.map_path && (
        <Panel icon="🗺️" title="خارطة المعرض" className="map-panel">
          <ExhibitionMap key={ex.map_path} path={ex.map_path} />
        </Panel>
      )}
      {tab === 'sites' && <SitesTab exhibition={ex} sites={sites} exhibitors={own} canManage={canManage} onChanged={reload} />}
      {tab === 'participants' && <ParticipantsTab exhibition={ex} exhibitions={exhibitions} exhibitors={own} clients={clients} onChanged={reload} />}
      {internal && tab === 'expenses' && <ExpensesTab exhibitionId={ex.id} expenses={expenses} onChanged={reload} />}
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
