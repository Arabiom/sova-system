import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { listClients } from '../api/clients.js'
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
  const tone = (v) => (v >= 0 ? 'var(--suc)' : 'var(--dng)')
  return (
    <>
      <div className="section-label">{tr('الإشغال والتعادل')}</div>
      <div className="grid-4">
        <StatCard flat label={tr('المواقع المحجوزة')} icon="🗺️" accent="var(--ink)" value={`${f.booked} / ${f.capacity}`} sub={tr('{0} متاح • إشغال {1}%', [f.available, f.occupancy])} />
        {internal && (
        <StatCard
          flat
          label={tr('نقطة التعادل')}
          icon="⚖️"
          accent={!f.expensesTotal ? 'var(--muted)' : f.booked >= f.breakEven ? 'var(--suc)' : 'var(--wrn)'}
          value={f.expensesTotal && f.capacity ? tr('{0} موقع', [f.breakEven]) : '—'}
          sub={
            !f.capacity
              ? tr('أضف المواقع أولاً')
              : !f.expensesTotal
                ? tr('أضف المصروفات لحسابها')
                : tr('{0}% من المواقع • {1}', [f.breakEvenPct, f.booked >= f.breakEven ? tr('✓ تم تجاوزها') : tr('باقي {0} موقع', [f.breakEven - f.booked])])
          }
        />
        )}
        {internal && <StatCard flat label={tr('الإيراد عند البيع الكامل')} icon="🎯" accent="var(--gold)" value={formatOMR(f.fullRevenue)} sub={tr('متوسط سعر الموقع {0}', [formatOMR(f.avgPrice)])} />}
        {internal && <StatCard flat label={tr('المصروفات')} icon="🧾" accent="var(--wrn)" value={formatOMR(f.expensesTotal)} sub={tr('مدفوع {0}', [formatOMR(f.expensesPaid)])} />}
      </div>
      <div className="occupancy-bar mb-16">
        <ProgressBar pct={f.occupancy} height={10} color="linear-gradient(90deg,var(--gold),var(--gold-l))" />
        {internal && f.capacity > 0 && f.expensesTotal > 0 && f.breakEven > 0 && f.breakEven <= f.capacity && (
          <span className="breakeven-mark" style={{ insetInlineStart: `${f.breakEvenPct}%` }} title={tr('نقطة التعادل: {0} موقع', [f.breakEven])} />
        )}
      </div>

      {internal && (
        <>
      <div className="section-label">{tr('المالية')}</div>
      <div className="grid-4 mb-24">
        <StatCard flat label={tr('إجمالي العقود')} icon="📋" accent="var(--ink)" value={formatOMR(f.contract)} sub={internal && f.sponsorship ? tr('+ رعايات {0}', [formatOMR(f.sponsorship)]) : undefined} />
        <StatCard flat label={tr('المحصّل')} icon="💵" accent="var(--suc)" value={formatOMR(f.collected)} sub={tr('المتبقي للتحصيل {0}', [formatOMR(f.outstanding)])} />
        {internal && <StatCard flat label={tr('الصافي حسب العقود الحالية')} icon="📈" accent={tone(f.netOnContracts)} value={formatOMR(f.netOnContracts)} sub={tr('العقود + الرعايات − المصروفات')} />}
        {internal && <StatCard flat label={tr('الصافي عند البيع الكامل')} icon="🏆" accent={tone(f.netAtFull)} value={formatOMR(f.netAtFull)} sub={tr('الرصيد النقدي الآن {0}', [formatOMR(f.cashPosition)])} />}
      </div>
        </>
      )}
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
            {tr(t.label)}
            {t.id === 'participants' && <span className="tab-count">{own.length}</span>}
            {t.id === 'expenses' && <span className="tab-count">{expenses.length}</span>}
            {t.id === 'sponsors' && <span className="tab-count">{sponsors.length}</span>}
          </button>
        ))}
      </div>

      {tab === 'sites' && ex.map_path && (
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
