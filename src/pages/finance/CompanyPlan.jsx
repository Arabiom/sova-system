import { useState } from 'react'
import { Link } from 'react-router-dom'
import { endAfter } from '../../api/contracts.js'
import DateInput from '../../components/DateInput.jsx'
import Panel from '../../components/Panel.jsx'
import StatCard from '../../components/StatCard.jsx'
import { DEFAULT_TIERS } from '../../lib/constants.js'
import { downloadCsv } from '../../lib/csv.js'
import { vatEnabled } from '../../lib/finance.js'
import { exhibitionTitle, formatDate, formatOMR, todayISO } from '../../lib/format.js'
import { tr } from '../../lib/i18n.js'
import { companyPlan } from '../../lib/plan.js'
import Button from '../../components/Button.jsx'

const LENGTHS = [1, 3, 6]
const tone = (v) => (v >= 0 ? 'var(--suc)' : 'var(--dng)')

/** Next month (YYYY-MM): a plan is usually made for the months ahead. */
function nextMonth() {
  const [y, m] = todayISO().split('-').map(Number)
  return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7)
}

export default function CompanyPlan({ data }) {
  const [start, setStart] = useState(nextMonth())
  const [length, setLength] = useState(3)
  const [custom, setCustom] = useState({ from: '', to: '' })
  const from = length === 'custom' ? custom.from : `${start}-01`
  const to = length === 'custom' ? custom.to : start ? endAfter(`${start}-01`, length) : ''
  const ready = from && to && to >= from
  const p = ready ? companyPlan(data, from, to, DEFAULT_TIERS) : null

  const exportCsv = () =>
    downloadCsv(`خطة-الشركة-${from}-${to}.csv`, p.months, [
      { label: tr('الشهر'), value: (m) => m.month },
      { label: tr('الدخل المتوقع'), value: (m) => m.income.toFixed(3) },
      { label: tr('الدخل الممكن'), value: (m) => m.potential.toFixed(3) },
      { label: tr('المصروفات'), value: (m) => m.out.toFixed(3) },
      { label: tr('الصافي'), value: (m) => m.net.toFixed(3) },
    ])

  return (
    <>
      <div className="toolbar plan-toolbar">
        <div className="choice-grid choice-grid-4 plan-lengths">
          {[...LENGTHS, 'custom'].map((l) => (
            <button type="button" key={l} className={`choice ${length === l ? 'selected' : ''}`} aria-pressed={length === l} onClick={() => setLength(l)}>
              <span className="choice-title">{l === 'custom' ? tr('فترة أحددها') : l === 1 ? tr('شهر') : tr('{0} أشهر', [l])}</span>
            </button>
          ))}
        </div>
        {length === 'custom' ? (
          <div className="plan-dates">
            <DateInput value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} />
            <span>←</span>
            <DateInput value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} />
          </div>
        ) : (
          <label className="plan-dates">
            <span className="small">{tr('تبدأ من شهر')}</span>
            <input className="input" type="month" value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
        )}
        {p && (
          <Button variant="outline" onClick={exportCsv}>
            {tr('⬇️ تصدير Excel')}
          </Button>
        )}
      </div>

      {!p ? (
        <div className="alert alert-info">{tr('اختر الفترة لتظهر الخطة.')}</div>
      ) : (
        <>
          <div className="plan-period mb-16">
            🗓️ {tr('الخطة من {0} إلى {1}', [formatDate(from), formatDate(to)])} — {tr('{0} معرض في الفترة', [p.shows.length])}
            {vatEnabled() ? ` • ${tr('المبالغ قبل الضريبة')}` : ''}
          </div>

          <div className="grid-4 mb-16">
            <StatCard flat label={tr('الدخل المتوقع')} value={formatOMR(p.income.expected)} sub={tr('عقود موقّعة {0} + رعايات {1}', [formatOMR(p.income.contracts), formatOMR(p.income.sponsorship)])} accent="var(--suc)" icon="💵" />
            <StatCard flat label={tr('المصروفات المتوقعة')} value={formatOMR(p.spend.total)} sub={tr('منها رواتب الفريق {0}', [formatOMR(p.teamFixed)])} accent="var(--dng)" icon="🧾" />
            <StatCard flat label={tr('الصافي المتوقع')} value={formatOMR(p.net)} sub={p.net >= 0 ? tr('ربح') : tr('خسارة')} accent={tone(p.net)} icon="📈" />
            <StatCard flat label={tr('الصافي لو بيعت كل المواقع')} value={formatOMR(p.netPotential)} sub={tr('الدخل الممكن {0}', [formatOMR(p.income.potential)])} accent={tone(p.netPotential)} icon="🎯" />
          </div>

          <div className="grid-2 mb-16">
            <Panel icon="💵" title={tr('الدخل')} bodyClass="panel-pad">
              <div className="kv-list">
                <div className="kv-row"><span>{tr('عقود المشاركين في معارض الفترة')}</span><strong>{formatOMR(p.income.contracts)}</strong></div>
                <div className="kv-row"><span>{tr('منها محصّل')}</span><strong className="text-suc">{formatOMR(p.income.collected)}</strong></div>
                <div className="kv-row"><span>{tr('منها متبقٍ للتحصيل')}</span><strong className="text-wrn">{formatOMR(p.income.remaining)}</strong></div>
                <div className="kv-row"><span>{tr('الرعايات')}</span><strong>{formatOMR(p.income.sponsorship)}</strong></div>
                <div className="kv-row kv-total"><span>{tr('الدخل المتوقع')}</span><strong>{formatOMR(p.income.expected)}</strong></div>
                <div className="kv-row muted small"><span>{tr('الممكن لو بيعت كل المواقع')}</span><span>{formatOMR(p.income.potential)}</span></div>
              </div>
            </Panel>
            <Panel icon="🧾" title={tr('المصروفات')} bodyClass="panel-pad">
              <div className="kv-list">
                <div className="kv-row"><span>{tr('مصروفات معارض الفترة (مع مطالبات الموظفين لها)')}</span><strong>{formatOMR(p.spend.exhibitions)}</strong></div>
                <div className="kv-row"><span>{tr('مصروفات الشركة المسجلة في الفترة')}</span><strong>{formatOMR(p.spend.company)}</strong></div>
                <div className="kv-row"><span>{tr('مصروفات ثابتة قادمة لم تُضف بعد')}</span><strong>{formatOMR(p.spend.fixed)}</strong></div>
                <div className="kv-row"><span>{tr('مطالبات موظفين عامة')}</span><strong>{formatOMR(p.spend.claims)}</strong></div>
                <div className="kv-row kv-total"><span>{tr('المصروفات المتوقعة')}</span><strong>{formatOMR(p.spend.total)}</strong></div>
                <div className="kv-row muted small"><span>{tr('رواتب وعقود الفريق (ضمن ما سبق)')}</span><span>{formatOMR(p.teamFixed)}</span></div>
              </div>
            </Panel>
          </div>

          {(p.obligationsTotal > 0 || p.commissionDue > 0) && (
            <div className="alert alert-warning">
              {tr('إضافة لما سبق — مبالغ مستحقة الدفع في الفترة:')}{' '}
              {p.obligationsTotal > 0 && tr('التزامات {0} ({1})', [formatOMR(p.obligationsTotal), p.obligations.length])}
              {p.obligationsTotal > 0 && p.commissionDue > 0 && ' • '}
              {p.commissionDue > 0 && tr('عمولات لم تُسجَّل {0}', [formatOMR(p.commissionDue)])}
              {' — '}
              <strong>{tr('الصافي بعدها {0}', [formatOMR(p.netAfterAll)])}</strong>
            </div>
          )}

          <Panel icon="📅" title={tr('شهراً بشهر')} className="mb-16">
            <div className="table-wrap">
              <table className="table table-compact">
                <thead>
                  <tr>
                    {[tr('الشهر'), tr('الدخل المتوقع'), tr('المصروفات'), tr('الصافي'), tr('الدخل الممكن')].map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {p.months.map((m) => (
                    <tr key={m.month}>
                      <td className="strong nowrap">{m.month}</td>
                      <td className="num text-suc">{formatOMR(m.income)}</td>
                      <td className="num text-dng">{formatOMR(m.out)}</td>
                      <td className="num strong" style={{ color: tone(m.net) }}>{formatOMR(m.net)}</td>
                      <td className="num muted">{formatOMR(m.potential)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td className="strong">{tr('الإجمالي')}</td>
                    <td className="num strong">{formatOMR(p.income.expected)}</td>
                    <td className="num strong">{formatOMR(p.spend.total)}</td>
                    <td className="num strong" style={{ color: tone(p.net) }}>{formatOMR(p.net)}</td>
                    <td className="num muted">{formatOMR(p.income.potential)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="muted tiny mt-8">{tr('دخل المعرض يُحسب في شهر افتتاحه، والمصروفات في شهر تاريخها.')}</div>
          </Panel>

          <div className="grid-2 mb-16">
            <Panel icon="🏛️" title={tr('معارض الفترة ({0})', [p.shows.length])}>
              {p.shows.length ? (
                <div className="table-wrap">
                  <table className="table table-compact">
                    <thead>
                      <tr>
                        {[tr('المعرض'), tr('العقود'), tr('المصروفات'), tr('الصافي')].map((h) => (
                          <th key={h}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {p.shows.map(({ exhibition: ex, f }) => (
                        <tr key={ex.id}>
                          <td>
                            <Link to={`/exhibitions/${ex.id}`} className="strong">{exhibitionTitle(ex)}</Link>
                            <div className="muted tiny">{formatDate(ex.date_from)} • {tr('{0}/{1} موقع', [f.booked, f.capacity])}</div>
                          </td>
                          <td className="num">{formatOMR(f.contract)}</td>
                          <td className="num text-dng">{formatOMR(f.expensesTotal)}</td>
                          <td className="num strong" style={{ color: tone(f.netOnContracts) }}>{formatOMR(f.netOnContracts)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty-inline">{tr('لا توجد معارض تفتتح في هذه الفترة')}</div>
              )}
            </Panel>
            <Panel icon="👔" title={tr('الفريق في الفترة ({0})', [p.team.length])}>
              {p.team.length ? (
                <div className="table-wrap">
                  <table className="table table-compact">
                    <thead>
                      <tr>
                        {[tr('الاسم'), tr('العقد'), tr('في الفترة'), tr('العمولة')].map((h) => (
                          <th key={h}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {p.team.map(({ contract: c, fixed, commission }) => (
                        <tr key={c.id}>
                          <td>
                            <div className="strong">{c.name}</div>
                            <div className="muted tiny">{c.title}</div>
                          </td>
                          <td className="small nowrap">{formatDate(c.start_date)} ← {formatDate(c.end_date)}</td>
                          <td className="num">{formatOMR(fixed)}</td>
                          <td className="num">{commission.earned ? formatOMR(commission.earned) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty-inline">{tr('لا توجد عقود فريق في هذه الفترة — أضفها من تبويب «عقود الفريق»')}</div>
              )}
            </Panel>
          </div>
        </>
      )}
    </>
  )
}
