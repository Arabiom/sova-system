import { useState } from 'react'
import { contractOfExpense } from '../../api/contracts.js'
import { monthlyFixedTotal } from '../../api/companyExpenses.js'
import { EmptyState } from '../../components/Feedback.jsx'
import Panel from '../../components/Panel.jsx'
import StatCard from '../../components/StatCard.jsx'
import { commitments } from '../../lib/finance.js'
import { formatDate, formatOMR } from '../../lib/format.js'
import { tr, uiLocale } from '../../lib/i18n.js'
import PayExpenseForm from './PayExpenseForm.jsx'

const KIND_ICON = { exhibition: '🏛️', company: '🏢', claim: '👥', obligation: '📌' }
const STATE = {
  late: ['متأخر', 'badge-danger'],
  now: ['مستحق الآن', 'badge-warning'],
  month: ['هذا الشهر', 'badge-info'],
  later: ['قادم', 'badge-neutral'],
  none: ['بدون موعد', 'badge-neutral'],
}

const monthName = (ym) => new Date(`${ym}-01T00:00:00`).toLocaleDateString(uiLocale(), { month: 'long', year: 'numeric' })

/** The four numbers to know at a glance: late, due now, the rest of this month, every month. */
export function CommitmentCards({ c, fixed, go }) {
  return (
    <div className="grid-4 mb-16">
      <StatCard flat label={tr('متأخر')} value={formatOMR(c.late)} sub={c.late ? tr('فات موعد دفعه — يُدفع أولاً') : tr('لا يوجد متأخر')} accent={c.late ? 'var(--dng)' : 'var(--suc)'} icon="⚠️" onClick={go && (() => go('commitments'))} />
      <StatCard flat label={tr('مستحق الآن')} value={formatOMR(c.now)} sub={tr('فترة دفعه مفتوحة اليوم')} accent="var(--wrn)" icon="⏰" onClick={go && (() => go('commitments'))} />
      <StatCard flat label={tr('المتبقي لهذا الشهر')} value={formatOMR(c.thisMonth)} sub={tr('المستحق الآن + ما يحين قبل نهاية الشهر')} accent="var(--info)" icon="📅" onClick={go && (() => go('commitments'))} />
      <StatCard flat label={tr('الالتزام الشهري الثابت')} value={formatOMR(fixed)} sub={tr('الرواتب والإيجار والاشتراكات كل شهر')} accent="var(--ink)" icon="🔁" onClick={go && (() => go('commitments'))} />
    </div>
  )
}

function Rows({ items, canManage, onPay, go }) {
  return (
    <div className="table-wrap">
      <table className="table table-compact">
        <thead>
          <tr>
            <th>{tr('البند')}</th>
            <th>{tr('موعد الدفع')}</th>
            <th>{tr('الحالة')}</th>
            <th>{tr('المبلغ')}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {items.map((x) => (
            <tr key={x.key} className={x.projected ? 'muted' : ''}>
              <td>
                <span className="strong">
                  {KIND_ICON[x.kind]} {tr(x.label)}
                </span>
                <div className="tiny muted">
                  {[x.category && tr(x.category), x.period && monthName(x.period), x.projected && tr('لم يُضف بعد — يُضاف تلقائياً في شهره'), x.partly && tr('دُفع جزء منه')].filter(Boolean).join(' • ')}
                </div>
              </td>
              <td className="nowrap">{x.due ? (x.from && x.from !== x.due ? tr('{0} – {1}', [formatDate(x.from), formatDate(x.due)]) : formatDate(x.due)) : '—'}</td>
              <td>
                <span className={`badge ${STATE[x.state][1]}`}>{tr(STATE[x.state][0])}</span>
              </td>
              <td className={`num strong ${x.state === 'late' ? 'text-dng' : ''}`}>{formatOMR(x.amount)}</td>
              <td className="nowrap">
                {!x.projected && x.kind === 'company' && canManage ? (
                  <button type="button" className="btn btn-sm btn-outline" onClick={() => onPay(x.row)}>
                    {tr('💵 دفع')}
                  </button>
                ) : !x.projected ? (
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => go('expenses', { kind: x.kind })}>
                    {tr('فتح')}
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * «الالتزامات والمواعيد»: everything still to pay — late first, then this month, then month by
 * month until the fixed expenses end (salaries until the contracts end).
 */
export default function Commitments({ data, today, canManage, reload, go }) {
  const [paying, setPaying] = useState(null)
  const c = commitments(data, today)
  const fixed = monthlyFixedTotal(data.companyExpenses || [], today)
  const late = c.items.filter((x) => x.state === 'late')
  const undated = c.items.filter((x) => x.state === 'none')
  const rowProps = { canManage, onPay: setPaying, go }

  return (
    <>
      <CommitmentCards c={c} fixed={fixed} />
      <div className="grid-2 mb-16">
        <StatCard flat label={tr('كل ما عليك حتى نهاية العقود')} value={formatOMR(c.total)} sub={tr('المسجّل غير المدفوع {0} + أشهر ثابتة لم تُضف بعد {1}', [formatOMR(c.total - c.projected), formatOMR(c.projected)])} accent="var(--dng)" icon="🧾" />
        <StatCard flat label={tr('بعد هذا الشهر')} value={formatOMR(c.later)} sub={tr('مواعيد في الأشهر القادمة')} accent="var(--ink)" icon="🗓️" />
      </div>

      {!c.items.length && <EmptyState icon="✅" text={tr('لا يوجد أي مبلغ مستحق عليك')} />}

      {late.length > 0 && (
        <Panel icon="⚠️" title={tr('متأخر — {0}', [formatOMR(c.late)])} subtitle={tr('فات موعد دفعه؛ الأقدم أولاً')} className="mb-16">
          <Rows items={late} {...rowProps} />
        </Panel>
      )}

      {c.months.map((m) => (
        <Panel
          key={m.month}
          icon="📅"
          title={`${monthName(m.month)} — ${formatOMR(m.total)}`}
          subtitle={m.projected ? tr('منها {0} أشهر ثابتة لم تُضف بعد', [formatOMR(m.projected)]) : undefined}
          className="mb-16"
        >
          <Rows items={m.items} {...rowProps} />
        </Panel>
      ))}

      {undated.length > 0 && (
        <Panel icon="❔" title={tr('بدون موعد — {0}', [formatOMR(c.undated)])} subtitle={tr('أضف موعد الدفع لتظهر في شهرها')} className="mb-16">
          <Rows items={undated} {...rowProps} />
        </Panel>
      )}

      <div className="muted tiny">{tr('الأشهر الثابتة بلا تاريخ انتهاء تُعرض لثلاثة أشهر قادمة. المبالغ المدفوعة جزئياً يظهر باقيها فقط.')}</div>

      {paying && (
        <PayExpenseForm
          x={paying}
          contract={contractOfExpense(data.contracts || [], paying.source)}
          onClose={() => setPaying(null)}
          onSaved={() => {
            setPaying(null)
            reload()
          }}
        />
      )}
    </>
  )
}
