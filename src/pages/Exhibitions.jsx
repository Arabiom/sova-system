import { useState } from 'react'
import { IconText } from '../components/Glyph.jsx'
import { Link } from 'react-router-dom'
import { deleteExhibition, listExhibitions, newExhibitionForm } from '../api/exhibitions.js'
import { listExpenses, listSites, listSponsors } from '../api/exhibitionFile.js'
import { listStaffExpenses } from '../api/staffExpenses.js'
import { listExhibitors } from '../api/exhibitors.js'
import { listPayments } from '../api/payments.js'
import Button from '../components/Button.jsx'
import { Loading } from '../components/Feedback.jsx'
import ExhibitionForm from '../components/ExhibitionForm.jsx'
import AnnualCalendar from '../components/AnnualCalendar.jsx'
import PageHeader from '../components/PageHeader.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { DEFAULT_TIERS } from '../lib/constants.js'
import { exhibitionFinancials, tiersOf } from '../lib/finance.js'
import { exhibitionTitle, formatOMR } from '../lib/format.js'
import { tierColor, tiersFromSites } from '../lib/sites.js'
import { useData } from '../lib/useData.js'
import { useCan } from '../context/AuthContext.jsx'
import { tr } from '../lib/i18n.js'

const load = async () => {
  const [exhibitions, exhibitors, payments, sites, expenses, sponsors, staffExpenses] = await Promise.all([
    listExhibitions(),
    listExhibitors({ columns: 'id,exhibition_id,paid,contract' }),
    listPayments('amount,exhibitor_id'),
    listSites(),
    // Expenses, sponsors and claims are read by the finance roles only (others get none back).
    listExpenses().catch(() => []),
    listSponsors().catch(() => []),
    listStaffExpenses().catch(() => []),
  ])
  return { exhibitions, exhibitors, payments, sites, expenses, sponsors, staffExpenses }
}

export default function Exhibitions() {
  const toast = useToast()
  const { data, loading, reload } = useData(load, null)
  const [editing, setEditing] = useState(null) // { form, id } while the modal is open
  const [view, setView] = useState('cards') // cards | calendar
  const canManage = useCan('exhibitions.manage')
  const money = useCan('money.view') // marketing: occupancy only, no amounts

  if (loading || !data) return <Loading />
  const { exhibitions, exhibitors, payments, sites } = data

  const remove = async (ex) => {
    const people = exhibitors.filter((e) => e.exhibition_id === ex.id).length
    const what = people ? tr('المواقع والمصروفات والرعاة و{0} مشارك', [people]) : tr('المواقع والمصروفات والرعاة')
    if (!confirm(tr('حذف "{0}" وكل بياناته ({1})؟ لا يمكن التراجع.', [exhibitionTitle(ex), what]))) return
    try {
      await deleteExhibition(ex.id)
      toast(tr('🗑️ تم الحذف'))
      reload()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  const openNew = () => setEditing({ form: newExhibitionForm(), id: null })

  return (
    <>
      <PageHeader title={tr('المعارض والمواعيد')} subtitle={tr('{0} معرض مسجل', [exhibitions.length])}>
        <div className="tabs">
          <button className={`tab ${view === 'cards' ? 'active' : ''}`} onClick={() => setView('cards')}>
            <IconText text={tr('🏛️ المعارض')} />
          </button>
          <button className={`tab ${view === 'calendar' ? 'active' : ''}`} onClick={() => setView('calendar')}>
            <IconText text={tr('📅 التقويم السنوي')} />
          </button>
        </div>
        {canManage && <Button onClick={openNew}>{tr('🏛️ + إضافة معرض')}</Button>}
      </PageHeader>

      {view === 'calendar' && <AnnualCalendar exhibitions={exhibitions} />}

      {view === 'cards' && (
      <div className="cards-grid">
        {exhibitions.map((ex) => {
          const ownSites = sites.filter((x) => x.exhibition_id === ex.id)
          const stats = exhibitionFinancials(
            {
              exhibition: ex,
              sites: ownSites,
              exhibitors,
              payments,
              expenses: data.expenses.filter((x) => x.exhibition_id === ex.id),
              sponsors: data.sponsors.filter((x) => x.exhibition_id === ex.id),
              staffExpenses: data.staffExpenses,
            },
            DEFAULT_TIERS,
          )
          const tiers = ownSites.length ? tiersFromSites(ownSites) : tiersOf(ex, DEFAULT_TIERS)
          return (
            <article key={ex.id} className="ex-card">
              <Link to={`/exhibitions/${ex.id}`} className="ex-card-head">
                <div className="ex-card-city">
                  {tr(ex.city)} • {tr(ex.occasion) || tr('سلطنة عُمان')}
                </div>
                <div className={`ex-card-brand ${ex.name ? 'ex-card-brand-long' : ''}`}>{ex.name || 'SOVA'}</div>
                <div className="ex-card-meta">
                  📅 {tr(ex.date_from)} – {tr(ex.date_to)}
                </div>
                <div className="ex-card-meta dim">📍 {tr(ex.mall)}</div>
                <div className="ex-card-status">
                  <StatusBadge status={ex.status} />
                </div>
              </Link>
              <div className="ex-card-tiers">
                {tiers.map((tier, idx) => (
                  <div key={idx} className="tier-chip" style={{ '--tier': tierColor(tier.name, idx) }}>
                    <div className="strong small">{tr(tier.name)}</div>
                    <div className="tier-chip-price">{tier.price}{' '}{tr('ر.ع')}</div>
                    <div className="muted tiny">{tier.count}{' '}{tr('بوث')}</div>
                  </div>
                ))}
              </div>
              <div className="ex-card-stats">
                {[
                  [tr('المواقع المحجوزة'), `${stats.booked} / ${stats.capacity} (${stats.occupancy}%)`],
                  ...(money
                    ? [
                        [tr('الإيراد عند البيع الكامل'), formatOMR(stats.fullRevenue)],
                        [tr('المصروفات المتوقعة'), formatOMR(stats.expensesTotal), 'text-dng'],
                        [tr('الصافي عند البيع الكامل'), formatOMR(stats.netAtFull), stats.netAtFull >= 0 ? 'text-suc' : 'text-dng'],
                        [tr('إجمالي العقود'), formatOMR(stats.contract)],
                        [tr('المحصّل'), formatOMR(stats.collected)],
                        [tr('المتبقي للتحصيل'), formatOMR(stats.outstanding)],
                      ]
                    : [[tr('المواقع المتاحة'), `${stats.available}`]]),
                ].map(([label, value, tone]) => (
                  <div key={label} className="kv-row">
                    <span>{tr(label)}</span>
                    <strong className={tone}>{tr(value)}</strong>
                  </div>
                ))}
              </div>
              <div className="ex-card-actions">
                <Link to={`/exhibitions/${ex.id}`} className="btn btn-primary btn-sm">
                  {tr('📂 ملف المعرض')}
                </Link>
                {canManage && (<>
                <Button size="sm" variant="outline" onClick={() => setEditing({ form: { ...ex }, id: ex.id })}>
                  {tr('✏️ تعديل')}
                </Button>
                <Button size="sm" variant="danger" onClick={() => remove(ex)} aria-label={tr('حذف')}>
                  🗑️
                </Button>
                </>)}
              </div>
            </article>
          )
        })}

        {canManage && <button className="add-card" onClick={openNew}>
          <div className="add-card-icon">🏛️</div>
          <div className="strong">{tr('+ إضافة معرض جديد')}</div>
        </button>}
      </div>
      )}

      {editing && (
        <ExhibitionForm
          initial={editing.form}
          id={editing.id}
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
