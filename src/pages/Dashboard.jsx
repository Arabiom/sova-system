import { useNavigate } from 'react-router-dom'
import { listBookings } from '../api/bookings.js'
import { listExpenses, listSites } from '../api/exhibitionFile.js'
import { listExhibitions } from '../api/exhibitions.js'
import { listExhibitors } from '../api/exhibitors.js'
import { listPayments } from '../api/payments.js'
import { listTasks, TASK_DONE } from '../api/team.js'
import { isOverdue, omanDay } from '../lib/team.js'
import Button from '../components/Button.jsx'
import { Loading } from '../components/Feedback.jsx'
import PageHeader from '../components/PageHeader.jsx'
import Panel from '../components/Panel.jsx'
import { ProgressRow } from '../components/Progress.jsx'
import StatCard from '../components/StatCard.jsx'
import StatusBadge, { Chip } from '../components/StatusBadge.jsx'
import { COMPANY, DEFAULT_TIERS } from '../lib/constants.js'
import { balanceOf, collectionAlerts, exhibitionFinancials, isConfirmed, occupancyOf, summarize, sumBy, vatEnabled, withVat } from '../lib/finance.js'
import { exhibitionTitle, formatDate, formatOMR, isolateLtr, monthOf } from '../lib/format.js'
import { useData } from '../lib/useData.js'
import { useAuth, useCan } from '../context/AuthContext.jsx'
import { tr } from '../lib/i18n.js'

const load = async () => {
  const [exhibitions, exhibitors, payments, bookings, sites, expenses] = await Promise.all([
    listExhibitions(),
    listExhibitors(),
    listPayments('*', { includePending: true }),
    listBookings(),
    listSites(),
    listExpenses(),
  ])
  const tasks = await listTasks().catch(() => null)
  return { exhibitions, exhibitors, payments: payments.filter(isConfirmed), awaiting: payments.filter((p) => !isConfirmed(p)), bookings, sites, expenses, tasks }
}

const barColor = (status) =>
  status === 'منتهي'
    ? 'linear-gradient(90deg,var(--suc),var(--suc-l))'
    : status === 'جاري'
      ? 'linear-gradient(90deg,var(--info),#4A90D9)'
      : 'linear-gradient(90deg,var(--gold),var(--gold-l))'

export default function Dashboard() {
  const go = useNavigate()
  const { data, loading } = useData(load, null)
  const money = useCan('money.view') // marketing: operations only, no amounts
  const uid = useAuth().session?.user?.id
  const canWrite = useCan('data.write') // the viewer only looks
  if (loading || !data) return <Loading />

  const { exhibitions, exhibitors, payments, awaiting, bookings, sites, expenses, tasks } = data
  const myTasks = (tasks || []).filter((t) => t.assigned_to === uid && t.status !== TASK_DONE)
  const myOverdue = myTasks.filter((t) => isOverdue(t)).length
  const totals = summarize(exhibitors)
  const pending = bookings.filter((b) => b.status === 'معلق').length
  const confirmed = exhibitors.filter((e) => e.status === 'مؤكد').length
  const withBalance = exhibitors.filter((e) => balanceOf(e) > 0).length
  const activeList = exhibitions.filter((e) => !['منتهي', 'ملغى'].includes(e.status))
  const active = activeList.length
  // Income if every site of the upcoming / running exhibitions is sold.
  const expectedIncome = activeList.reduce(
    (t, ex) => t + exhibitionFinancials({ exhibition: ex, sites: sites.filter((s) => s.exhibition_id === ex.id) }, DEFAULT_TIERS).fullRevenue,
    0,
  )
  const exhibitorsOf = (id) => exhibitors.filter((e) => e.exhibition_id === id)
  const brandOf = (id) => exhibitors.find((e) => e.id === id)?.brand || '—'
  // Every fee is due 10 days before opening: warn from a week before that deadline.
  const deadlines = collectionAlerts(exhibitions, exhibitors, omanDay())

  return (
    <>
      <PageHeader
        title={tr('لوحة التحكم')}
        subtitle={
          <>
            {tr('مرحباً — هذا ملخص شامل لأداء')}{' '}<strong className="gold-d">{tr(COMPANY.name)}</strong>{' '}{tr('اليوم')}
          </>
        }
      >
        {canWrite && (
          <Button size="lg" icon="✚" onClick={() => go('/register')}>
            {tr('تسجيل مشارك')}
          </Button>
        )}
      </PageHeader>

      {myTasks.length > 0 && (
        <button type="button" className={`alert ${myOverdue ? 'alert-danger' : 'alert-info'} alert-link`} onClick={() => go('/team')}>
          📋 {tr('لديك {0} مهمة مفتوحة', [myTasks.length])}
          {myOverdue ? ` — ${tr('{0} متأخرة', [myOverdue])}` : ''} — {tr('اضغط للعرض')}
        </button>
      )}

      {deadlines.map((a) => (
        <button
          key={a.exhibition.id}
          type="button"
          className={`alert ${a.overdue ? 'alert-danger' : 'alert-warning'} alert-link`}
          onClick={() => go(money ? '/finance' : `/exhibitions/${a.exhibition.id}`, money ? { state: { tab: 'receivables', exhibition: a.exhibition.id } } : undefined)}
        >
          ⏰ <strong>{exhibitionTitle(a.exhibition)}</strong>{' '}
          {a.daysToOpen > 0 ? tr('يفتتح بعد {0} يوم', [a.daysToOpen]) : tr('بدأ المعرض')}
          {' — '}
          {a.overdue
            ? tr('تجاوز آخر موعد لتحصيل الرسوم ({0})', [formatDate(a.deadline)])
            : a.daysLeft === 0
              ? tr('اليوم آخر موعد لتحصيل كل الرسوم')
              : tr('آخر موعد لتحصيل كل الرسوم {0} (بعد {1} يوم)', [formatDate(a.deadline), a.daysLeft])}
          {' — '}
          {money ? tr('{0} مشارك عليهم {1}', [a.owing.length, formatOMR(a.remaining)]) : tr('{0} مشارك لم يكملوا الدفع', [a.owing.length])}
          {' — '}
          {tr('اضغط للعرض')}
        </button>
      ))}

      {money && awaiting.length > 0 && (
        <button type="button" className="alert alert-warning alert-link" onClick={() => go('/finance?tab=income')}>
          ⏳ {awaiting.length}{' '}{tr('دفعة بانتظار تأكيد وصول المبلغ (بقيمة')}{' '}{formatOMR(withVat(sumBy(awaiting, 'amount')))}{vatEnabled() ? tr(' شامل الضريبة') : ''}{tr(') — اضغط للمراجعة')}
        </button>
      )}

      {money && (
        <>
      <div className="section-label">{tr('المؤشرات المالية')}</div>
      <div className="grid-4">
        <StatCard label={tr('إجمالي قيمة العقود')} value={formatOMR(totals.contract)} sub={tr('{0} عارض مسجل', [totals.count])} accent="var(--ink)" icon="📋" onClick={() => go('/finance?tab=reports')} />
        <StatCard label={tr('إجمالي المحصّل')} value={formatOMR(totals.paid)} sub={vatEnabled() ? tr('ضريبة القيمة المضافة: {0}', [formatOMR(totals.vat)]) : tr('نسبة التحصيل {0}%', [totals.collectionRate])} accent="var(--gold)" icon="💵" onClick={() => go('/finance?tab=income')} />
        <StatCard
          label={tr('المبلغ المتبقي للتحصيل')}
          value={formatOMR(totals.remaining)}
          sub={totals.contract ? tr('{0}% من إجمالي العقود', [100 - totals.collectionRate]) : tr('لا توجد عقود بعد')}
          accent={totals.remaining > 0 ? 'var(--wrn)' : 'var(--suc)'}
          icon="⏳"
          onClick={() => go('/finance?tab=receivables')}
        />
        {vatEnabled() ? (
          <StatCard label={tr('المجموع الكلي شامل الضريبة')} value={formatOMR(totals.paidWithVat)} sub={tr('نسبة التحصيل {0}%', [totals.collectionRate])} accent="var(--suc)" icon="🏆" onClick={() => go('/finance?tab=reports')} />
        ) : (
          <StatCard label={tr('الدخل المتوقع من المعارض')} value={formatOMR(expectedIncome)} sub={tr('بيع كل المواقع في المعارض القادمة والجارية')} accent="var(--suc)" icon="🏆" onClick={() => go('/finance')} />
        )}
      </div>
        </>
      )}

      <div className="section-label">{tr('مؤشرات التشغيل')}</div>
      <div className="grid-4 mb-24">
        <StatCard label={tr('عارضون مؤكدون')} value={confirmed} sub={tr('{0} قيد الإجراءات', [exhibitors.length - confirmed])} accent="var(--suc)" icon="🤝" onClick={() => go('/exhibitors')} />
        <StatCard label={tr('طلبات حجز معلقة')} value={pending} sub={tr('تحتاج مراجعة ومتابعة')} accent="var(--wrn)" icon="📬" onClick={() => go('/bookings')} />
        <StatCard label={tr('مدفوعات غير مكتملة')} value={withBalance} sub={tr('عارض بمبلغ متبقٍّ')} accent="var(--dng)" icon="⚠️" onClick={() => go(money ? '/finance?tab=receivables' : '/exhibitors')} />
        <StatCard label={tr('معارض نشطة')} value={active} sub={tr('من إجمالي {0} معرض', [exhibitions.length])} accent="var(--purple)" icon="🏛️" onClick={() => go('/exhibitions')} />
      </div>

      <div className="grid-5-3 mb-16">
        <Panel
          icon="🎯"
          title={tr('إشغال البوثات')}
          subtitle={tr('نسب حجز كل معرض')}
          bodyClass="panel-pad"
          action={
            <Button size="sm" variant="ghost" onClick={() => go('/exhibitions')}>
              {tr('عرض الكل ↗')}
            </Button>
          }
        >
          {exhibitions.length ? (
            exhibitions.map((ex) => {
              const own = exhibitorsOf(ex.id)
              const occ = occupancyOf(ex, sites, exhibitors)
              return (
                <ProgressRow
                  key={ex.id}
                  label={exhibitionTitle(ex)}
                  val={occ.booked}
                  max={occ.capacity}
                  color={barColor(ex.status)}
                  sub={`${isolateLtr(monthOf(ex.date_from))} • ${money ? formatOMR(sumBy(own, 'paid')) : tr('{0} مشارك', [own.length])}`}
                />
              )
            })
          ) : (
            <div className="empty-inline">{tr('لا توجد معارض بعد')}</div>
          )}
        </Panel>

        <Panel icon="📅" title={tr('المعارض')} subtitle={tr('{0} معرض مسجل', [exhibitions.length])}>
          {exhibitions.map((ex) => (
            <div key={ex.id} className="list-row clickable" onClick={() => go(`/exhibitions/${ex.id}`)}>
              <div>
                <div className="strong">{exhibitionTitle(ex)}</div>
                <div className="muted small">
                  {occupancyOf(ex, sites, exhibitors).booked}/{occupancyOf(ex, sites, exhibitors).capacity}{' '}{tr('موقع •')}{' '}{isolateLtr(monthOf(ex.date_from))}
                </div>
              </div>
              <StatusBadge status={ex.status} />
            </div>
          ))}
          {!exhibitions.length && <div className="empty-inline">{tr('لا معارض')}</div>}
        </Panel>
      </div>

      {(() => {
        const unpaid = expenses.filter((x) => !x.paid)
        if (!money || !unpaid.length) return null
        const exhibitionOf = (id) => exhibitions.find((e) => e.id === id)
        const today = new Date(new Date().toISOString().slice(0, 10))
        const daysTo = (d) => Math.round((new Date(d) - today) / 86_400_000)
        return (
          <Panel
            icon="🧾"
            title={tr('مصروفات والتزامات غير مدفوعة')}
            subtitle={tr('{0} بند • {1}', [unpaid.length, formatOMR(sumBy(unpaid, 'amount'))])}
            className="mb-16"
          >
            <div className="table-wrap">
              <table className="table table-compact">
                <thead>
                  <tr>
                    <th>{tr('البند')}</th>
                    <th>{tr('المعرض')}</th>
                    <th>{tr('المبلغ')}</th>
                    <th>{tr('الاستحقاق')}</th>
                  </tr>
                </thead>
                <tbody>
                  {unpaid.slice(0, 8).map((x) => {
                    const days = x.due_date ? daysTo(x.due_date) : null
                    return (
                      <tr key={x.id} className="clickable" onClick={() => go(`/exhibitions/${x.exhibition_id}`)}>
                        <td className="strong">{tr(x.item)}</td>
                        <td className="small">{exhibitionTitle(exhibitionOf(x.exhibition_id))}</td>
                        <td className="num strong">{formatOMR(x.amount)}</td>
                        <td className="small nowrap">
                          {x.due_date || '—'}
                          {days !== null && (
                            <div className={`tiny ${days < 0 ? 'text-dng strong' : days <= 14 ? 'text-wrn strong' : 'muted'}`}>
                              {days < 0 ? tr('متأخر {0} يوم', [-days]) : days === 0 ? tr('اليوم') : tr('بعد {0} يوم', [days])}
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        )
      })()}

      <div className={money ? 'grid-2' : ''}>
        <Panel
          icon="🤝"
          title={tr('آخر العارضين')}
          action={
            <Button size="sm" variant="ghost" onClick={() => go('/exhibitors')}>
              {tr('عرض الكل ↗')}
            </Button>
          }
        >
          <div className="table-wrap">
            <table className="table table-compact">
              <thead>
                <tr>
                  <th>{tr('العلامة التجارية')}</th>
                  <th>{tr('التصنيف')}</th>
                  <th>{money ? tr('المدفوع') : tr('الجوال')}</th>
                  <th>{tr('الحالة')}</th>
                </tr>
              </thead>
              <tbody>
                {exhibitors.slice(0, 6).map((e) => {
                  const balance = balanceOf(e)
                  return (
                    <tr key={e.id} className="clickable" onClick={() => go('/exhibitors')}>
                      <td>
                        <div className="strong">{tr(e.brand)}</div>
                        <div className="muted tiny">{tr(e.manager)}</div>
                      </td>
                      <td className="muted small">{tr(e.category) || '—'}</td>
                      {money ? (
                        <td>
                          <div className={`strong ${balance > 0 ? 'text-wrn' : 'text-suc'}`}>{formatOMR(e.paid)}</div>
                          {balance > 0 && <div className="tiny text-dng">{tr('متبقي')}{' '}{formatOMR(balance)}</div>}
                        </td>
                      ) : (
                        <td className="small" dir="ltr">
                          {e.phone || '—'}
                        </td>
                      )}
                      <td>
                        <StatusBadge status={e.status} />
                      </td>
                    </tr>
                  )
                })}
                {!exhibitors.length && (
                  <tr>
                    <td colSpan={4} className="empty-inline">
                      {tr('لا عارضون بعد')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>

        {money && (
        <Panel
          icon="💰"
          title={tr('آخر المدفوعات')}
          action={
            <Button size="sm" variant="ghost" onClick={() => go('/finance?tab=income')}>
              {tr('عرض الكل ↗')}
            </Button>
          }
        >
          <div className="table-wrap">
            <table className="table table-compact">
              <thead>
                <tr>
                  <th>{tr('العارض')}</th>
                  <th>{tr('المبلغ')}</th>
                  <th>{tr('الطريقة')}</th>
                  <th>{tr('التاريخ')}</th>
                </tr>
              </thead>
              <tbody>
                {payments.slice(0, 6).map((p) => (
                  <tr key={p.id} className="clickable" onClick={() => go('/finance?tab=income')}>
                    <td className="strong">{brandOf(p.exhibitor_id)}</td>
                    <td className="amount">{formatOMR(p.amount)}</td>
                    <td>
                      <Chip>{tr(p.method)}</Chip>
                    </td>
                    <td className="muted small">{tr(p.date)}</td>
                  </tr>
                ))}
                {!payments.length && (
                  <tr>
                    <td colSpan={4} className="empty-inline">
                      {tr('لا مدفوعات بعد')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>
        )}
      </div>
    </>
  )
}
