import { useNavigate } from 'react-router-dom'
import { listBookings } from '../api/bookings.js'
import { listExpenses, listSites } from '../api/exhibitionFile.js'
import { listExhibitions } from '../api/exhibitions.js'
import { listExhibitors } from '../api/exhibitors.js'
import { listPayments } from '../api/payments.js'
import Button from '../components/Button.jsx'
import { Loading } from '../components/Feedback.jsx'
import PageHeader from '../components/PageHeader.jsx'
import Panel from '../components/Panel.jsx'
import { ProgressRow } from '../components/Progress.jsx'
import StatCard from '../components/StatCard.jsx'
import StatusBadge, { Chip } from '../components/StatusBadge.jsx'
import { COMPANY } from '../lib/constants.js'
import { balanceOf, isConfirmed, occupancyOf, summarize, sumBy, withVat } from '../lib/finance.js'
import { exhibitionTitle, formatOMR, isolateLtr, monthOf } from '../lib/format.js'
import { useData } from '../lib/useData.js'

const load = async () => {
  const [exhibitions, exhibitors, payments, bookings, sites, expenses] = await Promise.all([
    listExhibitions(),
    listExhibitors(),
    listPayments('*', { includePending: true }),
    listBookings(),
    listSites(),
    listExpenses(),
  ])
  return { exhibitions, exhibitors, payments: payments.filter(isConfirmed), awaiting: payments.filter((p) => !isConfirmed(p)), bookings, sites, expenses }
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
  if (loading || !data) return <Loading />

  const { exhibitions, exhibitors, payments, awaiting, bookings, sites, expenses } = data
  const totals = summarize(exhibitors)
  const pending = bookings.filter((b) => b.status === 'معلق').length
  const confirmed = exhibitors.filter((e) => e.status === 'مؤكد').length
  const withBalance = exhibitors.filter((e) => balanceOf(e) > 0).length
  const active = exhibitions.filter((e) => !['منتهي', 'ملغى'].includes(e.status)).length
  const exhibitorsOf = (id) => exhibitors.filter((e) => e.exhibition_id === id)
  const brandOf = (id) => exhibitors.find((e) => e.id === id)?.brand || '—'

  return (
    <>
      <PageHeader
        title="لوحة التحكم"
        subtitle={
          <>
            مرحباً — هذا ملخص شامل لأداء <strong className="gold-d">{COMPANY.name}</strong> اليوم
          </>
        }
      >
        <Button size="lg" icon="✚" onClick={() => go('/register')}>
          تسجيل مشارك
        </Button>
      </PageHeader>

      {awaiting.length > 0 && (
        <button type="button" className="alert alert-warning alert-link" onClick={() => go('/sales')}>
          ⏳ {awaiting.length} دفعة بانتظار تأكيد وصول المبلغ (بقيمة {formatOMR(withVat(sumBy(awaiting, 'amount')))} شامل الضريبة) — اضغط للمراجعة
        </button>
      )}

      <div className="section-label">المؤشرات المالية</div>
      <div className="grid-4">
        <StatCard label="إجمالي قيمة العقود" value={formatOMR(totals.contract)} sub={`${totals.count} عارض مسجل`} accent="var(--ink)" icon="📋" onClick={() => go('/reports')} />
        <StatCard label="إجمالي المحصّل" value={formatOMR(totals.paid)} sub={`ضريبة القيمة المضافة: ${formatOMR(totals.vat)}`} accent="var(--gold)" icon="💵" onClick={() => go('/sales')} />
        <StatCard
          label="المبلغ المتبقي للتحصيل"
          value={formatOMR(totals.remaining)}
          sub={`${100 - totals.collectionRate}% من إجمالي العقود`}
          accent={totals.remaining > 0 ? 'var(--wrn)' : 'var(--suc)'}
          icon="⏳"
          onClick={() => go('/sales')}
        />
        <StatCard label="المجموع الكلي شامل الضريبة" value={formatOMR(totals.paidWithVat)} sub={`نسبة التحصيل ${totals.collectionRate}%`} accent="var(--suc)" icon="🏆" onClick={() => go('/reports')} />
      </div>

      <div className="section-label">مؤشرات التشغيل</div>
      <div className="grid-4 mb-24">
        <StatCard label="عارضون مؤكدون" value={confirmed} sub={`${exhibitors.length - confirmed} قيد الإجراءات`} accent="var(--suc)" icon="🤝" onClick={() => go('/exhibitors')} />
        <StatCard label="طلبات حجز معلقة" value={pending} sub="تحتاج مراجعة ومتابعة" accent="var(--wrn)" icon="📬" onClick={() => go('/bookings')} />
        <StatCard label="مدفوعات غير مكتملة" value={withBalance} sub="عارض بمبلغ متبقٍّ" accent="var(--dng)" icon="⚠️" onClick={() => go('/sales')} />
        <StatCard label="معارض نشطة" value={active} sub={`من إجمالي ${exhibitions.length} معرض`} accent="var(--purple)" icon="🏛️" onClick={() => go('/exhibitions')} />
      </div>

      <div className="grid-5-3 mb-16">
        <Panel
          icon="🎯"
          title="إشغال البوثات"
          subtitle="نسب حجز كل معرض"
          bodyClass="panel-pad"
          action={
            <Button size="sm" variant="ghost" onClick={() => go('/exhibitions')}>
              عرض الكل ↗
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
                  sub={`${isolateLtr(monthOf(ex.date_from))} • ${formatOMR(sumBy(own, 'paid'))}`}
                />
              )
            })
          ) : (
            <div className="empty-inline">لا توجد معارض بعد</div>
          )}
        </Panel>

        <Panel icon="📅" title="المعارض" subtitle={`${exhibitions.length} معرض مسجل`}>
          {exhibitions.map((ex) => (
            <div key={ex.id} className="list-row clickable" onClick={() => go(`/exhibitions/${ex.id}`)}>
              <div>
                <div className="strong">{exhibitionTitle(ex)}</div>
                <div className="muted small">
                  {occupancyOf(ex, sites, exhibitors).booked}/{occupancyOf(ex, sites, exhibitors).capacity} موقع • {isolateLtr(monthOf(ex.date_from))}
                </div>
              </div>
              <StatusBadge status={ex.status} />
            </div>
          ))}
          {!exhibitions.length && <div className="empty-inline">لا معارض</div>}
        </Panel>
      </div>

      {(() => {
        const unpaid = expenses.filter((x) => !x.paid)
        if (!unpaid.length) return null
        const exhibitionOf = (id) => exhibitions.find((e) => e.id === id)
        const today = new Date(new Date().toISOString().slice(0, 10))
        const daysTo = (d) => Math.round((new Date(d) - today) / 86_400_000)
        return (
          <Panel
            icon="🧾"
            title="مصروفات والتزامات غير مدفوعة"
            subtitle={`${unpaid.length} بند • ${formatOMR(sumBy(unpaid, 'amount'))}`}
            className="mb-16"
          >
            <div className="table-wrap">
              <table className="table table-compact">
                <thead>
                  <tr>
                    <th>البند</th>
                    <th>المعرض</th>
                    <th>المبلغ</th>
                    <th>الاستحقاق</th>
                  </tr>
                </thead>
                <tbody>
                  {unpaid.slice(0, 8).map((x) => {
                    const days = x.due_date ? daysTo(x.due_date) : null
                    return (
                      <tr key={x.id} className="clickable" onClick={() => go(`/exhibitions/${x.exhibition_id}`)}>
                        <td className="strong">{x.item}</td>
                        <td className="small">{exhibitionTitle(exhibitionOf(x.exhibition_id))}</td>
                        <td className="num strong">{formatOMR(x.amount)}</td>
                        <td className="small nowrap">
                          {x.due_date || '—'}
                          {days !== null && (
                            <div className={`tiny ${days < 0 ? 'text-dng strong' : days <= 14 ? 'text-wrn strong' : 'muted'}`}>
                              {days < 0 ? `متأخر ${-days} يوم` : days === 0 ? 'اليوم' : `بعد ${days} يوم`}
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

      <div className="grid-2">
        <Panel
          icon="🤝"
          title="آخر العارضين"
          action={
            <Button size="sm" variant="ghost" onClick={() => go('/exhibitors')}>
              عرض الكل ↗
            </Button>
          }
        >
          <div className="table-wrap">
            <table className="table table-compact">
              <thead>
                <tr>
                  <th>العلامة التجارية</th>
                  <th>التصنيف</th>
                  <th>المدفوع</th>
                  <th>الحالة</th>
                </tr>
              </thead>
              <tbody>
                {exhibitors.slice(0, 6).map((e) => {
                  const balance = balanceOf(e)
                  return (
                    <tr key={e.id} className="clickable" onClick={() => go('/exhibitors')}>
                      <td>
                        <div className="strong">{e.brand}</div>
                        <div className="muted tiny">{e.manager}</div>
                      </td>
                      <td className="muted small">{e.category || '—'}</td>
                      <td>
                        <div className={`strong ${balance > 0 ? 'text-wrn' : 'text-suc'}`}>{formatOMR(e.paid)}</div>
                        {balance > 0 && <div className="tiny text-dng">متبقي {formatOMR(balance)}</div>}
                      </td>
                      <td>
                        <StatusBadge status={e.status} />
                      </td>
                    </tr>
                  )
                })}
                {!exhibitors.length && (
                  <tr>
                    <td colSpan={4} className="empty-inline">
                      لا عارضون بعد
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel
          icon="💰"
          title="آخر المدفوعات"
          action={
            <Button size="sm" variant="ghost" onClick={() => go('/sales')}>
              عرض الكل ↗
            </Button>
          }
        >
          <div className="table-wrap">
            <table className="table table-compact">
              <thead>
                <tr>
                  <th>العارض</th>
                  <th>المبلغ</th>
                  <th>الطريقة</th>
                  <th>التاريخ</th>
                </tr>
              </thead>
              <tbody>
                {payments.slice(0, 6).map((p) => (
                  <tr key={p.id} className="clickable" onClick={() => go('/sales')}>
                    <td className="strong">{brandOf(p.exhibitor_id)}</td>
                    <td className="amount">{formatOMR(p.amount)}</td>
                    <td>
                      <Chip>{p.method}</Chip>
                    </td>
                    <td className="muted small">{p.date}</td>
                  </tr>
                ))}
                {!payments.length && (
                  <tr>
                    <td colSpan={4} className="empty-inline">
                      لا مدفوعات بعد
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </>
  )
}
