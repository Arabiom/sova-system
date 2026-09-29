import { useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import {
  COMPANY_EXPENSE_CATEGORIES,
  deleteCompanyExpense,
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
import { listStaff } from '../api/staff.js'
import { listStaffExpenses, openReceipt } from '../api/staffExpenses.js'
import { checkFile } from '../api/storage.js'
import Button from '../components/Button.jsx'
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
import { DEFAULT_TIERS } from '../lib/constants.js'
import { downloadCsv } from '../lib/csv.js'
import { allExpenses, collectionAlerts, companyOverview, daysBetween, exhibitionFinancials, EXPENSE_KINDS, isConfirmed, ledger, monthlyFlow, paymentDeadline, receivables, sumBy, vatEnabled } from '../lib/finance.js'
import { exhibitionLabel, exhibitionTitle, formatDate, formatOMR, num, percent, todayISO } from '../lib/format.js'
import { useData } from '../lib/useData.js'
import { openWhatsApp, paymentReminderMessage } from '../lib/whatsapp.js'
import { tr } from '../lib/i18n.js'
import Expenses, { ExpenseForm as StaffExpenseForm } from './Expenses.jsx'
import { ExpenseForm as ExhibitionExpenseForm } from './exhibition/ExpensesTab.jsx'
import Reports from './Reports.jsx'
import Sales from './Sales.jsx'
import { omanDay } from '../lib/team.js'

const TABS = [
  { id: 'overview', label: tr('📊 نظرة عامة') },
  { id: 'income', label: tr('💵 الإيرادات والدفعات') },
  { id: 'receivables', label: tr('⏳ المتبقي للتحصيل') },
  { id: 'expenses', label: tr('🧾 كل المصروفات') },
  { id: 'claims', label: tr('👥 مطالبات الموظفين') },
  { id: 'exhibitions', label: tr('🏛️ حسب المعرض') },
  { id: 'ledger', label: tr('📒 سجل الحركات') },
  { id: 'reports', label: tr('📈 التقارير') },
]

const load = async () => {
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
  const staff = await listStaff().catch(() => [])
  return { exhibitions, exhibitors, payments, sites, expenses, sponsors, companyExpenses, staffExpenses, staff }
}

const today = () => todayISO()

// ── 1. Overview ─────────────────────────────────────────────────────────────
function Overview({ o, flow, go }) {
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

      <div className="section-label">{tr('المصروفات والنتيجة')}</div>
      <div className="grid-4 mb-16">
        <StatCard flat label={tr('إجمالي المصروفات')} value={formatOMR(o.expensesAll)} sub={tr('مدفوع {0}', [formatOMR(o.expensesPaidAll)])} accent="var(--dng)" icon="🧾" onClick={() => go('expenses')} />
        <StatCard flat label={tr('مستحق الدفع')} value={formatOMR(o.payable)} sub={o.staffOwed ? tr('منها للموظفين {0}', [formatOMR(o.staffOwed)]) : tr('مصروفات لم تُدفع بعد')} accent="var(--wrn)" icon="📌" />
        <StatCard flat label={tr('الصافي حسب العقود')} value={formatOMR(o.net)} sub={tr('العقود + الرعايات − كل المصروفات')} accent={o.net >= 0 ? 'var(--suc)' : 'var(--dng)'} icon="📈" />
        <StatCard flat label={tr('الرصيد النقدي')} value={formatOMR(o.cash)} sub={tr('المحصّل − المدفوع فعلاً')} accent={o.cash >= 0 ? 'var(--suc)' : 'var(--dng)'} icon="🏦" onClick={() => go('ledger')} />
      </div>

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
        <table className="table">
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
  const sum = (key) => rows.reduce((t, r) => t + num(r.f[key]), 0)

  return (
    <Panel icon="🏛️" title={tr('خطة المعارض')} subtitle={tr('كل معرض: الإشغال، الإيراد المتوقع، المحصّل، المصروفات، والصافي — مرتبة حسب التاريخ')}>
      <div className="table-wrap">
        <table className="table table-compact" style={{ minWidth: 1050 }}>
          <thead>
            <tr>
              {[tr('المعرض'), tr('التاريخ'), tr('الحالة'), tr('المواقع'), tr('الإيراد المتوقع'), tr('العقود'), tr('المحصّل / المتبقي'), tr('المصروفات'), tr('الصافي'), tr('التعادل')].map((h) => (
                <th key={h}>{tr(h)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ ex, f }) => (
              <tr key={ex.id} className={ex.status === 'قادم' || ex.status === 'جاري' ? 'row-highlight' : ''}>
                <td className="strong plan-name">
                  <Link to={`/exhibitions/${ex.id}`}>{exhibitionTitle(ex)}</Link>
                  <div className="muted tiny">{tr(ex.mall)}</div>
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
                <td className="num">{formatOMR(f.fullRevenue)}</td>
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
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr>
                <td className="strong" colSpan={4}>
                  {tr('الإجمالي (')}{rows.length}{' '}{tr('معرض)')}
                </td>
                <td className="num strong">{formatOMR(sum('fullRevenue'))}</td>
                <td className="num strong">{formatOMR(sum('contract'))}</td>
                <td className="num strong">
                  {formatOMR(sum('collected'))}
                  <div className="tiny text-wrn">{tr('متبقي')}{' '}{formatOMR(sum('outstanding'))}</div>
                </td>
                <td className="num strong">{formatOMR(sum('expensesTotal'))}</td>
                <td className="num strong">{formatOMR(sum('netOnContracts'))}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {!rows.length && <EmptyState icon="🏛️" text={tr('لا توجد معارض بعد')} />}
      <div className="muted tiny mt-8">{tr('الصافي = العقود + الرعايات − مصروفات المعرض (ومنها مطالبات الموظفين المعتمدة له). الإيراد المتوقع = بيع كل المواقع. المعارض الملغاة غير معروضة.')}</div>
    </Panel>
  )
}

// ── 5. Company expenses ─────────────────────────────────────────────────────
function CompanyExpenseForm({ expense, onClose, onSaved }) {
  const toast = useToast()
  const editing = Boolean(expense?.id)
  const [form, setForm] = useState(expense || { date: todayISO(), category: COMPANY_EXPENSE_CATEGORIES[0], paid: true })
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
          <input className="input" list="company-expense-categories" value={form.category || ''} onChange={set('category')} />
          <datalist id="company-expense-categories">
            {COMPANY_EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field label={tr('الحالة')}>
          <select className="input" value={form.paid === false ? 'no' : 'yes'} onChange={(e) => setForm((f) => ({ ...f, paid: e.target.value === 'yes' }))}>
            <option value="yes">{tr('مدفوع')}</option>
            <option value="no">{tr('غير مدفوع (مستحق)')}</option>
          </select>
        </Field>
        {form.paid === false && (
          <Field label={tr('تاريخ الاستحقاق')}>
            <DateInput value={form.due_date || ''} onChange={set('due_date')} />
          </Field>
        )}
      </div>
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
const KIND_ICON = { exhibition: '🏛️', company: '🏢', claim: '👥' }

function AllExpenses({ data, canManage, reload, go, initialKind = '' }) {
  const toast = useToast()
  const userId = useAuth().session?.user?.id
  const [filters, setFilters] = useState({ kind: initialKind, exhibition: 'all', month: '', state: '', category: '' })
  const [adding, setAdding] = useState(null) // 'exhibition' | 'company' | 'claim'
  const [editing, setEditing] = useState(null) // an allExpenses() row
  const setFilter = (key) => (e) => setFilters((f) => ({ ...f, [key]: e?.target ? e.target.value : e }))

  const all = allExpenses(data)
  const exhibitionOf = (id) => data.exhibitions.find((x) => x.id === id)
  const nameOf = (id) => {
    const s = data.staff.find((x) => x.user_id === id)
    return s?.name || s?.email || ''
  }
  const months = [...new Set(all.map((x) => String(x.date || '').slice(0, 7)).filter(Boolean))].sort().reverse()
  const base = all.filter(
    (x) =>
      (filters.exhibition === 'all' || (filters.exhibition === 'general' ? !x.exhibition_id : x.exhibition_id === filters.exhibition)) &&
      (!filters.month || String(x.date || '').startsWith(filters.month)) &&
      (!filters.state || (filters.state === 'review' ? !x.counted : x.counted && (filters.state === 'paid') === x.paid)) &&
      (!filters.category || x.category === filters.category),
  )
  const rows = base.filter((x) => !filters.kind || x.kind === filters.kind)
  const counted = rows.filter((x) => x.counted)
  const total = sumBy(counted, 'amount')
  const unpaid = sumBy(counted.filter((x) => !x.paid), 'amount')
  const review = rows.filter((x) => !x.counted)
  const kindTotal = (kind) => sumBy(base.filter((x) => x.kind === kind && x.counted), 'amount')
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
            <span>{tr(label)}</span>
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
        subtitle={tr('غير مدفوع {0}', [formatOMR(unpaid)]) + (review.length ? tr(' • {0} مطالبة بانتظار المراجعة ({1}) — لا تُحسب حتى تُعتمد', [review.length, formatOMR(sumBy(review, 'amount'))]) : '')}
      >
        <div className="table-wrap">
          <table className="table" style={{ minWidth: 980 }}>
            <thead>
              <tr>
                {[tr('التاريخ'), tr('البيان'), tr('النوع'), tr('المعرض'), tr('التصنيف'), tr('المبلغ'), tr('الحالة'), tr('الفاتورة'), ''].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((x) => (
                <tr key={x.key} className={x.counted ? '' : 'row-muted'}>
                  <td className="small nowrap">{x.date || '—'}</td>
                  <td>
                    <div className="strong">{tr(x.description)}</div>
                    {(x.user_id || x.notes) && <div className="muted tiny">{[x.user_id && nameOf(x.user_id), x.notes].filter(Boolean).join(' • ')}</div>}
                  </td>
                  <td className="small nowrap">
                    {KIND_ICON[x.kind]} {tr(EXPENSE_KINDS[x.kind])}
                  </td>
                  <td className="small">{x.exhibition_id ? <Link to={`/exhibitions/${x.exhibition_id}`}>{exhibitionLabel(exhibitionOf(x.exhibition_id))}</Link> : <span className="muted">{tr('عام')}</span>}</td>
                  <td>{x.category ? <Chip>{tr(x.category)}</Chip> : '—'}</td>
                  <td className="num strong">{formatOMR(x.amount)}</td>
                  <td>
                    {x.kind === 'claim' ? (
                      <StatusBadge status={x.status} />
                    ) : (
                      <button className={`paid-toggle ${x.paid ? 'on' : ''}`} onClick={() => canManage && togglePaid(x)} disabled={!canManage}>
                        {x.paid ? tr('✓ مدفوع') : tr('غير مدفوع')}
                      </button>
                    )}
                    {!x.paid && x.kind === 'company' && x.due_date && x.due_date < today() && <div className="tiny text-dng strong">{tr('متأخر —')}{' '}{x.due_date}</div>}
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
                    {x.kind === 'claim' ? (
                      <Button size="sm" variant="ghost" onClick={() => go('claims')} title={tr('الاعتماد والتعويض من تبويب المطالبات')}>
                        {tr('مراجعة ↗')}
                      </Button>
                    ) : (
                      canManage && (
                        <div className="row-actions">
                          <Button size="sm" variant="outline" onClick={() => setEditing(x)} title={tr('تعديل')}>
                            ✏️
                          </Button>
                          <Button size="sm" variant="danger" onClick={() => remove(x)} title={tr('حذف')}>
                            🗑️
                          </Button>
                        </div>
                      )
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
      {(adding === 'company' || editing?.kind === 'company') && <CompanyExpenseForm expense={editing?.source || null} onClose={() => (setAdding(null), setEditing(null))} onSaved={saved} />}
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
          <table className="table table-compact" style={{ minWidth: 860 }}>
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
  const dueOf = (x) => (x.kind === 'company' ? x.due_date : x.source.due_date) || ''
  const overdue = allExpenses(data).filter((x) => x.kind !== 'claim' && !x.paid && dueOf(x) && dueOf(x) < day)
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
          {x.text} — {tr('اضغط للعرض')}
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

  const o = companyOverview(data)
  const flow = monthlyFlow(data)

  return (
    <>
      <PageHeader title={tr('المالية 💼')} subtitle={tr('كل أموال الشركة في مكان واحد: الإيرادات والدفعات، المتبقي، كل المصروفات والفواتير، مطالبات الموظفين، والتقارير')} />

      <div className="tabs tabs-underline tabs-scroll mb-16">
        {TABS.map((t) => (
          <button key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => go(t.id)}>
            {tr(t.label)}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <>
          <Attention data={data} o={o} go={go} today={omanDay()} />
          <Overview o={o} flow={flow} go={go} />
        </>
      )}
      {tab === 'income' && <Sales embedded onChanged={reload} />}
      {tab === 'receivables' && <Receivables key={focus.exhibition} data={data} canRemind={canRemind} initialScope={focus.exhibition} />}
      {tab === 'expenses' && <AllExpenses data={data} canManage={canManage} reload={reload} go={go} initialKind={focus.kind || ''} key={focus.kind || ''} />}
      {tab === 'claims' && <Expenses embedded onChanged={reload} />}
      {tab === 'exhibitions' && <Plan data={data} />}
      {tab === 'ledger' && <Ledger data={data} />}
      {tab === 'reports' && <Reports embedded />}
    </>
  )
}
