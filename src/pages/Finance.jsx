import { useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import {
  addDueMonthlyExpenses,
  paymentWindowState,
  COMPANY_EXPENSE_CATEGORIES,
  deleteCompanyExpense,
  monthlyFixedTotal,
  listCompanyExpenses,
  openCompanyReceipt,
  saveCompanyExpense,
  setCompanyExpensePaid,
  validateCompanyExpense,
} from '../api/companyExpenses.js'
import { deleteExpense, listExpenses, listSites, listSponsors, setExpensePaid } from '../api/exhibitionFile.js'
import { listExhibitions } from '../api/exhibitions.js'
import { listExhibitors } from '../api/exhibitors.js'
import { listPayments } from '../api/payments.js'
import { CHEQUE_KIND, deleteObligation, listObligations, OBLIGATION_KINDS, obligationState, payObligation, postponeObligation, REFUND_KIND, reopenObligation, saveObligation, validateObligation } from '../api/obligations.js'
import { contractOfExpense, duplicateSalaries, listContracts, SALARY_CATEGORY } from '../api/contracts.js'
import { listStaff } from '../api/staff.js'
import { addBankBalance, deleteBankBalance, listBankBalances } from '../api/bank.js'
import { listStaffExpenses, openReceipt } from '../api/staffExpenses.js'
import { checkFile } from '../api/storage.js'
import Button from '../components/Button.jsx'
import { IconText } from '../components/Glyph.jsx'
import PlanHealth, { HealthBadge } from '../components/PlanHealth.jsx'
import DateInput from '../components/DateInput.jsx'
import ExhibitionFilter from '../components/ExhibitionFilter.jsx'
import { EmptyState, Loading } from '../components/Feedback.jsx'
import Field from '../components/Field.jsx'
import Modal from '../components/Modal.jsx'
import PageHeader from '../components/PageHeader.jsx'
import Panel from '../components/Panel.jsx'
import StatCard from '../components/StatCard.jsx'
import StatusBadge, { Chip } from '../components/StatusBadge.jsx'
import { useAuth, useCan } from '../context/AuthContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { COMPANY, DEFAULT_TIERS } from '../lib/constants.js'
import { downloadCsv } from '../lib/csv.js'
import { allExpenses, collectionAlerts, combineFinancials, companyOverview, daysBetween, exhibitionFinancials, EXPENSE_KINDS, isConfirmed, ledger, isPlanning, monthlyFlow, paymentDeadline, receivables, sumBy, vatEnabled, withoutPlanning } from '../lib/finance.js'
import { exhibitionLabel, exhibitionTitle, formatDate, formatOMR, num, percent, todayISO } from '../lib/format.js'
import { useData } from '../lib/useData.js'
import { openWhatsApp, paymentReminderMessage } from '../lib/whatsapp.js'
import { tr } from '../lib/i18n.js'
import Expenses, { ExpenseForm as StaffExpenseForm } from './Expenses.jsx'
import { ExpenseForm as ExhibitionExpenseForm } from './exhibition/ExpensesTab.jsx'
import Reports from './Reports.jsx'
import Sales from './Sales.jsx'
import CompanyPlan from './finance/CompanyPlan.jsx'
import TeamContracts from './finance/TeamContracts.jsx'
import { omanDay } from '../lib/team.js'

const TABS = [
  { id: 'overview', label: tr('📊 نظرة عامة') },
  { id: 'income', label: tr('💵 الإيرادات والدفعات') },
  { id: 'receivables', label: tr('⏳ المتبقي للتحصيل') },
  { id: 'expenses', label: tr('🧾 كل المصروفات') },
  { id: 'claims', label: tr('👥 مطالبات الموظفين') },
  { id: 'exhibitions', label: tr('🏛️ حسب المعرض') },
  { id: 'team', label: tr('👔 عقود الفريق') },
  { id: 'company-plan', label: tr('🗓️ خطة الشركة') },
  { id: 'ledger', label: tr('📒 سجل الحركات') },
  { id: 'reports', label: tr('📈 التقارير') },
]

const load = async () => {
  // Fixed monthly company expenses: add this month's (and any missed) before reading.
  await addDueMonthlyExpenses()
  const [exhibitions, exhibitors, payments, sites, expenses, sponsors, companyExpenses, staffExpenses] = await Promise.all([
    listExhibitions(),
    listExhibitors(),
    listPayments('*', { includePending: true }),
    listSites(),
    listExpenses(),
    listSponsors(),
    listCompanyExpenses(),
    listStaffExpenses().catch(() => []),
  ])
  const [staff, obligations, contracts, bankBalances] = await Promise.all([
    listStaff().catch(() => []),
    listObligations().catch(() => []),
    listContracts().catch(() => []),
    listBankBalances().catch(() => null),
  ])
  return { exhibitions, exhibitors, payments, sites, expenses, sponsors, companyExpenses, staffExpenses, staff, obligations, contracts, bankBalances }
}


// ── 1. Overview ─────────────────────────────────────────────────────────────

/** Which exhibitions in planning are left out of the totals, and what they hold. */
function PlannedNote({ planned, go, compact = false }) {
  if (!planned?.length) return null
  const contracts = planned.reduce((t, p) => t + p.contracts, 0)
  const expenses = planned.reduce((t, p) => t + p.expenses, 0)
  return (
    <button type="button" className={`alert alert-info alert-link ${compact ? 'mt-16' : 'mb-16'}`} onClick={() => go('exhibitions')}>
      📝{' '}
      {tr('لا تدخل في الأرقام: {0} — قيد التخطيط', [planned.map((p) => exhibitionLabel(p.exhibition)).join(tr('، '))])}
      {(contracts > 0 || expenses > 0) && ` (${tr('عقود {0} • مصروفات {1}', [formatOMR(contracts), formatOMR(expenses)])})`}
      {'. '}
      {tr('تُحسب تلقائياً عند تغيير حالة المعرض إلى «قادم».')}
    </button>
  )
}

/** Record the balance the bank shows today. */
function BankBalanceForm({ last, onClose, onSaved }) {
  const toast = useToast()
  const [form, setForm] = useState({ amount: '', as_of: todayISO(), account: last?.account || COMPANY.bank, note: '' })
  const [saving, setSaving] = useState(false)
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e?.target ? e.target.value : e }))
  const submit = async () => {
    if (form.amount === '' || Number.isNaN(Number(form.amount))) return toast(tr('اكتب الرصيد كما يظهر في البنك'), 'error')
    if (!form.as_of) return toast(tr('اختر تاريخ الرصيد'), 'error')
    setSaving(true)
    try {
      await addBankBalance(form)
      toast(tr('✅ حُفظ رصيد الحساب'))
      onSaved()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }
  return (
    <Modal
      title={tr('🏦 تحديث رصيد حساب الشركة')}
      subtitle={tr('اكتب المبلغ كما يظهر في تطبيق البنك أو كشف الحساب')}
      size="sm"
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {tr('إلغاء')}
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? tr('جاري...') : tr('حفظ')}
          </Button>
        </>
      }
    >
      <Field label={tr('الرصيد في الحساب (ر.ع)')} required>
        <input className="input" type="number" step="0.001" dir="ltr" autoFocus value={form.amount} onChange={set('amount')} />
      </Field>
      <Field label={tr('بتاريخ')} required>
        <DateInput value={form.as_of} onChange={set('as_of')} />
      </Field>
      <Field label={tr('الحساب')}>
        <input className="input" value={form.account} onChange={set('account')} />
      </Field>
      <Field label={tr('ملاحظة (اختياري)')}>
        <input className="input" value={form.note} onChange={set('note')} placeholder={tr('مثال: بعد إيداع دفعات معرض نزوى')} />
      </Field>
    </Modal>
  )
}

/** What the bank says the company has, next to what the system expects. */
function BankBalance({ rows, cash, canEdit, onChanged }) {
  const toast = useToast()
  const [adding, setAdding] = useState(false)
  const [showAll, setShowAll] = useState(false)
  if (rows === null) {
    return <div className="alert alert-info mb-16">🏦 {tr('لتسجيل رصيد حساب الشركة شغّل تحديث 028 في Supabase.')}</div>
  }
  const last = rows[0]
  const remove = async (row) => {
    if (!window.confirm(tr('حذف رصيد {0} بتاريخ {1}؟', [formatOMR(row.amount), formatDate(row.as_of)]))) return
    try {
      await deleteBankBalance(row.id)
      onChanged()
    } catch (err) {
      toast(err.message, 'error')
    }
  }
  const diff = last ? Math.round((num(last.amount) - cash) * 1000) / 1000 : 0
  const age = last ? daysBetween(last.as_of, todayISO()) : 0
  return (
    <>
      <div className="section-label">{tr('حساب الشركة في البنك')}</div>
      <Panel
        icon="🏦"
        title={last ? formatOMR(last.amount) : tr('لم يُسجّل رصيد الحساب بعد')}
        subtitle={last ? tr('حسب البنك بتاريخ {0}{1}', [formatDate(last.as_of), last.account ? ` • ${last.account}` : '']) : tr('سجّل المبلغ الموجود في حساب الشركة كما يظهر في البنك')}
        className="mb-16 bank-panel"
        action={
          canEdit && (
            <Button size="sm" onClick={() => setAdding(true)}>
              {last ? tr('🔄 تحديث الرصيد') : tr('+ تسجيل رصيد الحساب')}
            </Button>
          )
        }
        bodyClass={last ? 'panel-pad' : ''}
      >
        {last && (
          <>
            {age > 7 && <div className="alert alert-warning mb-12">{tr('⚠️ آخر تحديث للرصيد قبل {0} يوم — حدّثه ليكون الرقم دقيقاً.', [age])}</div>}
            <div className="bank-compare">
              <div>
                <span>{tr('في البنك')}</span>
                <strong>{formatOMR(last.amount)}</strong>
              </div>
              <div>
                <span>{tr('الرصيد النقدي حسب النظام')}</span>
                <strong>{formatOMR(cash)}</strong>
              </div>
              <div className={diff === 0 ? 'ok' : 'off'}>
                <span>{tr('الفرق')}</span>
                <strong>{diff > 0 ? '+' : ''}{formatOMR(diff)}</strong>
              </div>
            </div>
            <div className="muted small mt-10">
              {diff === 0
                ? tr('✔ رصيد البنك مطابق لما سجّله النظام.')
                : diff > 0
                  ? tr('في البنك أكثر مما في النظام: قد تكون دفعات وصلت ولم تُسجّل، أو مبالغ أُودعت من خارج المعارض.')
                  : tr('في البنك أقل مما في النظام: قد تكون مصروفات دُفعت ولم تُسجّل، أو دفعات نقدية لم تُودع في البنك بعد.')}
            </div>
            {rows.length > 1 && (
              <div className="mt-12">
                <button type="button" className="link-btn" onClick={() => setShowAll(!showAll)}>
                  {showAll ? tr('إخفاء السجل') : tr('سجل الأرصدة ({0})', [rows.length])}
                </button>
              </div>
            )}
            {showAll && (
              <div className="table-wrap mt-10">
                <table className="table table-numbered table-compact">
                  <thead>
                    <tr>
                      <th>{tr('التاريخ')}</th>
                      <th>{tr('الرصيد')}</th>
                      <th>{tr('التغيّر')}</th>
                      <th>{tr('ملاحظة')}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => {
                      const prev = rows[i + 1]
                      const change = prev ? num(r.amount) - num(prev.amount) : null
                      return (
                        <tr key={r.id}>
                          <td>{formatDate(r.as_of)}</td>
                          <td className="num strong">{formatOMR(r.amount)}</td>
                          <td className={`num ${change > 0 ? 'text-suc' : change < 0 ? 'text-dng' : 'muted'}`}>{change == null ? '—' : `${change > 0 ? '+' : ''}${formatOMR(change)}`}</td>
                          <td className="small">{r.note || '—'}</td>
                          <td>
                            {canEdit && (
                              <Button size="sm" variant="ghost" onClick={() => remove(r)} title={tr('حذف')}>
                                🗑️
                              </Button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </Panel>
      {adding && (
        <BankBalanceForm
          last={last}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false)
            onChanged()
          }}
        />
      )}
    </>
  )
}
function Overview({ o, flow, go, fixed = 0, bank, canEdit, onChanged }) {
  const rows = [
    ['مصروفات المعارض', o.exhibitionExpenses, o.exhibitionExpensesPaid, 'exhibition'],
    ['مصروفات الشركة', o.company, o.companyPaid, 'company'],
    ['مطالبات الموظفين المعتمدة', o.staffClaims, o.staffReimbursed, 'claim'],
  ]
  return (
    <>
      <div className="section-label">{tr('الإيرادات')}</div>
      <div className="grid-4 mb-16">
        <StatCard flat label={tr('إجمالي العقود')} value={formatOMR(o.contracts)} sub={o.sponsorship ? tr('+ رعايات {0}', [formatOMR(o.sponsorship)]) : tr('قيمة كل المشاركات')} accent="var(--ink)" icon="📋" />
        <StatCard flat label={tr('المحصّل')} value={formatOMR(o.collected)} sub={tr('نسبة التحصيل {0}%', [o.collectionRate])} accent="var(--suc)" icon="💵" onClick={() => go('income')} />
        <StatCard flat label={tr('المتبقي للتحصيل')} value={formatOMR(o.receivable)} sub={tr('اضغط لعرض من عليه مبالغ')} accent="var(--wrn)" icon="⏳" onClick={() => go('receivables')} />
        <StatCard flat label={tr('بانتظار تأكيد الوصول')} value={formatOMR(o.awaiting)} sub={tr('دفعات سجلها التسويق')} accent="var(--info)" icon="🕓" onClick={() => go('income')} />
      </div>

      <div className="section-label">{tr('المصروفات')}</div>
      <div className="grid-3 mb-16">
        <StatCard flat label={tr('إجمالي المصروفات')} value={formatOMR(o.expensesAll)} sub={tr('كل المصروفات المسجّلة — مدفوعة وغير مدفوعة')} accent="var(--dng)" icon="🧾" onClick={() => go('expenses')} />
        <StatCard
          flat
          label={tr('المصروفات المدفوعة')}
          value={formatOMR(o.expensesPaidAll)}
          sub={
            <span className="potential-lines">
              <span>{tr('المعارض')} <strong>{formatOMR(o.exhibitionExpensesPaid)}</strong></span>
              <span>{tr('الشركة')} <strong>{formatOMR(o.companyPaid)}</strong></span>
              <span>{tr('تعويض الموظفين')} <strong>{formatOMR(o.staffReimbursed)}</strong></span>
            </span>
          }
          accent="var(--suc)"
          icon="✅"
          onClick={() => go('expenses', { state: 'paid' })}
        />
        <StatCard flat label={tr('مستحق الدفع')} value={formatOMR(o.payable)} sub={o.staffOwed ? tr('منها للموظفين {0}', [formatOMR(o.staffOwed)]) : tr('مصروفات لم تُدفع بعد')} accent="var(--wrn)" icon="📌" onClick={() => go('expenses', { state: 'unpaid' })} />
      </div>

      <div className="section-label">{tr('النتيجة')}</div>
      <div className="grid-2 mb-16">
        <StatCard flat label={tr('الصافي حسب العقود')} value={formatOMR(o.net)} sub={tr('العقود + الرعايات − كل المصروفات')} accent={o.net >= 0 ? 'var(--suc)' : 'var(--dng)'} icon="📈" />
        <StatCard flat label={tr('الرصيد النقدي')} value={formatOMR(o.cash)} sub={tr('المحصّل − المصروفات المدفوعة')} accent={o.cash >= 0 ? 'var(--suc)' : 'var(--dng)'} icon="🏦" onClick={() => go('ledger')} />
      </div>

      <BankBalance rows={bank} cash={o.cash} canEdit={canEdit} onChanged={onChanged} />

      {fixed > 0 && (
        <button type="button" className="alert alert-info alert-link" onClick={() => go('expenses', { kind: 'company' })}>
          🔁 {tr('مصروفات الشركة الثابتة: ما يعادل {0} شهرياً — تُضاف تلقائياً في مواعيدها', [formatOMR(fixed)])}
        </button>
      )}

      <div className="grid-2 mb-16">
        <Panel icon="🧾" title={tr('المصروفات حسب النوع')}>
          <div className="table-wrap">
            <table className="table table-compact">
              <thead>
                <tr>
                  <th>{tr('النوع')}</th>
                  <th>{tr('الإجمالي')}</th>
                  <th>{tr('المدفوع')}</th>
                  <th>{tr('المتبقي')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(([label, total, paid, kind]) => (
                  <tr key={label} className="clickable" onClick={() => go('expenses', { kind })}>
                    <td className="strong">{tr(label)}</td>
                    <td className="num">{formatOMR(total)}</td>
                    <td className="num text-suc">{formatOMR(paid)}</td>
                    <td className={`num ${total - paid > 0 ? 'text-wrn strong' : 'muted'}`}>{formatOMR(total - paid)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="strong">{tr('الإجمالي')}</td>
                  <td className="num strong">{formatOMR(o.expensesAll)}</td>
                  <td className="num strong">{formatOMR(o.expensesPaidAll)}</td>
                  <td className="num strong">{formatOMR(o.payable)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Panel>

        <Panel icon="📅" title={tr('الحركة الشهرية')} subtitle={tr('الداخل (دفعات مؤكدة) والخارج (مصروفات مدفوعة)')}>
          <div className="table-wrap">
            <table className="table table-compact">
              <thead>
                <tr>
                  <th>{tr('الشهر')}</th>
                  <th>{tr('الداخل')}</th>
                  <th>{tr('الخارج')}</th>
                  <th>{tr('الصافي')}</th>
                </tr>
              </thead>
              <tbody>
                {flow.slice(0, 12).map((m) => (
                  <tr key={m.month}>
                    <td className="strong nowrap">{tr(m.month)}</td>
                    <td className="num text-suc">{formatOMR(m.in)}</td>
                    <td className="num text-dng" title={tr('معارض {0} • شركة {1} • موظفين {2}', [formatOMR(m.exhibitions), formatOMR(m.company), formatOMR(m.staff)])}>
                      {formatOMR(m.out)}
                    </td>
                    <td className={`num strong ${m.net >= 0 ? 'text-suc' : 'text-dng'}`}>{formatOMR(m.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!flow.length && <div className="empty-inline">{tr('لا توجد حركة بعد')}</div>}
          <div className="muted tiny mt-8">{tr('مصروفات المعارض تُحسب في شهر استحقاقها.')}{vatEnabled() ? tr(' المبالغ قبل الضريبة.') : ''}</div>
        </Panel>
      </div>
    </>
  )
}

// ── 2. Receivables ──────────────────────────────────────────────────────────
/** Collection deadline (10 days before opening), red once passed, amber in the last week. */
function DeadlineCell({ deadline, today }) {
  if (!deadline) return '—'
  const days = daysBetween(today, deadline)
  return (
    <>
      <div className={days < 0 ? 'text-dng strong' : days <= 7 ? 'text-wrn strong' : ''}>{formatDate(deadline)}</div>
      <div className="muted tiny">{days < 0 ? tr('متأخر {0} يوم', [-days]) : days === 0 ? tr('اليوم') : tr('بعد {0} يوم', [days])}</div>
    </>
  )
}

function Receivables({ data, canRemind, initialScope = 'all' }) {
  const [scope, setScope] = useState(initialScope)
  const today = omanDay()
  const rows = receivables(data.exhibitors, data.exhibitions).filter((r) => scope === 'all' || r.exhibitor.exhibition_id === scope)
  const total = rows.reduce((t, r) => t + r.remaining, 0)

  const exportCsv = () =>
    downloadCsv(`المتبقي-للتحصيل-${todayISO()}.csv`, rows, [
      { label: tr('المشارك'), value: (r) => r.exhibitor.brand },
      { label: tr('المسؤول'), value: (r) => r.exhibitor.manager },
      { label: tr('الهاتف'), value: (r) => r.exhibitor.phone },
      { label: tr('المعرض'), value: (r) => exhibitionLabel(r.exhibition) },
      { label: tr('العقد'), value: (r) => num(r.exhibitor.contract).toFixed(3) },
      { label: tr('المدفوع'), value: (r) => num(r.exhibitor.paid).toFixed(3) },
      { label: tr('المتبقي'), value: (r) => r.remaining.toFixed(3) },
      { label: tr('آخر موعد للتحصيل'), value: (r) => paymentDeadline(r.exhibition) },
    ])

  return (
    <>
    <div className="toolbar">
      <ExhibitionFilter className="toolbar-select" exhibitions={data.exhibitions} value={scope} onChange={setScope} />
      <Button variant="outline" onClick={exportCsv} disabled={!rows.length}>
        {tr('⬇️ تصدير Excel')}
      </Button>
      <div className="toolbar-count">{rows.length}{' '}{tr('مشارك')}</div>
    </div>
    <Panel icon="⏳" title={tr('المتبقي للتحصيل: {0}', [formatOMR(total)])} subtitle={tr('من عليه مبلغ متبقٍ من قيمة عقده — الأكبر أولاً') + (vatEnabled() ? tr(' • قبل الضريبة') : '')}>
      <div className="table-wrap">
        <table className="table table-numbered">
          <thead>
            <tr>
              {[tr('المشارك'), tr('الهاتف'), tr('المعرض'), tr('العقد'), tr('المدفوع'), tr('المتبقي'), tr('آخر موعد للتحصيل'), tr('الحالة'), ''].map((h) => (
                <th key={h}>{tr(h)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ exhibitor: e, exhibition, remaining }) => (
              <tr key={e.id}>
                <td>
                  <div className="strong">{tr(e.brand)}</div>
                  <div className="muted tiny">{tr(e.manager)}</div>
                </td>
                <td className="ltr small">{e.phone || '—'}</td>
                <td className="small">{exhibition ? <Link to={`/exhibitions/${exhibition.id}`}>{exhibitionLabel(exhibition)}</Link> : '—'}</td>
                <td className="num">{formatOMR(e.contract)}</td>
                <td className="num text-suc">{formatOMR(e.paid)}</td>
                <td className="num strong text-dng">{formatOMR(remaining)}</td>
                <td className="small nowrap">
                  <DeadlineCell deadline={paymentDeadline(exhibition)} today={today} />
                </td>
                <td>
                  <StatusBadge status={e.status} />
                </td>
                <td>
                  {canRemind && e.phone && (
                    <Button size="sm" variant="whatsapp" onClick={() => openWhatsApp(e.phone, paymentReminderMessage(e, exhibition))} title={tr('تذكير بالدفع عبر واتساب')}>
                      {tr('📱 تذكير')}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && <EmptyState icon="✅" text={tr('لا توجد مبالغ متبقية')} />}
    </Panel>
    </>
  )
}

// ── 3. Exhibition plan ──────────────────────────────────────────────────────
function Plan({ data }) {
  const rows = [...data.exhibitions]
    .filter((ex) => ex.status !== 'ملغى')
    .sort((a, b) => String(a.date_from).localeCompare(String(b.date_from)))
    .map((ex) => ({
      ex,
      f: exhibitionFinancials(
        {
          exhibition: ex,
          sites: data.sites.filter((s) => s.exhibition_id === ex.id),
          exhibitors: data.exhibitors,
          payments: data.payments,
          expenses: data.expenses.filter((x) => x.exhibition_id === ex.id),
          sponsors: data.sponsors.filter((s) => s.exhibition_id === ex.id),
          staffExpenses: data.staffExpenses,
        },
        DEFAULT_TIERS,
      ),
    }))
  // Exhibitions still «تخطيط» are listed but stay out of the totals, as everywhere else.
  const counted = rows.filter(({ ex }) => !isPlanning(ex))
  const sum = (key) => counted.reduce((t, r) => t + num(r.f[key]), 0)
  const ahead = counted.filter(({ ex }) => !['منتهي', 'ملغى'].includes(ex.status))

  return (
    <>
    {ahead.length > 0 && <PlanHealth f={combineFinancials(ahead.map((r) => r.f))} title={tr('تقييم المعارض القادمة والجارية ({0})', [ahead.length])} />}
    <Panel icon="🏛️" title={tr('نتائج المعارض')} subtitle={tr('كل معرض: الإشغال، الإيراد الممكن لو بيعت كل المواقع، العقود، المحصّل، المصروفات، والصافي — مرتبة حسب التاريخ')}>
      <div className="table-wrap">
        <table className="table table-compact" style={{ minWidth: 1160 }}>
          <thead>
            <tr>
              {[tr('المعرض'), tr('التاريخ'), tr('الحالة'), tr('المواقع'), tr('الإيراد الممكن'), tr('العقود'), tr('المحصّل / المتبقي'), tr('المصروفات'), tr('الصافي'), tr('التعادل'), tr('التقييم')].map((h) => (
                <th key={h}>{tr(h)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ ex, f }) => (
              <tr key={ex.id} className={ex.status === 'قادم' || ex.status === 'جاري' ? 'row-highlight' : isPlanning(ex) ? 'row-muted' : ''}>
                <td className="strong plan-name">
                  <Link to={`/exhibitions/${ex.id}`}>{exhibitionTitle(ex)}</Link>
                  <div className="muted tiny">{tr(ex.mall)}</div>
                  {isPlanning(ex) && <div className="tiny text-wrn">{tr('قيد التخطيط — لا يدخل في الإجمالي')}</div>}
                </td>
                <td className="small nowrap">
                  {tr(ex.date_from)}
                  <div className="muted tiny">{tr('إلى')}{' '}{tr(ex.date_to)}</div>
                </td>
                <td>
                  <StatusBadge status={ex.status} />
                </td>
                <td className="small nowrap">
                  {f.booked}/{f.capacity} <span className="muted">({tr(f.occupancy)}%)</span>
                </td>
                <td className="num">
                  {formatOMR(f.fullRevenue)}
                  <div className="tiny muted">{tr('مصروفات متوقعة')}{' '}<span className="text-dng">{formatOMR(f.expensesTotal)}</span></div>
                  <div className={`tiny ${f.netAtFull >= 0 ? 'text-suc' : 'text-dng'}`}>{tr('صافٍ متوقع')}{' '}{formatOMR(f.netAtFull)}</div>
                </td>
                <td className="num">{formatOMR(f.contract)}</td>
                <td className="num">
                  <span className="text-suc">{formatOMR(f.collected)}</span>
                  {f.outstanding > 0 && <div className="tiny text-wrn">{tr('متبقي')}{' '}{formatOMR(f.outstanding)}</div>}
                </td>
                <td className="num text-dng">
                  {formatOMR(f.expensesTotal)}
                  {f.claimsTotal > 0 && <div className="tiny muted">{tr('منها مطالبات موظفين')}{' '}{formatOMR(f.claimsTotal)}</div>}
                </td>
                <td className={`num strong ${f.netOnContracts >= 0 ? 'text-suc' : 'text-dng'}`}>
                  {formatOMR(f.netOnContracts)}
                  {f.sponsorship > 0 && <div className="tiny muted">{tr('منها رعايات')}{' '}{formatOMR(f.sponsorship)}</div>}
                </td>
                <td className="small nowrap">
                  {f.expensesTotal && f.capacity ? (
                    <span className={f.booked >= f.breakEven ? 'text-suc' : 'text-wrn'}>
                      {tr(f.breakEven)}{' '}{tr('موقع')}{' '}{f.booked >= f.breakEven ? '✓' : tr('(باقي {0})', [f.breakEven - f.booked])}
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
                <td>
                  <HealthBadge f={f} />
                </td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr>
                <td className="strong" colSpan={4}>
                  {tr('الإجمالي (')}{counted.length}{' '}{tr('معرض)')}
                </td>
                <td className="num strong">{formatOMR(sum('fullRevenue'))}</td>
                <td className="num strong">{formatOMR(sum('contract'))}</td>
                <td className="num strong">
                  {formatOMR(sum('collected'))}
                  <div className="tiny text-wrn">{tr('متبقي')}{' '}{formatOMR(sum('outstanding'))}</div>
                </td>
                <td className="num strong">{formatOMR(sum('expensesTotal'))}</td>
                <td className="num strong">{formatOMR(sum('netOnContracts'))}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {!rows.length && <EmptyState icon="🏛️" text={tr('لا توجد معارض بعد')} />}
      <div className="muted tiny mt-8">{tr('الصافي = العقود + الرعايات − مصروفات المعرض (ومنها مطالبات الموظفين المعتمدة له). الإيراد الممكن = بيع كل المواقع. المعارض الملغاة غير معروضة.')}</div>
    </Panel>
    </>
  )
}

// ── 5. Company expenses ─────────────────────────────────────────────────────
/** How often a fixed expense repeats (months → wording). */
const EVERY_OPTIONS = [
  [1, 'كل شهر'],
  [3, 'كل 3 أشهر'],
  [6, 'كل 6 أشهر'],
]
const everyLabel = (n) => EVERY_OPTIONS.find(([v]) => v === Number(n))?.[1] || ''

/** «تتكرر كل 3 أشهر: من يوم 20 إلى يوم 28» from the chosen window (days only). */
function repeatText(from, to, every) {
  const day = (iso) => +String(iso || '').slice(8, 10) || 0
  const a = day(from)
  const b = day(to)
  const when = tr(everyLabel(every) || 'كل مرة')
  if (!a && !b) return tr('تتكرر نفس الفترة {0} — اختر «من» و«إلى» أعلاه.', [when])
  if (!a) return tr('تتكرر {0}: حتى يوم {1}.', [when, b])
  if (!b) return tr('تتكرر {0}: من يوم {1}.', [when, a])
  const nextMonth = String(to).slice(0, 7) > String(from).slice(0, 7)
  return nextMonth ? tr('تتكرر {0}: من يوم {1} إلى يوم {2} من الشهر الذي يليه.', [when, a, b]) : tr('تتكرر {0}: من يوم {1} إلى يوم {2}.', [when, a, b])
}

const OTHER_CATEGORY = '__other__'

function CompanyExpenseForm({ expense, used = [], onClose, onSaved, onTeam }) {
  const toast = useToast()
  const editing = Boolean(expense?.id)
  const [form, setForm] = useState(() =>
    expense
      ? {
          ...expense,
          wasRecurring: Boolean(expense.recurring),
          recurring_every: expense.recurring ? expense.recurring_every || 1 : '',
          origEvery: expense.recurring_every || 1,
          hadWindow: Boolean(expense.pay_from || expense.pay_to),
          recurring_end: expense.recurring_end ? String(expense.recurring_end).slice(0, 7) : '',
        }
      : { date: todayISO(), category: COMPANY_EXPENSE_CATEGORIES[0], paid: true },
  )
  const monthOfSeries = Boolean(expense?.series_id) // a month added automatically from a fixed expense
  // Every category: the suggested ones plus any the company already typed itself.
  const categoryOptions = [...new Set([...COMPANY_EXPENSE_CATEGORIES, ...used.filter(Boolean)])]
  const [customCategory, setCustomCategory] = useState(() => Boolean(expense?.category) && !categoryOptions.includes(expense.category))
  const [file, setFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const choose = (e) => {
    const chosen = e.target.files?.[0]
    e.target.value = ''
    if (!chosen) return
    const problem = checkFile(chosen, 'الفاتورة')
    if (problem) return toast(problem, 'error')
    setFile(chosen)
  }

  const submit = async () => {
    const errors = validateCompanyExpense(form)
    if (errors.length) return toast(tr('أكمل: {0}', [errors.map((x) => tr(x)).join(tr('، '))]), 'error')
    setSaving(true)
    try {
      await saveCompanyExpense(form, { id: expense?.id, receiptFile: file, oldReceipt: expense?.receipt_path })
      toast(editing ? tr('✅ تم التعديل') : tr('✅ تمت إضافة المصروف'))
      onSaved()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={editing ? tr('تعديل مصروف الشركة') : tr('إضافة مصروف للشركة')}
      subtitle={tr('مصروف عام غير مرتبط بمعرض واحد (إيجار، رواتب، رسوم…)')}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {tr('إلغاء')}
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? tr('جاري...') : tr('حفظ')}
          </Button>
        </>
      }
    >
      <Field label={tr('البيان')} required>
        <input className="input" placeholder={tr('مثال: إيجار المكتب — أكتوبر')} value={form.description || ''} onChange={set('description')} />
      </Field>
      <div className="form-grid">
        <Field label={tr('المبلغ (ر.ع)')} required>
          <input className="input" type="number" min="0" step="0.001" placeholder="0.000" value={form.amount ?? ''} onChange={set('amount')} />
        </Field>
        <Field label={tr('التاريخ')} required>
          <DateInput value={form.date || ''} onChange={set('date')} />
        </Field>
        <Field label={tr('التصنيف')}>
          <select
            className="input"
            value={customCategory ? OTHER_CATEGORY : form.category || ''}
            onChange={(e) => {
              const v = e.target.value
              setCustomCategory(v === OTHER_CATEGORY)
              setForm((f) => ({ ...f, category: v === OTHER_CATEGORY ? '' : v }))
            }}
          >
            {categoryOptions.map((c) => (
              <option key={c} value={c}>
                {tr(c)}
              </option>
            ))}
            <option value={OTHER_CATEGORY}>{tr('✏️ تصنيف آخر — أكتبه')}</option>
          </select>
          {customCategory && <input className="input mt-8" autoFocus placeholder={tr('اكتب التصنيف')} value={form.category || ''} onChange={set('category')} />}
        </Field>
        {form.category === SALARY_CATEGORY && !expense?.id && onTeam && (
          <div className="alert alert-warning span-2">
            {tr('👔 لرواتب الموظفين استخدم «عقود الفريق» — يُسجَّل الراتب هنا تلقائياً كل شهر ويتوقف مع نهاية العقد. تسجيله هنا وهناك يحسبه مرتين.')}{' '}
            <Button size="sm" variant="outline" onClick={onTeam}>
              {tr('فتح عقود الفريق')}
            </Button>
          </div>
        )}
        <Field label={tr('الحالة')}>
          <select className="input" value={form.paid === false ? 'no' : 'yes'} onChange={(e) => setForm((f) => ({ ...f, paid: e.target.value === 'yes' }))}>
            <option value="yes">{tr('مدفوع')}</option>
            <option value="no">{tr('غير مدفوع (مستحق)')}</option>
          </select>
        </Field>
      </div>
      <div className="window-box">
        <div className="field-label">{tr('📅 فترة الدفع — يتوجب الدفع')}</div>
        <div className="form-grid">
          <Field label={tr('من تاريخ')}>
            <DateInput value={form.pay_from || ''} onChange={set('pay_from')} />
          </Field>
          <Field label={tr('إلى تاريخ')} hint={tr('اختياري — بعده يظهر «متأخر» في المتابعة إذا لم يُدفع')}>
            <DateInput value={form.pay_to || form.due_date || ''} onChange={set('pay_to')} />
          </Field>
        </div>
        {form.recurring && !monthOfSeries && <div className="muted tiny strong">{repeatText(form.pay_from, form.pay_to || form.due_date, form.recurring_every)}</div>}
      </div>
      {monthOfSeries ? (
        <div className="alert alert-info">{tr('🔁 هذا شهر {0} من مصروف ثابت متكرر، أُضيف تلقائياً. تعديله يغيّر هذه المرة فقط؛ لتغيير المبلغ للمرات القادمة أو إيقافه عدّل التسجيل الأصلي.', [expense.period])}</div>
      ) : (
        <div className="recurring-box">
          <label className="check-row">
            <input type="checkbox" checked={Boolean(form.recurring)} onChange={(e) => setForm((f) => ({ ...f, recurring: e.target.checked }))} />
            <span className="strong">{tr('🔁 مصروف ثابت متكرر (عقد ثابت)')}</span>
          </label>
          <div className="muted tiny">
            {form.recurring
              ? tr('يُضاف تلقائياً {0} بنفس المبلغ في يوم {1}، «غير مدفوع» حتى تؤشّر عليه. تغيير المبلغ هنا يسري على المرات القادمة.', [
                  tr(everyLabel(form.recurring_every) || 'حسب المدة المختارة'),
                  String(form.date || '').slice(8, 10) || '—',
                ])
              : tr('مثل الإيجار والرواتب والتأمين والتراخيص — سجّله مرة واحدة ويُضاف تلقائياً كل شهر أو 3 أشهر أو 6 أشهر.')}
          </div>
          {form.recurring && (
            <>
              <Field label={tr('يُدفع كل')} required>
                <div className="choice-grid choice-grid-3">
                  {EVERY_OPTIONS.map(([v, label]) => (
                    <button
                      type="button"
                      key={v}
                      className={`choice ${Number(form.recurring_every) === v ? 'selected' : ''}`}
                      aria-pressed={Number(form.recurring_every) === v}
                      onClick={() => setForm((f) => ({ ...f, recurring_every: v }))}
                    >
                      <span className="choice-title">{tr(label)}</span>
                    </button>
                  ))}
                </div>
                {!form.recurring_every && <span className="field-hint text-dng">{tr('اختر مدة التكرار — إلزامي')}</span>}
              </Field>
              <Field label={tr('يتوقف بعد شهر (اختياري)')} hint={tr('اتركه فارغاً ليستمر حتى تلغي العلامة')}>
                <input className="input" type="month" value={form.recurring_end || ''} onChange={set('recurring_end')} />
              </Field>
            </>
          )}
        </div>
      )}
      <Field label={tr('ملاحظات')}>
        <input className="input" value={form.notes || ''} onChange={set('notes')} />
      </Field>
      <Field label={tr('الفاتورة (اختياري)')}>
        <div className="row-actions">
          <label className="btn btn-outline btn-sm file-pick">
            {file || expense?.receipt_path ? tr('🔄 تغيير الفاتورة') : tr('📎 إرفاق فاتورة')}
            <input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={choose} hidden />
          </label>
          <span className="muted small">{file ? `✓ ${file.name}` : expense?.receipt_path ? tr('✓ مرفقة') : tr('بدون فاتورة')}</span>
        </div>
      </Field>
    </Modal>
  )
}

// ── 4. Every expense in one list ────────────────────────────────────────────
const WINDOW_LABEL = { upcoming: 'قادم', open: 'مستحق الآن', late: 'متأخر' }
const WINDOW_CLASS = { upcoming: 'muted', open: 'text-wrn strong', late: 'text-dng strong' }

/** Payment window of an unpaid company expense: «يُدفع من … إلى …» and where it stands today. */
function PayWindow({ x }) {
  const state = paymentWindowState(x, omanDay())
  if (!state) return null
  const from = x.pay_from ? formatDate(x.pay_from) : ''
  const to = x.pay_to || x.due_date ? formatDate(x.pay_to || x.due_date) : ''
  return (
    <div className={`tiny mt-4 ${WINDOW_CLASS[state]}`}>
      {tr(WINDOW_LABEL[state])} — {from ? tr('من {0} إلى {1}', [from, to || '—']) : tr('حتى {0}', [to])}
    </div>
  )
}

const KIND_ICON = { exhibition: '🏛️', company: '🏢', claim: '👥', obligation: '📌' }

// ── Obligations: refunds owed, postponed cheques, debts… ─────────────────────
const OB_STATE = { late: ['متأخر', 'text-dng strong'], soon: ['يستحق قريباً', 'text-wrn strong'], later: ['قائم', 'muted'] }

function ObligationStatus({ ob }) {
  const state = obligationState(ob, omanDay())
  const history = Array.isArray(ob.postponements) ? ob.postponements : []
  if (!state) {
    return (
      <div className="tiny text-suc strong">
        {tr('✓ سُدِّد')} {ob.paid_at ? formatDate(ob.paid_at) : ''}
        {ob.refund_invoice && <div className="muted">{tr('إرجاع {0}', [ob.refund_invoice])}</div>}
      </div>
    )
  }
  const [label, cls] = OB_STATE[state]
  return (
    <div className={`tiny ${cls}`}>
      {tr(label)} — {tr('يستحق {0}', [formatDate(ob.due_date)])}
      {history.length > 0 && (
        <div className="muted" title={history.map((h) => `${formatDate(h.from)} → ${formatDate(h.to)}${h.reason ? ` (${h.reason})` : ''}`).join('\n')}>
          ⏭ {tr('أُجِّل {0} مرة — كان {1}', [history.length, formatDate(ob.original_due)])}
        </div>
      )}
    </div>
  )
}

function ObligationForm({ obligation, exhibitors, exhibitions, onClose, onSaved }) {
  const toast = useToast()
  const editing = Boolean(obligation?.id)
  const [form, setForm] = useState(obligation ? { ...obligation } : { kind: REFUND_KIND, due_date: todayISO() })
  const [saving, setSaving] = useState(false)
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  const exhibitionOf = (id) => exhibitions.find((x) => x.id === id)
  const refund = form.kind === REFUND_KIND

  const pickExhibitor = (e) => {
    const ex = exhibitors.find((x) => x.id === e.target.value)
    setForm((f) => ({ ...f, exhibitor_id: ex?.id || '', party: ex?.brand || '', exhibition_id: ex?.exhibition_id || '' }))
  }

  const submit = async () => {
    const errors = validateObligation(form)
    if (errors.length) return toast(tr('أكمل: {0}', [errors.map((x) => tr(x)).join(tr('، '))]), 'error')
    setSaving(true)
    try {
      await saveObligation(form, obligation?.id)
      toast(editing ? tr('✅ تم التعديل') : tr('✅ تم تسجيل الالتزام'))
      onSaved()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={editing ? tr('تعديل التزام') : tr('تسجيل التزام مستحق')}
      subtitle={tr('مبلغ على الشركة أن تدفعه لاحقاً: إرجاع لمشارك، شيك مؤجل، دفعة مؤجلة…')}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {tr('إلغاء')}
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? tr('جاري...') : tr('حفظ')}
          </Button>
        </>
      }
    >
      <div className="form-grid">
        <Field label={tr('النوع')}>
          <select className="input" value={form.kind} onChange={set('kind')}>
            {OBLIGATION_KINDS.map((k) => (
              <option key={k} value={k}>
                {tr(k)}
              </option>
            ))}
          </select>
        </Field>
        {refund ? (
          <Field label={tr('المشارك')} required hint={tr('عند السداد يُسجَّل إرجاعاً على حسابه تلقائياً')}>
            <select className="input" value={form.exhibitor_id || ''} onChange={pickExhibitor}>
              <option value="">{tr('اختر...')}</option>
              {exhibitors.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.brand} — {exhibitionLabel(exhibitionOf(x.exhibition_id))}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <Field label={tr('لمن (الجهة / الشخص)')} required>
            <input className="input" placeholder={tr('مثال: مطبعة النهضة')} value={form.party || ''} onChange={set('party')} />
          </Field>
        )}
        <Field label={tr('المبلغ (ر.ع)')} required>
          <input className="input" type="number" min="0" step="0.001" placeholder="0.000" value={form.amount ?? ''} onChange={set('amount')} />
        </Field>
        <Field label={editing ? tr('تاريخ الاستحقاق الحالي') : tr('تاريخ الاستحقاق')} required hint={editing ? tr('لتأجيله مع حفظ السبب استخدم زر «تأجيل»') : undefined}>
          <DateInput value={form.due_date || ''} onChange={set('due_date')} />
        </Field>
        {form.kind === CHEQUE_KIND && (
          <Field label={tr('رقم الشيك')}>
            <input className="input" dir="ltr" value={form.cheque_no || ''} onChange={set('cheque_no')} />
          </Field>
        )}
        {!refund && (
          <Field label={tr('المعرض (إن وجد)')}>
            <select className="input" value={form.exhibition_id || ''} onChange={set('exhibition_id')}>
              <option value="">{tr('— عام —')}</option>
              {exhibitions.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {exhibitionLabel(ex)}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>
      <Field label={tr('السبب / الوصف')}>
        <input className="input" placeholder={refund ? tr('مثال: إلغاء المشاركة بسبب تأجيل المعرض') : tr('مثال: شيك حجز المساحة — تأجل بطلب المول')} value={form.description || ''} onChange={set('description')} />
      </Field>
      <Field label={tr('ملاحظات')}>
        <input className="input" value={form.notes || ''} onChange={set('notes')} />
      </Field>
    </Modal>
  )
}

function PostponeForm({ obligation, onClose, onSaved }) {
  const toast = useToast()
  const [to, setTo] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const submit = async () => {
    if (!to) return toast(tr('اختر الموعد الجديد'), 'error')
    setSaving(true)
    try {
      await postponeObligation(obligation, to, reason)
      toast(tr('⏭ تم التأجيل إلى {0}', [formatDate(to)]))
      onSaved()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }
  return (
    <Modal
      title={tr('⏭ تأجيل الالتزام')}
      subtitle={`${obligation.party || obligation.kind} — ${formatOMR(obligation.amount)} • ${tr('يستحق {0}', [formatDate(obligation.due_date)])}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {tr('إلغاء')}
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? tr('جاري...') : tr('تأجيل')}
          </Button>
        </>
      }
    >
      <Field label={tr('الموعد الجديد')} required>
        <DateInput value={to} onChange={(e) => setTo(e.target.value)} />
      </Field>
      <Field label={tr('سبب التأجيل')}>
        <input className="input" placeholder={tr('مثال: طلب المورد التأجيل لنهاية الشهر')} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <div className="muted tiny">{tr('يُحفظ الموعد السابق والسبب في سجل التأجيلات.')}</div>
    </Modal>
  )
}

function AllExpenses({ data, canManage, reload, go, initialKind = '', initialState = '' }) {
  const toast = useToast()
  const userId = useAuth().session?.user?.id
  const [filters, setFilters] = useState({ kind: initialKind, exhibition: 'all', month: '', state: initialState, category: '' })
  const [adding, setAdding] = useState(null) // 'exhibition' | 'company' | 'claim' | 'obligation'
  const [postponing, setPostponing] = useState(null)
  const [editing, setEditing] = useState(null) // an allExpenses() row
  const setFilter = (key) => (e) => setFilters((f) => ({ ...f, [key]: e?.target ? e.target.value : e }))

  const all = allExpenses(data)
  const exhibitionOf = (id) => data.exhibitions.find((x) => x.id === id)
  // Salaries created by a team contract are changed from the contract, not here.
  const contractOf = (x) => (x.kind === 'company' ? contractOfExpense(data.contracts || [], x.source) : null)
  const nameOf = (id) => {
    const s = data.staff.find((x) => x.user_id === id)
    return s?.name || s?.email || ''
  }
  const months = [...new Set(all.map((x) => String(x.date || '').slice(0, 7)).filter(Boolean))].sort().reverse()
  const base = all.filter(
    (x) =>
      (filters.exhibition === 'all' || (filters.exhibition === 'general' ? !x.exhibition_id : x.exhibition_id === filters.exhibition)) &&
      (!filters.month || String(x.date || '').startsWith(filters.month)) &&
      (!filters.state ||
        (filters.state === 'review' ? x.kind === 'claim' && !x.counted : (x.counted || x.kind === 'obligation') && (filters.state === 'paid') === x.paid)) &&
      (!filters.category || x.category === filters.category),
  )
  const rows = base.filter((x) => !filters.kind || x.kind === filters.kind)
  const counted = rows.filter((x) => x.counted)
  const total = sumBy(counted, 'amount')
  const unpaid = sumBy(counted.filter((x) => !x.paid), 'amount')
  const review = rows.filter((x) => x.kind === 'claim' && !x.counted)
  const openObligations = rows.filter((x) => x.kind === 'obligation' && !x.paid)
  // Obligations are not expenses: their chip shows what is still owed.
  const kindTotal = (kind) => sumBy(base.filter((x) => x.kind === kind && (kind === 'obligation' ? !x.paid : x.counted)), 'amount')
  const byCategory = Object.entries(counted.reduce((acc, x) => ({ ...acc, [x.category || 'أخرى']: (acc[x.category || 'أخرى'] || 0) + x.amount }), {})).sort((a, b) => b[1] - a[1])

  const act = async (fn, ok) => {
    try {
      await fn()
      if (ok) toast(ok)
      reload()
    } catch (err) {
      toast(err.message, 'error')
    }
  }
  const togglePaid = (x) => act(() => (x.kind === 'exhibition' ? setExpensePaid(x.source.id, !x.paid) : setCompanyExpensePaid(x.source.id, !x.paid)))
  const remove = (x) =>
    confirm(tr('حذف "{0}"؟', [x.description])) &&
    act(() => (x.kind === 'exhibition' ? deleteExpense(x.source.id) : deleteCompanyExpense(x.source)), tr('🗑️ تم الحذف'))
  const pay = (ob) => {
    const refund = ob.kind === REFUND_KIND && ob.exhibitor_id
    const question = refund
      ? tr('تأكيد إرجاع {0} إلى {1}؟ يُسجَّل إرجاعاً على حسابه في المدفوعات.', [formatOMR(ob.amount), ob.party])
      : tr('تأكيد سداد {0} إلى {1}؟', [formatOMR(ob.amount), ob.party || ob.kind])
    if (!confirm(question)) return
    act(() => payObligation(ob), tr('✅ تم تسجيل السداد'))
  }
  const viewReceipt = (x) => (x.kind === 'company' ? openCompanyReceipt(x.receipt) : openReceipt(x.receipt)).catch((err) => toast(err.message, 'error'))

  const exportCsv = () =>
    downloadCsv(`كل-المصروفات-${todayISO()}.csv`, rows, [
      { label: tr('التاريخ'), value: (x) => x.date },
      { label: tr('النوع'), value: (x) => tr(EXPENSE_KINDS[x.kind]) },
      { label: tr('البيان'), value: (x) => x.description },
      { label: tr('المعرض'), value: (x) => (x.exhibition_id ? exhibitionLabel(exhibitionOf(x.exhibition_id)) : tr('عام')) },
      { label: tr('التصنيف'), value: (x) => x.category },
      { label: tr('المبلغ'), value: (x) => x.amount.toFixed(3) },
      { label: tr('الحالة'), value: (x) => (x.kind === 'claim' ? x.status : x.paid ? 'مدفوع' : 'غير مدفوع') },
      { label: tr('الاستحقاق'), value: (x) => (x.kind === 'obligation' ? x.source.due_date || '' : x.kind === 'company' ? x.pay_to || x.due_date || '' : '') },
      { label: tr('الموظف'), value: (x) => (x.user_id ? nameOf(x.user_id) : '') },
      { label: tr('فاتورة مرفقة'), value: (x) => (x.receipt ? 'نعم' : x.kind === 'exhibition' ? '' : 'لا') },
    ])

  const saved = () => {
    setAdding(null)
    setEditing(null)
    reload()
  }

  return (
    <>
      <div className="category-strip mb-12">
        {[['', '🧾 الكل', sumBy(base.filter((x) => x.counted), 'amount')], ...Object.entries(EXPENSE_KINDS).map(([k, label]) => [k, `${KIND_ICON[k]} ${label}`, kindTotal(k)])].map(([k, label, amount]) => (
          <button key={k || 'all'} type="button" className={`category-chip ${filters.kind === k ? 'selected' : ''}`} onClick={() => setFilters((f) => ({ ...f, kind: k }))}>
            <span>
              <IconText text={tr(label)} size={15} />
            </span>
            <strong>{formatOMR(amount)}</strong>
          </button>
        ))}
      </div>

      <div className="toolbar">
        <select className="input input-compact toolbar-select" value={filters.exhibition} onChange={setFilter('exhibition')} aria-label={tr('المعرض')}>
          <option value="all">{tr('كل المعارض')}</option>
          <option value="general">{tr('عام — بدون معرض')}</option>
          {data.exhibitions.map((ex) => (
            <option key={ex.id} value={ex.id}>
              {exhibitionLabel(ex)}
            </option>
          ))}
        </select>
        <select className="input toolbar-select" value={filters.month} onChange={setFilter('month')} aria-label={tr('الشهر')}>
          <option value="">{tr('كل الأشهر')}</option>
          {months.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <select className="input toolbar-select" value={filters.state} onChange={setFilter('state')} aria-label={tr('الحالة')}>
          <option value="">{tr('كل الحالات')}</option>
          <option value="unpaid">{tr('غير مدفوع')}</option>
          <option value="paid">{tr('مدفوع')}</option>
          <option value="review">{tr('بانتظار المراجعة')}</option>
        </select>
        <Button variant="outline" onClick={exportCsv} disabled={!rows.length}>
          {tr('⬇️ تصدير Excel')}
        </Button>
        <div className="toolbar-count">{rows.length}{' '}{tr('بند')}</div>
      </div>

      {canManage && (
        <div className="page-actions page-actions-bar mb-16">
          <Button onClick={() => setAdding('exhibition')}>{tr('+ مصروف معرض')}</Button>
          <Button onClick={() => setAdding('company')}>{tr('+ مصروف شركة')}</Button>
          <Button variant="outline" onClick={() => setAdding('claim')}>{tr('+ مطالبة موظف (دفعتها من جيبك)')}</Button>
          <Button variant="outline" onClick={() => setAdding('obligation')}>{tr('+ التزام مستحق (مؤجّل / إرجاع)')}</Button>
        </div>
      )}

      {byCategory.length > 1 && (
        <div className="category-strip mb-16">
          {byCategory.slice(0, 10).map(([name, amount]) => (
            <button key={name} type="button" className={`category-chip ${filters.category === name ? 'selected' : ''}`} onClick={() => setFilters((f) => ({ ...f, category: f.category === name ? '' : name }))}>
              <span>{tr(name)}</span>
              <strong>{formatOMR(amount)}</strong>
              <span className="muted tiny">{percent(amount, total)}%</span>
            </button>
          ))}
        </div>
      )}

      <Panel
        icon="🧾"
        title={tr('المصروفات: {0}', [formatOMR(total)])}
        subtitle={
          tr('غير مدفوع {0}', [formatOMR(unpaid)]) +
          (review.length ? tr(' • {0} مطالبة بانتظار المراجعة ({1}) — لا تُحسب حتى تُعتمد', [review.length, formatOMR(sumBy(review, 'amount'))]) : '') +
          (openObligations.length ? tr(' • التزامات قائمة {0}', [formatOMR(sumBy(openObligations, 'amount'))]) : '')
        }
      >
        <div className="table-wrap">
          <table className="table table-numbered" style={{ minWidth: 980 }}>
            <thead>
              <tr>
                {[tr('التاريخ'), tr('البيان'), tr('النوع'), tr('المعرض'), tr('التصنيف'), tr('المبلغ'), tr('الحالة'), tr('الفاتورة'), ''].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((x) => (
                <tr key={x.key} className={x.counted || x.kind === 'obligation' ? '' : 'row-muted'}>
                  <td className="small nowrap">{x.date || '—'}</td>
                  <td>
                    <div className="strong">
                      {tr(x.description)}
                      {x.recurring && <span className="badge badge-info mis-6" title={tr('يُضاف تلقائياً')}>🔁 {tr(everyLabel(x.recurring_every) || 'كل شهر')}</span>}
                      {x.series_id && <span className="badge badge-neutral mis-6">{tr('🔁 شهر {0}', [x.period])}</span>}
                      {contractOf(x) && <span className="badge badge-success mis-6" title={tr('يُعدَّل من عقود الفريق')}>{tr('👔 من عقد: {0}', [contractOf(x).name])}</span>}
                    </div>
                    {(x.user_id || x.notes) && <div className="muted tiny">{[x.user_id && nameOf(x.user_id), x.notes].filter(Boolean).join(' • ')}</div>}
                  </td>
                  <td className="small nowrap">
                    <IconText text={`${KIND_ICON[x.kind]} ${tr(EXPENSE_KINDS[x.kind])}`} size={15} />
                  </td>
                  <td className="small">{x.exhibition_id ? <Link to={`/exhibitions/${x.exhibition_id}`}>{exhibitionLabel(exhibitionOf(x.exhibition_id))}</Link> : <span className="muted">{tr('عام')}</span>}</td>
                  <td>{x.category ? <Chip>{tr(x.category)}</Chip> : '—'}</td>
                  <td className="num strong">{formatOMR(x.amount)}</td>
                  <td>
                    {x.kind === 'obligation' ? (
                      <ObligationStatus ob={x.source} />
                    ) : x.kind === 'claim' ? (
                      <StatusBadge status={x.status} />
                    ) : (
                      <button className={`paid-toggle ${x.paid ? 'on' : ''}`} onClick={() => canManage && togglePaid(x)} disabled={!canManage}>
                        {x.paid ? tr('✓ مدفوع') : tr('غير مدفوع')}
                      </button>
                    )}
                    {x.kind === 'company' && <PayWindow x={x} />}
                  </td>
                  <td>
                    {x.receipt ? (
                      <Button size="sm" variant="outline" onClick={() => viewReceipt(x)}>
                        {tr('📎 عرض')}
                      </Button>
                    ) : (
                      <span className="muted tiny">—</span>
                    )}
                  </td>
                  <td>
                    {x.kind === 'obligation' ? (
                      canManage && (
                        <div className="row-actions">
                          {!x.paid && (
                            <>
                              <Button size="sm" onClick={() => pay(x.source)} title={tr('تم السداد')}>
                                {tr('✓ سُدِّد')}
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => setPostponing(x.source)} title={tr('تأجيل')}>
                                {tr('⏭ تأجيل')}
                              </Button>
                            </>
                          )}
                          {x.paid && !x.source.refund_invoice && (
                            <Button size="sm" variant="ghost" onClick={() => act(() => reopenObligation(x.source))} title={tr('إلغاء السداد')}>
                              ↩️
                            </Button>
                          )}
                          <Button size="sm" variant="outline" onClick={() => setEditing(x)} title={tr('تعديل')}>
                            ✏️
                          </Button>
                          {!x.source.refund_invoice && (
                            <Button size="sm" variant="danger" onClick={() => confirm(tr('حذف "{0}"؟', [x.description])) && act(() => deleteObligation(x.source.id), tr('🗑️ تم الحذف'))} title={tr('حذف')}>
                              🗑️
                            </Button>
                          )}
                        </div>
                      )
                    ) : x.kind === 'claim' ? (
                      <Button size="sm" variant="ghost" onClick={() => go('claims')} title={tr('الاعتماد والتعويض من تبويب المطالبات')}>
                        {tr('مراجعة ↗')}
                      </Button>
                    ) : (
                      canManage &&
                      (contractOf(x) ? (
                        <div className="row-actions">
                          <Button size="sm" variant="outline" onClick={() => go('team', { contract: contractOf(x).id })} title={tr('تعديل الراتب من العقد')}>
                            {tr('👔 العقد')}
                          </Button>
                          {x.source.series_id && (
                            <Button size="sm" variant="danger" onClick={() => remove(x)} title={tr('حذف راتب هذا الشهر فقط')}>
                              🗑️
                            </Button>
                          )}
                        </div>
                      ) : (
                        <div className="row-actions">
                          <Button size="sm" variant="outline" onClick={() => setEditing(x)} title={tr('تعديل')}>
                            ✏️
                          </Button>
                          <Button size="sm" variant="danger" onClick={() => remove(x)} title={tr('حذف')}>
                            🗑️
                          </Button>
                        </div>
                      ))
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && <EmptyState icon="🧾" text={all.length ? tr('لا توجد نتائج لهذا الفلتر') : tr('لا توجد مصروفات بعد')} />}
        <div className="muted tiny mt-8">
          {tr('مصروف المعرض ومطالبة الموظف المرتبطة بمعرض تُحسب في ربح ذلك المعرض تلقائياً. المطالبة تُحسب بعد اعتمادها، وتُعدّ مدفوعة بعد التعويض.')}
        </div>
      </Panel>

      {(adding === 'exhibition' || editing?.kind === 'exhibition') && (
        <ExhibitionExpenseForm
          exhibitions={data.exhibitions}
          initial={editing ? { ...editing.source } : { paid: false, exhibition_id: filters.exhibition !== 'all' && filters.exhibition !== 'general' ? filters.exhibition : '' }}
          id={editing?.source.id}
          onClose={() => (setAdding(null), setEditing(null))}
          onSaved={saved}
        />
      )}
      {(adding === 'company' || editing?.kind === 'company') && <CompanyExpenseForm expense={editing?.source || null} used={data.companyExpenses.map((x) => x.category)} onTeam={() => (setAdding(null), setEditing(null), go('team'))} onClose={() => (setAdding(null), setEditing(null))} onSaved={saved} />}
      {(adding === 'obligation' || editing?.kind === 'obligation') && (
        <ObligationForm obligation={editing?.source || null} exhibitors={data.exhibitors} exhibitions={data.exhibitions} onClose={() => (setAdding(null), setEditing(null))} onSaved={saved} />
      )}
      {postponing && (
        <PostponeForm
          obligation={postponing}
          onClose={() => setPostponing(null)}
          onSaved={() => {
            setPostponing(null)
            reload()
          }}
        />
      )}
      {adding === 'claim' && <StaffExpenseForm exhibitions={data.exhibitions} userId={userId} onClose={() => setAdding(null)} onSaved={saved} />}
    </>
  )
}

// ── 5. Ledger: every movement of money ──────────────────────────────────────
const MOVE_LABELS = {
  payment: '💵 دفعة من مشارك',
  refund: '↩️ مبلغ مُرجَع',
  sponsor: '⭐ رعاية',
  exhibition: '🏛️ مصروف معرض',
  company: '🏢 مصروف شركة',
  claim: '👥 تعويض موظف',
  obligation: '📌 سداد التزام',
}

function Ledger({ data }) {
  const [dir, setDir] = useState('')
  const [month, setMonth] = useState('')
  const [scope, setScope] = useState('all')
  const exhibitorOf = (id) => data.exhibitors.find((e) => e.id === id)
  const exhibitionOf = (id) => data.exhibitions.find((x) => x.id === id)
  const exhibitionIdOf = (r) => r.exhibition_id || exhibitorOf(r.exhibitor_id)?.exhibition_id || null
  const all = ledger(data)
  const months = [...new Set(all.map((r) => r.date.slice(0, 7)).filter(Boolean))].sort().reverse()
  const rows = all.filter(
    (r) => (!dir || (dir === 'in' ? r.amount > 0 : r.amount < 0)) && (!month || r.date.startsWith(month)) && (scope === 'all' || exhibitionIdOf(r) === scope),
  )
  const moneyIn = rows.filter((r) => r.amount > 0).reduce((t, r) => t + r.amount, 0)
  const moneyOut = -rows.filter((r) => r.amount < 0).reduce((t, r) => t + r.amount, 0)
  const labelOf = (r) => {
    if (r.kind === 'payment' || r.kind === 'refund') return [exhibitorOf(r.exhibitor_id)?.brand || '—', r.ref].filter(Boolean).join(' • ')
    return r.label || '—'
  }
  const filtered = Boolean(dir || month || scope !== 'all')

  const exportCsv = () =>
    downloadCsv(`سجل-الحركات-${todayISO()}.csv`, rows, [
      { label: tr('التاريخ'), value: (r) => r.date },
      { label: tr('الحركة'), value: (r) => tr(MOVE_LABELS[r.kind]) },
      { label: tr('البيان'), value: (r) => labelOf(r) },
      { label: tr('المعرض'), value: (r) => (exhibitionIdOf(r) ? exhibitionLabel(exhibitionOf(exhibitionIdOf(r))) : '') },
      { label: tr('داخل'), value: (r) => (r.amount > 0 ? r.amount.toFixed(3) : '') },
      { label: tr('خارج'), value: (r) => (r.amount < 0 ? (-r.amount).toFixed(3) : '') },
      { label: tr('الرصيد'), value: (r) => r.balance.toFixed(3) },
    ])

  return (
    <>
      <div className="toolbar">
        <ExhibitionFilter className="toolbar-select" exhibitions={data.exhibitions} value={scope} onChange={setScope} />
        <select className="input toolbar-select" value={dir} onChange={(e) => setDir(e.target.value)} aria-label={tr('الاتجاه')}>
          <option value="">{tr('الداخل والخارج')}</option>
          <option value="in">{tr('الداخل فقط')}</option>
          <option value="out">{tr('الخارج فقط')}</option>
        </select>
        <select className="input toolbar-select" value={month} onChange={(e) => setMonth(e.target.value)} aria-label={tr('الشهر')}>
          <option value="">{tr('كل الأشهر')}</option>
          {months.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <Button variant="outline" onClick={exportCsv} disabled={!rows.length}>
          {tr('⬇️ تصدير Excel')}
        </Button>
        <div className="toolbar-count">{rows.length}{' '}{tr('حركة')}</div>
      </div>
      <div className="grid-3 mb-16">
        <StatCard flat label={tr('الداخل')} value={formatOMR(moneyIn)} accent="var(--suc)" icon="⬇️" />
        <StatCard flat label={tr('الخارج')} value={formatOMR(moneyOut)} accent="var(--dng)" icon="⬆️" />
        <StatCard flat label={tr('الصافي')} value={formatOMR(moneyIn - moneyOut)} accent={moneyIn >= moneyOut ? 'var(--suc)' : 'var(--dng)'} icon="⚖️" />
      </div>
      <Panel icon="📒" title={tr('سجل الحركات')} subtitle={tr('كل مبلغ دخل أو خرج فعلاً، الأحدث أولاً')}>
        <div className="table-wrap">
          <table className="table table-numbered table-compact" style={{ minWidth: 860 }}>
            <thead>
              <tr>
                {[tr('التاريخ'), tr('الحركة'), tr('البيان'), tr('المعرض'), tr('داخل'), tr('خارج'), ...(filtered ? [] : [tr('الرصيد')])].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <td className="small nowrap">{r.date || '—'}</td>
                  <td className="small nowrap">{tr(MOVE_LABELS[r.kind])}</td>
                  <td className="strong">{tr(labelOf(r))}</td>
                  <td className="small">{exhibitionIdOf(r) ? exhibitionLabel(exhibitionOf(exhibitionIdOf(r))) : <span className="muted">{tr('عام')}</span>}</td>
                  <td className="num text-suc">{r.amount > 0 ? formatOMR(r.amount) : ''}</td>
                  <td className="num text-dng">{r.amount < 0 ? formatOMR(-r.amount) : ''}</td>
                  {!filtered && <td className={`num strong ${r.balance >= 0 ? '' : 'text-dng'}`}>{formatOMR(r.balance)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && <EmptyState icon="📒" text={tr('لا توجد حركات')} />}
        <div className="muted tiny mt-8">
          {tr('الرصيد هنا مجموع الحركات المسجلة في النظام فقط، وليس رصيد البنك. الدفعات بانتظار التأكيد والمصروفات غير المدفوعة لا تظهر حتى تُدفع.')}
          {vatEnabled() ? tr(' المبالغ قبل الضريبة.') : ''}
        </div>
      </Panel>
    </>
  )
}

// ── The finance centre ──────────────────────────────────────────────────────
/** Old tab names (links saved before the finance centre) → the current ones. */
const TAB_ALIASES = { plan: 'exhibitions', 'exhibition-expenses': 'expenses', 'company-expenses': 'expenses', sales: 'income' }

/** Things that need someone's attention, each opening the tab that deals with it. */
function Attention({ data, o, go, today: day }) {
  const alerts = collectionAlerts(data.exhibitions, data.exhibitors, day)
  const pendingPayments = data.payments.filter((p) => !isConfirmed(p))
  const pendingClaims = data.staffExpenses.filter((x) => x.status === 'بانتظار المراجعة')
  const dueOf = (x) => (x.kind === 'company' ? x.pay_to || x.due_date : x.source.due_date) || ''
  const unpaidList = allExpenses(data).filter((x) => (x.kind === 'exhibition' || x.kind === 'company') && !x.paid)
  const overdue = unpaidList.filter((x) => dueOf(x) && dueOf(x) < day)
  const payNow = unpaidList.filter((x) => x.kind === 'company' && paymentWindowState(x, day) === 'open')
  const obLate = data.obligations.filter((x) => obligationState(x, day) === 'late')
  const doubled = duplicateSalaries(data.contracts || [], data.companyExpenses)
  const obSoon = data.obligations.filter((x) => obligationState(x, day) === 'soon')
  const items = [
    ...alerts.map((a) => ({
      key: `d:${a.exhibition.id}`,
      tone: a.overdue ? 'danger' : 'warning',
      text: `⏰ ${exhibitionTitle(a.exhibition)} — ${a.overdue ? tr('تجاوز آخر موعد لتحصيل الرسوم ({0})', [formatDate(a.deadline)]) : tr('آخر موعد لتحصيل كل الرسوم {0} (بعد {1} يوم)', [formatDate(a.deadline), a.daysLeft])} — ${tr('{0} مشارك عليهم {1}', [a.owing.length, formatOMR(a.remaining)])}`,
      open: () => go('receivables', { exhibition: a.exhibition.id }),
    })),
    pendingPayments.length && {
      key: 'pp',
      tone: 'warning',
      text: `🕓 ${tr('{0} دفعة بانتظار تأكيد وصول المبلغ ({1})', [pendingPayments.length, formatOMR(o.awaiting)])}`,
      open: () => go('income'),
    },
    pendingClaims.length && {
      key: 'pc',
      tone: 'info',
      text: `👥 ${tr('{0} مطالبة موظف بانتظار المراجعة ({1})', [pendingClaims.length, formatOMR(sumBy(pendingClaims, 'amount'))])}`,
      open: () => go('claims'),
    },
    o.staffOwed > 0.0005 && {
      key: 'so',
      tone: 'info',
      text: `💵 ${tr('مطالبات معتمدة لم تُعوَّض للموظفين بعد: {0}', [formatOMR(o.staffOwed)])}`,
      open: () => go('claims'),
    },
    ...doubled.map((d) => ({
      key: `dup:${d.contract.id}`,
      tone: 'danger',
      text: `⚠️ ${tr('راتب «{0}» مسجّل يدوياً في المصروفات ({1}) وله عقد في «عقود الفريق» — يُحسب مرتين. احذف المسجّل يدوياً', [d.contract.name, d.expenses.map((x) => x.description).join('، ')])}`,
      open: () => go('expenses', { kind: 'company' }),
    })),
    obLate.length && {
      key: 'ol',
      tone: 'danger',
      text: `📌 ${tr('{0} التزام تجاوز موعده ({1})', [obLate.length, formatOMR(sumBy(obLate, 'amount'))])}`,
      open: () => go('expenses', { kind: 'obligation' }),
    },
    obSoon.length && {
      key: 'os',
      tone: 'warning',
      text: `📌 ${tr('{0} التزام يستحق خلال 7 أيام ({1})', [obSoon.length, formatOMR(sumBy(obSoon, 'amount'))])}`,
      open: () => go('expenses', { kind: 'obligation' }),
    },
    payNow.length && {
      key: 'pn',
      tone: 'warning',
      text: `📅 ${tr('{0} مصروف موعد دفعه الآن ({1})', [payNow.length, formatOMR(sumBy(payNow, 'amount'))])}`,
      open: () => go('expenses', { kind: 'company' }),
    },
    overdue.length && {
      key: 'od',
      tone: 'danger',
      text: `📌 ${tr('{0} مصروف تجاوز موعد دفعه ({1})', [overdue.length, formatOMR(sumBy(overdue, 'amount'))])}`,
      open: () => go('expenses'),
    },
  ].filter(Boolean)
  if (!items.length) return <div className="alert alert-success mb-16">{tr('✅ لا يوجد ما يحتاج متابعة الآن')}</div>
  return (
    <div className="mb-16">
      {items.map((x) => (
        <button key={x.key} type="button" className={`alert alert-${x.tone} alert-link`} onClick={x.open}>
          <IconText text={x.text} size={17} /> <span className="alert-more">{tr('اضغط للعرض')}</span>
        </button>
      ))}
    </div>
  )
}

export default function Finance() {
  const { data, loading, reload } = useData(load, null)
  const { state } = useLocation() // the dashboard's alerts open a tab (and an exhibition)
  const [params, setParams] = useSearchParams()
  const asked = params.get('tab') || state?.tab || 'overview'
  const tab = TAB_ALIASES[asked] || (TABS.some((t) => t.id === asked) ? asked : 'overview')
  const [focus, setFocus] = useState({ exhibition: params.get('exhibition') || state?.exhibition || 'all' })
  const canManage = useCan('payments.write') // admin + finance; the viewer only reads
  const canRemind = useCan('data.write')

  const go = (id, extra = {}) => {
    setFocus({ exhibition: 'all', ...extra })
    setParams({ tab: id }, { replace: false })
    window.scrollTo?.(0, 0)
  }

  if (loading) return <Loading />
  if (!data) return <EmptyState icon="💼" text={tr('تعذّر تحميل البيانات المالية')} />

  // Exhibitions still «تخطيط» stay out of the company's money until they become «قادم».
  const live = withoutPlanning(data)
  const o = companyOverview(live)
  const flow = monthlyFlow(live)

  return (
    <>
      <PageHeader title={tr('المالية 💼')} subtitle={tr('كل أموال الشركة في مكان واحد: الإيرادات والدفعات، المتبقي، كل المصروفات والفواتير، مطالبات الموظفين، والتقارير')} />

      <div className="tabs tabs-underline tabs-scroll mb-16">
        {TABS.map((t) => (
          <button key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => go(t.id)}>
            <IconText text={tr(t.label)} size={16} />
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <>
          <Attention data={live} o={o} go={go} today={omanDay()} />
          <PlannedNote planned={live.planned} go={go} />
          <Overview o={o} flow={flow} go={go} fixed={monthlyFixedTotal(live.companyExpenses)} bank={data.bankBalances} canEdit={canManage} onChanged={reload} />
        </>
      )}
      {tab === 'income' && <Sales embedded onChanged={reload} />}
      {tab === 'receivables' && <Receivables key={focus.exhibition} data={live} canRemind={canRemind} initialScope={focus.exhibition} />}
      {tab === 'expenses' && <AllExpenses data={live} canManage={canManage} reload={reload} go={go} initialKind={focus.kind || ''} initialState={focus.state || ''} key={`${focus.kind || ''}|${focus.state || ''}`} />}
      {tab === 'claims' && <Expenses embedded onChanged={reload} />}
      {tab === 'exhibitions' && <Plan data={data} />}
      {tab !== 'overview' && tab !== 'exhibitions' && <PlannedNote planned={live.planned} go={go} compact />}
      {tab === 'ledger' && <Ledger data={live} />}
      {tab === 'team' && <TeamContracts key={focus.contract || ''} data={data} canManage={canManage} reload={reload} openId={focus.contract} />}
      {tab === 'company-plan' && <CompanyPlan data={live} />}
      {tab === 'reports' && <Reports embedded />}
    </>
  )
}
