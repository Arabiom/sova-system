import { useNavigate } from 'react-router-dom'
import Button from '../../components/Button.jsx'
import { EmptyState } from '../../components/Feedback.jsx'
import Panel from '../../components/Panel.jsx'
import StatCard from '../../components/StatCard.jsx'
import { Chip } from '../../components/StatusBadge.jsx'
import { daysUntil } from '../../lib/documents.js'
import { tr } from '../../lib/i18n.js'
import { salesPlan } from '../../lib/matching.js'

const STAGE = {
  'مناسب': { badge: 'badge-success', label: 'مهتم — تابِعه للتسجيل' },
  'وصلته رسالة': { badge: 'badge-info', label: 'وصلته الدعوة' },
  '': { badge: 'badge-neutral', label: 'لم يُراسل بعد' },
}

/**
 * «خطة البيع»: how many sites are left and the pace needed until the opening, which of the
 * company's clients this exhibition suits (by its target sectors) and where each one stands —
 * with one click to invite those not yet messaged, or to open the whole list in «العملاء».
 */
export default function SalesPlanTab({ exhibition, exhibitors, clients, capacity, booked, today, canManage, onEditSectors }) {
  const navigate = useNavigate()
  const days = daysUntil(exhibition.date_from, today)
  const plan = salesPlan(exhibition, clients, exhibitors)
  const left = Math.max(0, capacity - booked)
  const weeks = days > 0 ? Math.max(1, Math.ceil(days / 7)) : 0
  const perWeek = weeks ? Math.ceil(left / weeks) : left
  const invite = (list) =>
    navigate('/whatsapp', { state: { audience: 'client', keys: list.map((c) => `client:${c.id}`), template: 'invitation', exhibitionId: exhibition.id } })

  return (
    <>
      {!exhibition.sectors?.length && (
        <div className="alert alert-warning mb-16 db-split">
          <span>{tr('هذا المعرض لم تُحدَّد قطاعاته — فيظهر هنا كل العملاء. حدّد القطاعات ليُعرض على من يناسبه فقط.')}</span>
          {canManage && (
            <Button size="sm" variant="outline" onClick={onEditSectors}>
              {tr('🎯 تحديد القطاعات')}
            </Button>
          )}
        </div>
      )}

      <div className="grid-4 mb-16">
        <StatCard flat label={tr('مواقع متبقية للبيع')} value={left} sub={tr('من {0} موقعاً — بيع {1}', [capacity, booked])} icon="🗺️" accent={left ? 'var(--wrn)' : 'var(--suc)'} />
        <StatCard flat label={tr('أيام حتى الافتتاح')} value={days === null ? '—' : Math.max(0, days)} icon="📅" accent={days !== null && days <= 14 ? 'var(--dng)' : 'var(--ink)'} />
        <StatCard flat label={tr('المطلوب بيعه أسبوعياً')} value={left ? perWeek : 0} icon="📈" accent="var(--info)" sub={left && weeks ? tr('لبيع كل المواقع قبل الافتتاح') : ''} />
        <StatCard flat label={tr('عملاء يناسبهم المعرض')} value={plan.suitable.length} icon="🎯" accent="var(--gold)" />
      </div>

      <Panel
        icon="🎯"
        title={tr('من نتواصل معه لهذا المعرض')}
        subtitle={tr('لم يُراسل {0} • وصلته الدعوة {1} • مهتم {2} • سجّل فعلاً {3}', [plan.fresh.length, plan.messaged.length, plan.interested.length, plan.registered])}
        action={
          <div className="row-actions">
            {plan.fresh.length > 0 && (
              <Button size="sm" variant="whatsapp" onClick={() => invite(plan.fresh)}>
                {tr('📱 دعوة من لم يُراسل ({0})', [plan.fresh.length])}
              </Button>
            )}
            {plan.interested.length > 0 && (
              <Button size="sm" variant="outline" onClick={() => invite(plan.interested)}>
                {tr('📞 تذكير المهتمين ({0})', [plan.interested.length])}
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => navigate('/clients', { state: { fit: exhibition.id } })}>
              {tr('👥 القائمة كاملة في العملاء')}
            </Button>
          </div>
        }
      >
        {plan.suitable.length ? (
          <div className="table-wrap">
            <table className="table table-compact">
              <thead>
                <tr>
                  <th>{tr('العميل')}</th>
                  <th>{tr('القطاع')}</th>
                  <th>{tr('المدينة')}</th>
                  <th>{tr('المرحلة')}</th>
                </tr>
              </thead>
              <tbody>
                {plan.suitable.slice(0, 100).map((c) => {
                  const stage = STAGE[c.outreach || ''] || STAGE['']
                  return (
                    <tr key={c.id}>
                      <td>
                        <div className="strong">{c.name}</div>
                        <div className="ltr tiny muted">{c.phone}</div>
                      </td>
                      <td>
                        {c.sector && <Chip>{tr(c.sector)}</Chip>}
                        {c.products && <div className="tiny muted clip-1">{c.products}</div>}
                      </td>
                      <td className="small">{tr(c.city) || '—'}</td>
                      <td>
                        <span className={`badge ${stage.badge}`}>{tr(stage.label)}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {plan.suitable.length > 100 && <div className="panel-pad muted small">{tr('أول 100 — القائمة كاملة في «العملاء».')}</div>}
          </div>
        ) : (
          <EmptyState icon="🎯" text={clients.length ? tr('لا يوجد عميل في قطاعات هذا المعرض بعد — أضف عملاء أو وسّع القطاعات') : tr('لا يوجد عملاء بعد')} />
        )}
      </Panel>
    </>
  )
}
