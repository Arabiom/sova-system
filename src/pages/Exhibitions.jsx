import { useState } from 'react'
import { Link } from 'react-router-dom'
import { deleteExhibition, listExhibitions, newExhibitionForm } from '../api/exhibitions.js'
import { listSites } from '../api/exhibitionFile.js'
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

const load = async () => {
  const [exhibitions, exhibitors, payments, sites] = await Promise.all([
    listExhibitions(),
    listExhibitors({ columns: 'id,exhibition_id,paid,contract' }),
    listPayments('amount,exhibitor_id'),
    listSites(),
  ])
  return { exhibitions, exhibitors, payments, sites }
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
    const what = `المواقع والمصروفات والرعاة${people ? ` و${people} مشارك` : ''}`
    if (!confirm(`حذف "${exhibitionTitle(ex)}" وكل بياناته (${what})؟ لا يمكن التراجع.`)) return
    try {
      await deleteExhibition(ex.id)
      toast('🗑️ تم الحذف')
      reload()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  const openNew = () => setEditing({ form: newExhibitionForm(), id: null })

  return (
    <>
      <PageHeader title="المعارض والمواعيد" subtitle={`${exhibitions.length} معرض مسجل`}>
        <div className="tabs">
          <button className={`tab ${view === 'cards' ? 'active' : ''}`} onClick={() => setView('cards')}>
            🏛️ المعارض
          </button>
          <button className={`tab ${view === 'calendar' ? 'active' : ''}`} onClick={() => setView('calendar')}>
            📅 التقويم السنوي
          </button>
        </div>
        {canManage && <Button onClick={openNew}>🏛️ + إضافة معرض</Button>}
      </PageHeader>

      {view === 'calendar' && <AnnualCalendar exhibitions={exhibitions} />}

      {view === 'cards' && (
      <div className="cards-grid">
        {exhibitions.map((ex) => {
          const ownSites = sites.filter((x) => x.exhibition_id === ex.id)
          const stats = exhibitionFinancials({ exhibition: ex, sites: ownSites, exhibitors, payments }, DEFAULT_TIERS)
          const tiers = ownSites.length ? tiersFromSites(ownSites) : tiersOf(ex, DEFAULT_TIERS)
          return (
            <article key={ex.id} className="ex-card">
              <Link to={`/exhibitions/${ex.id}`} className="ex-card-head">
                <div className="ex-card-city">
                  {ex.city} • {ex.occasion || 'سلطنة عُمان'}
                </div>
                <div className={`ex-card-brand ${ex.name ? 'ex-card-brand-long' : ''}`}>{ex.name || 'SOVA'}</div>
                <div className="ex-card-meta">
                  📅 {ex.date_from} – {ex.date_to}
                </div>
                <div className="ex-card-meta dim">📍 {ex.mall}</div>
                <div className="ex-card-status">
                  <StatusBadge status={ex.status} />
                </div>
              </Link>
              <div className="ex-card-tiers">
                {tiers.map((tier, idx) => (
                  <div key={idx} className="tier-chip" style={{ '--tier': tierColor(tier.name, idx) }}>
                    <div className="strong small">{tier.name}</div>
                    <div className="tier-chip-price">{tier.price} ر.ع</div>
                    <div className="muted tiny">{tier.count} بوث</div>
                  </div>
                ))}
              </div>
              <div className="ex-card-stats">
                {[
                  ['المواقع المحجوزة', `${stats.booked} / ${stats.capacity} (${stats.occupancy}%)`],
                  ...(money
                    ? [
                        ['الإيراد عند البيع الكامل', formatOMR(stats.fullRevenue)],
                        ['إجمالي العقود', formatOMR(stats.contract)],
                        ['المحصّل', formatOMR(stats.collected)],
                        ['المتبقي للتحصيل', formatOMR(stats.outstanding)],
                      ]
                    : [['المواقع المتاحة', `${stats.available}`]]),
                ].map(([label, value]) => (
                  <div key={label} className="kv-row">
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
              <div className="ex-card-actions">
                <Link to={`/exhibitions/${ex.id}`} className="btn btn-primary btn-sm">
                  📂 ملف المعرض
                </Link>
                {canManage && (<>
                <Button size="sm" variant="outline" onClick={() => setEditing({ form: { ...ex }, id: ex.id })}>
                  ✏️ تعديل
                </Button>
                <Button size="sm" variant="danger" onClick={() => remove(ex)} aria-label="حذف">
                  🗑️
                </Button>
                </>)}
              </div>
            </article>
          )
        })}

        {canManage && <button className="add-card" onClick={openNew}>
          <div className="add-card-icon">🏛️</div>
          <div className="strong">+ إضافة معرض جديد</div>
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
