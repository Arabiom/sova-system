import { useState } from 'react'
import { Link } from 'react-router-dom'
import { downloadBackup } from '../api/backup.js'
import { listExpenses, listSites, listSponsors } from '../api/exhibitionFile.js'
import { listExhibitions } from '../api/exhibitions.js'
import { listExhibitors } from '../api/exhibitors.js'
import { listPayments } from '../api/payments.js'
import Button from '../components/Button.jsx'
import ExhibitionFilter from '../components/ExhibitionFilter.jsx'
import { Loading } from '../components/Feedback.jsx'
import PageHeader from '../components/PageHeader.jsx'
import Panel from '../components/Panel.jsx'
import { ProgressBar, ShareRow } from '../components/Progress.jsx'
import StatCard from '../components/StatCard.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { COMPANY } from '../lib/constants.js'
import { groupTotals, occupancyOf, summarize, sumBy, vatEnabled, withoutPlanning } from '../lib/finance.js'
import { exhibitionTitle, formatOMR, monthOf, num, percent } from '../lib/format.js'
import { downloadReport } from '../lib/pdf.js'
import { useData } from '../lib/useData.js'
import { tr } from '../lib/i18n.js'

const load = async () => {
  const [exhibitions, exhibitors, payments, sites, expenses, sponsors] = await Promise.all([
    listExhibitions(),
    listExhibitors(),
    listPayments(),
    listSites(),
    listExpenses(),
    listSponsors(),
  ])
  return { exhibitions, exhibitors, payments, sites, expenses, sponsors }
}

export default function Reports({ embedded = false } = {}) {
  const toast = useToast()
  const { data, loading } = useData(load, null)
  const [scope, setScope] = useState('all')
  const [exporting, setExporting] = useState(false)
  const [backingUp, setBackingUp] = useState(false)

  const backup = async () => {
    setBackingUp(true)
    try {
      const counts = await downloadBackup()
      toast(tr('💾 تم تنزيل النسخة الاحتياطية ({0} سجل)', [Object.values(counts).reduce((a, b) => a + b, 0)]))
    } catch (err) {
      toast(tr('تعذّر إنشاء النسخة: {0}', [err.message]), 'error')
    } finally {
      setBackingUp(false)
    }
  }

  if (loading || !data) return <Loading />
  const { exhibitions, exhibitors, payments, sites, expenses, sponsors } = data

  // «كل المعارض» leaves out exhibitions still in planning; each one can still be chosen on its own.
  const live = withoutPlanning(data)
  const scopeExhibitors = scope === 'all' ? live.exhibitors : exhibitors.filter((e) => e.exhibition_id === scope)
  const scopeIds = new Set(scopeExhibitors.map((e) => e.id))
  const scopePayments = scope === 'all' ? live.payments : payments.filter((p) => scopeIds.has(p.exhibitor_id))
  const totals = summarize(scopeExhibitors)

  const byCategory = groupTotals(scopeExhibitors, (e) => e.category || 'أخرى')
  const byMethod = groupTotals(scopePayments, (p) => p.method || 'نقد', (p) => num(p.amount))
  const methodTotal = byMethod.reduce((t, [, v]) => t + v, 0)

  const exportPdf = async () => {
    setExporting(true)
    toast(tr('📄 جاري تصدير التقرير...'))
    try {
      await downloadReport(scope === 'all' ? live : data, scope)
    } catch (err) {
      toast(tr('تعذّر تصدير التقرير: {0}', [err.message]), 'error')
    } finally {
      setExporting(false)
    }
  }

  return (
    <>
      <PageHeader embedded={embedded} title={tr('التقارير المالية 📊')} subtitle={COMPANY.legalName}>
        <ExhibitionFilter exhibitions={exhibitions} value={scope} onChange={setScope} />
        <Button variant="outline" onClick={backup} disabled={backingUp} title={tr('تنزيل كل البيانات في ملف واحد')}>
          {tr('💾 نسخة احتياطية')}
        </Button>
        <Button onClick={exportPdf} disabled={exporting}>
          {tr('🖨️ تصدير PDF')}
        </Button>
      </PageHeader>

      <div className="grid-4 mb-24">
        <StatCard flat label={tr('إجمالي قيمة العقود')} value={formatOMR(totals.contract)} accent="var(--gold)" icon="📋" />
        <StatCard flat label={tr('إجمالي المحصّل')} value={formatOMR(totals.paid)} sub={vatEnabled() ? tr('ضريبة: {0}', [formatOMR(totals.vat)]) : tr('نسبة التحصيل {0}%', [totals.collectionRate])} accent="var(--suc)" icon="✅" />
        <StatCard flat label={tr('متبقي للتحصيل')} value={formatOMR(totals.remaining)} sub={totals.contract ? tr('{0}% من العقود', [percent(totals.remaining, totals.contract)]) : '—'} accent="var(--wrn)" icon="⏳" />
        <StatCard flat label={tr('نسبة التحصيل')} value={`${totals.collectionRate}%`} sub={tr('{0} عارض', [totals.count])} accent="var(--ink)" icon="📈" />
      </div>

      <div className="grid-2 mb-24">
        <Panel title={tr('📦 العارضون حسب التصنيف')} bodyClass="panel-pad">
          {byCategory.map(([category, count]) => (
            <ShareRow key={category} label={category} valueText={tr('{0} عارض', [count])} value={count} total={scopeExhibitors.length} color="linear-gradient(90deg,var(--gold),var(--gold-l))" />
          ))}
          {!byCategory.length && <div className="empty-inline">{tr('لا توجد بيانات')}</div>}
        </Panel>
        <Panel title={tr('💳 المدفوعات حسب الطريقة')} bodyClass="panel-pad">
          {byMethod.map(([method, amount]) => (
            <ShareRow key={method} label={method} valueText={formatOMR(amount)} value={amount} total={methodTotal} color="linear-gradient(90deg,var(--suc),#62C88C)" />
          ))}
          {!byMethod.length && <div className="empty-inline">{tr('لا توجد بيانات')}</div>}
        </Panel>
      </div>

      <Panel title={tr('🏛️ أداء كل معرض')}>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                {[tr('المعرض'), tr('المدينة'), tr('المواقع'), tr('إجمالي العقود'), tr('المحصّل'), tr('المتبقي'), tr('نسبة التحصيل'), tr('المصروفات'), tr('الرعايات'), tr('الصافي حسب العقود')].map((h) => (
                  <th key={h}>{tr(h)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {exhibitions.map((ex) => {
                const s = summarize(exhibitors.filter((e) => e.exhibition_id === ex.id))
                const rate = s.collectionRate
                const exp = sumBy(expenses.filter((x) => x.exhibition_id === ex.id), 'amount')
                const spo = sumBy(sponsors.filter((x) => x.exhibition_id === ex.id), 'amount')
                const net = s.contract + spo - exp
                return (
                  <tr key={ex.id}>
                    <td>
                      <Link to={`/exhibitions/${ex.id}`} className="strong">
                        {exhibitionTitle(ex)}
                      </Link>
                      <div className="muted tiny">{monthOf(ex.date_from)}</div>
                    </td>
                    <td>{tr(ex.city)}</td>
                    <td>
                      {occupancyOf(ex, sites, exhibitors).booked} / {occupancyOf(ex, sites, exhibitors).capacity}
                    </td>
                    <td className="num">{formatOMR(s.contract)}</td>
                    <td className="strong text-suc num">{formatOMR(s.paid)}</td>
                    <td className={`strong num ${s.remaining > 0 ? 'text-dng' : 'text-suc'}`}>{formatOMR(s.remaining)}</td>
                    <td>
                      <div className="rate-cell">
                        <div style={{ width: 80 }}>
                          <ProgressBar pct={rate} color={rate > 70 ? 'var(--suc)' : rate > 40 ? 'var(--wrn)' : 'var(--dng)'} />
                        </div>
                        <strong>{tr(rate)}%</strong>
                      </div>
                    </td>
                    <td className="num">{formatOMR(exp)}</td>
                    <td className="num">{formatOMR(spo)}</td>
                    <td className={`num strong ${net < 0 ? 'text-dng' : 'text-suc'}`}>{formatOMR(net)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  )
}
