import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  COMPANY_EXPENSE_CATEGORIES,
  deleteCompanyExpense,
  listCompanyExpenses,
  openCompanyReceipt,
  saveCompanyExpense,
  setCompanyExpensePaid,
  validateCompanyExpense,
} from '../api/companyExpenses.js'
import { listExpenses, listSites, listSponsors, setExpensePaid } from '../api/exhibitionFile.js'
import { listExhibitions } from '../api/exhibitions.js'
import { listExhibitors } from '../api/exhibitors.js'
import { listPayments } from '../api/payments.js'
import { listStaffExpenses } from '../api/staffExpenses.js'
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
import { useCan } from '../context/AuthContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { DEFAULT_TIERS } from '../lib/constants.js'
import { downloadCsv } from '../lib/csv.js'
import { companyOverview, exhibitionFinancials, monthlyFlow, receivables, sumBy } from '../lib/finance.js'
import { exhibitionLabel, exhibitionTitle, formatOMR, num, percent, todayISO } from '../lib/format.js'
import { useData } from '../lib/useData.js'
import { openWhatsApp, paymentReminderMessage } from '../lib/whatsapp.js'

const TABS = [
  { id: 'overview', label: '📊 نظرة عامة' },
  { id: 'receivables', label: '⏳ المتبقي للتحصيل' },
  { id: 'plan', label: '🏛️ خطة المعارض' },
  { id: 'exhibition-expenses', label: '🧾 مصروفات المعارض' },
  { id: 'company-expenses', label: '🏢 مصروفات الشركة' },
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
  return { exhibitions, exhibitors, payments, sites, expenses, sponsors, companyExpenses, staffExpenses }
}

const today = () => todayISO()
const isOverdue = (x) => !x.paid && x.due_date && x.due_date < today()

// ── 1. Overview ─────────────────────────────────────────────────────────────
function Overview({ o, flow, go }) {
  const rows = [
    ['مصروفات المعارض', o.exhibitionExpenses, o.exhibitionExpensesPaid, 'exhibition-expenses'],
    ['مصروفات الشركة', o.company, o.companyPaid, 'company-expenses'],
    ['مصروفات الموظفين المعتمدة', o.staffClaims, o.staffReimbursed, null],
  ]
  return (
    <>
      <div className="section-label">الإيرادات</div>
      <div className="grid-4 mb-16">
        <StatCard flat label="إجمالي العقود" value={formatOMR(o.contracts)} sub={o.sponsorship ? `+ رعايات ${formatOMR(o.sponsorship)}` : 'قيمة كل المشاركات'} accent="var(--ink)" icon="📋" />
        <StatCard flat label="المحصّل" value={formatOMR(o.collected)} sub={`نسبة التحصيل ${o.collectionRate}%`} accent="var(--suc)" icon="💵" />
        <StatCard flat label="المتبقي للتحصيل" value={formatOMR(o.receivable)} sub="اضغط لعرض من عليه مبالغ" accent="var(--wrn)" icon="⏳" onClick={() => go('receivables')} />
        <StatCard flat label="بانتظار تأكيد الوصول" value={formatOMR(o.awaiting)} sub="دفعات سجلها التسويق" accent="var(--info)" icon="🕓" />
      </div>

      <div className="section-label">المصروفات والنتيجة</div>
      <div className="grid-4 mb-16">
        <StatCard flat label="إجمالي المصروفات" value={formatOMR(o.expensesAll)} sub={`مدفوع ${formatOMR(o.expensesPaidAll)}`} accent="var(--dng)" icon="🧾" />
        <StatCard flat label="مستحق الدفع" value={formatOMR(o.payable)} sub={o.staffOwed ? `منها للموظفين ${formatOMR(o.staffOwed)}` : 'مصروفات لم تُدفع بعد'} accent="var(--wrn)" icon="📌" />
        <StatCard flat label="الصافي حسب العقود" value={formatOMR(o.net)} sub="العقود + الرعايات − كل المصروفات" accent={o.net >= 0 ? 'var(--suc)' : 'var(--dng)'} icon="📈" />
        <StatCard flat label="الرصيد النقدي" value={formatOMR(o.cash)} sub="المحصّل − المدفوع فعلاً" accent={o.cash >= 0 ? 'var(--suc)' : 'var(--dng)'} icon="🏦" />
      </div>

      <div className="grid-2 mb-16">
        <Panel icon="🧾" title="المصروفات حسب النوع">
          <div className="table-wrap">
            <table className="table table-compact">
              <thead>
                <tr>
                  <th>النوع</th>
                  <th>الإجمالي</th>
                  <th>المدفوع</th>
                  <th>المتبقي</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(([label, total, paid, tab]) => (
                  <tr key={label} className={tab ? 'clickable' : ''} onClick={() => tab && go(tab)}>
                    <td className="strong">{tab ? label : <Link to="/expenses">{label}</Link>}</td>
                    <td className="num">{formatOMR(total)}</td>
                    <td className="num text-suc">{formatOMR(paid)}</td>
                    <td className={`num ${total - paid > 0 ? 'text-wrn strong' : 'muted'}`}>{formatOMR(total - paid)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="strong">الإجمالي</td>
                  <td className="num strong">{formatOMR(o.expensesAll)}</td>
                  <td className="num strong">{formatOMR(o.expensesPaidAll)}</td>
                  <td className="num strong">{formatOMR(o.payable)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Panel>

        <Panel icon="📅" title="الحركة الشهرية" subtitle="الداخل (دفعات مؤكدة) والخارج (مصروفات مدفوعة)">
          <div className="table-wrap">
            <table className="table table-compact">
              <thead>
                <tr>
                  <th>الشهر</th>
                  <th>الداخل</th>
                  <th>الخارج</th>
                  <th>الصافي</th>
                </tr>
              </thead>
              <tbody>
                {flow.slice(0, 12).map((m) => (
                  <tr key={m.month}>
                    <td className="strong nowrap">{m.month}</td>
                    <td className="num text-suc">{formatOMR(m.in)}</td>
                    <td className="num text-dng" title={`معارض ${formatOMR(m.exhibitions)} • شركة ${formatOMR(m.company)} • موظفين ${formatOMR(m.staff)}`}>
                      {formatOMR(m.out)}
                    </td>
                    <td className={`num strong ${m.net >= 0 ? 'text-suc' : 'text-dng'}`}>{formatOMR(m.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!flow.length && <div className="empty-inline">لا توجد حركة بعد</div>}
          <div className="muted tiny mt-8">مصروفات المعارض تُحسب في شهر استحقاقها. المبالغ قبل الضريبة.</div>
        </Panel>
      </div>
    </>
  )
}

// ── 2. Receivables ──────────────────────────────────────────────────────────
function Receivables({ data, canRemind }) {
  const [scope, setScope] = useState('all')
  const rows = receivables(data.exhibitors, data.exhibitions).filter((r) => scope === 'all' || r.exhibitor.exhibition_id === scope)
  const total = rows.reduce((t, r) => t + r.remaining, 0)

  const exportCsv = () =>
    downloadCsv(`المتبقي-للتحصيل-${todayISO()}.csv`, rows, [
      { label: 'المشارك', value: (r) => r.exhibitor.brand },
      { label: 'المسؤول', value: (r) => r.exhibitor.manager },
      { label: 'الهاتف', value: (r) => r.exhibitor.phone },
      { label: 'المعرض', value: (r) => exhibitionLabel(r.exhibition) },
      { label: 'العقد', value: (r) => num(r.exhibitor.contract).toFixed(3) },
      { label: 'المدفوع', value: (r) => num(r.exhibitor.paid).toFixed(3) },
      { label: 'المتبقي', value: (r) => r.remaining.toFixed(3) },
    ])

  return (
    <>
    <div className="toolbar">
      <ExhibitionFilter className="toolbar-select" exhibitions={data.exhibitions} value={scope} onChange={setScope} />
      <Button variant="outline" onClick={exportCsv} disabled={!rows.length}>
        ⬇️ تصدير Excel
      </Button>
      <div className="toolbar-count">{rows.length} مشارك</div>
    </div>
    <Panel icon="⏳" title={`المتبقي للتحصيل: ${formatOMR(total)}`} subtitle="من عليه مبلغ متبقٍ من قيمة عقده — الأكبر أولاً • قبل الضريبة">
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              {['المشارك', 'الهاتف', 'المعرض', 'العقد', 'المدفوع', 'المتبقي', 'الحالة', ''].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ exhibitor: e, exhibition, remaining }) => (
              <tr key={e.id}>
                <td>
                  <div className="strong">{e.brand}</div>
                  <div className="muted tiny">{e.manager}</div>
                </td>
                <td className="ltr small">{e.phone || '—'}</td>
                <td className="small">{exhibition ? <Link to={`/exhibitions/${exhibition.id}`}>{exhibitionLabel(exhibition)}</Link> : '—'}</td>
                <td className="num">{formatOMR(e.contract)}</td>
                <td className="num text-suc">{formatOMR(e.paid)}</td>
                <td className="num strong text-dng">{formatOMR(remaining)}</td>
                <td>
                  <StatusBadge status={e.status} />
                </td>
                <td>
                  {canRemind && e.phone && (
                    <Button size="sm" variant="whatsapp" onClick={() => openWhatsApp(e.phone, paymentReminderMessage(e, exhibition))} title="تذكير بالدفع عبر واتساب">
                      📱 تذكير
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && <EmptyState icon="✅" text="لا توجد مبالغ متبقية" />}
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
        },
        DEFAULT_TIERS,
      ),
    }))
  const sum = (key) => rows.reduce((t, r) => t + num(r.f[key]), 0)

  return (
    <Panel icon="🏛️" title="خطة المعارض" subtitle="كل معرض: الإشغال، الإيراد المتوقع، المحصّل، المصروفات، والصافي — مرتبة حسب التاريخ">
      <div className="table-wrap">
        <table className="table table-compact" style={{ minWidth: 1050 }}>
          <thead>
            <tr>
              {['المعرض', 'التاريخ', 'الحالة', 'المواقع', 'الإيراد المتوقع', 'العقود', 'المحصّل / المتبقي', 'المصروفات', 'الصافي', 'التعادل'].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ ex, f }) => (
              <tr key={ex.id} className={ex.status === 'قادم' || ex.status === 'جاري' ? 'row-highlight' : ''}>
                <td className="strong plan-name">
                  <Link to={`/exhibitions/${ex.id}`}>{exhibitionTitle(ex)}</Link>
                  <div className="muted tiny">{ex.mall}</div>
                </td>
                <td className="small nowrap">
                  {ex.date_from}
                  <div className="muted tiny">إلى {ex.date_to}</div>
                </td>
                <td>
                  <StatusBadge status={ex.status} />
                </td>
                <td className="small nowrap">
                  {f.booked}/{f.capacity} <span className="muted">({f.occupancy}%)</span>
                </td>
                <td className="num">{formatOMR(f.fullRevenue)}</td>
                <td className="num">{formatOMR(f.contract)}</td>
                <td className="num">
                  <span className="text-suc">{formatOMR(f.collected)}</span>
                  {f.outstanding > 0 && <div className="tiny text-wrn">متبقي {formatOMR(f.outstanding)}</div>}
                </td>
                <td className="num text-dng">{formatOMR(f.expensesTotal)}</td>
                <td className={`num strong ${f.netOnContracts >= 0 ? 'text-suc' : 'text-dng'}`}>
                  {formatOMR(f.netOnContracts)}
                  {f.sponsorship > 0 && <div className="tiny muted">منها رعايات {formatOMR(f.sponsorship)}</div>}
                </td>
                <td className="small nowrap">
                  {f.expensesTotal && f.capacity ? (
                    <span className={f.booked >= f.breakEven ? 'text-suc' : 'text-wrn'}>
                      {f.breakEven} موقع {f.booked >= f.breakEven ? '✓' : `(باقي ${f.breakEven - f.booked})`}
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
                  الإجمالي ({rows.length} معرض)
                </td>
                <td className="num strong">{formatOMR(sum('fullRevenue'))}</td>
                <td className="num strong">{formatOMR(sum('contract'))}</td>
                <td className="num strong">
                  {formatOMR(sum('collected'))}
                  <div className="tiny text-wrn">متبقي {formatOMR(sum('outstanding'))}</div>
                </td>
                <td className="num strong">{formatOMR(sum('expensesTotal'))}</td>
                <td className="num strong">{formatOMR(sum('netOnContracts'))}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {!rows.length && <EmptyState icon="🏛️" text="لا توجد معارض بعد" />}
      <div className="muted tiny mt-8">الصافي = العقود + الرعايات − مصروفات المعرض. الإيراد المتوقع = بيع كل المواقع. المعارض الملغاة غير معروضة.</div>
    </Panel>
  )
}

// ── 4. Exhibition expenses (all exhibitions) ────────────────────────────────
function ExhibitionExpenses({ data, canManage, reload }) {
  const toast = useToast()
  const [scope, setScope] = useState('all')
  const [state, setState] = useState('')
  const exhibitionOf = (id) => data.exhibitions.find((x) => x.id === id)
  const rows = data.expenses
    .filter((x) => (scope === 'all' || x.exhibition_id === scope) && (!state || (state === 'paid' ? x.paid : !x.paid)))
    .sort((a, b) => String(a.due_date || '9999').localeCompare(String(b.due_date || '9999')))
  const total = sumBy(rows, 'amount')
  const unpaid = sumBy(rows.filter((x) => !x.paid), 'amount')

  const toggle = async (x) => {
    try {
      await setExpensePaid(x.id, !x.paid)
      reload()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  return (
    <>
    <div className="toolbar">
      <ExhibitionFilter className="toolbar-select" exhibitions={data.exhibitions} value={scope} onChange={setScope} />
      <select className="input toolbar-select" value={state} onChange={(e) => setState(e.target.value)} aria-label="الحالة">
        <option value="">كل الحالات</option>
        <option value="unpaid">غير مدفوع</option>
        <option value="paid">مدفوع</option>
      </select>
      <div className="toolbar-count">{rows.length} بند</div>
    </div>
    <Panel icon="🧾" title={`مصروفات المعارض: ${formatOMR(total)}`} subtitle={`غير مدفوع ${formatOMR(unpaid)} • الإضافة والتعديل من ملف كل معرض`}>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              {['البند', 'المعرض', 'التصنيف', 'المبلغ', 'الاستحقاق', 'الحالة'].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((x) => (
              <tr key={x.id}>
                <td className="strong">{x.item}</td>
                <td className="small">
                  <Link to={`/exhibitions/${x.exhibition_id}`}>{exhibitionLabel(exhibitionOf(x.exhibition_id))}</Link>
                </td>
                <td className="small">{x.category || '—'}</td>
                <td className="num strong">{formatOMR(x.amount)}</td>
                <td className={`small nowrap ${isOverdue(x) ? 'text-dng strong' : ''}`}>
                  {x.due_date || '—'}
                  {isOverdue(x) && <div className="tiny">متأخر</div>}
                </td>
                <td>
                  <button className={`paid-toggle ${x.paid ? 'on' : ''}`} onClick={() => canManage && toggle(x)} disabled={!canManage}>
                    {x.paid ? '✓ مدفوع' : 'غير مدفوع'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && <EmptyState icon="🧾" text="لا توجد مصروفات" />}
    </Panel>
    </>
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
    if (errors.length) return toast(`أكمل: ${errors.join('، ')}`, 'error')
    setSaving(true)
    try {
      await saveCompanyExpense(form, { id: expense?.id, receiptFile: file, oldReceipt: expense?.receipt_path })
      toast(editing ? '✅ تم التعديل' : '✅ تمت إضافة المصروف')
      onSaved()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={editing ? 'تعديل مصروف الشركة' : 'إضافة مصروف للشركة'}
      subtitle="مصروف عام غير مرتبط بمعرض واحد (إيجار، رواتب، رسوم…)"
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            إلغاء
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? 'جاري...' : 'حفظ'}
          </Button>
        </>
      }
    >
      <Field label="البيان" required>
        <input className="input" placeholder="مثال: إيجار المكتب — أكتوبر" value={form.description || ''} onChange={set('description')} />
      </Field>
      <div className="form-grid">
        <Field label="المبلغ (ر.ع)" required>
          <input className="input" type="number" min="0" step="0.001" placeholder="0.000" value={form.amount ?? ''} onChange={set('amount')} />
        </Field>
        <Field label="التاريخ" required>
          <DateInput value={form.date || ''} onChange={set('date')} />
        </Field>
        <Field label="التصنيف">
          <input className="input" list="company-expense-categories" value={form.category || ''} onChange={set('category')} />
          <datalist id="company-expense-categories">
            {COMPANY_EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field label="الحالة">
          <select className="input" value={form.paid === false ? 'no' : 'yes'} onChange={(e) => setForm((f) => ({ ...f, paid: e.target.value === 'yes' }))}>
            <option value="yes">مدفوع</option>
            <option value="no">غير مدفوع (مستحق)</option>
          </select>
        </Field>
        {form.paid === false && (
          <Field label="تاريخ الاستحقاق">
            <DateInput value={form.due_date || ''} onChange={set('due_date')} />
          </Field>
        )}
      </div>
      <Field label="ملاحظات">
        <input className="input" value={form.notes || ''} onChange={set('notes')} />
      </Field>
      <Field label="الفاتورة (اختياري)">
        <div className="row-actions">
          <label className="btn btn-outline btn-sm file-pick">
            {file || expense?.receipt_path ? '🔄 تغيير الفاتورة' : '📎 إرفاق فاتورة'}
            <input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={choose} hidden />
          </label>
          <span className="muted small">{file ? `✓ ${file.name}` : expense?.receipt_path ? '✓ مرفقة' : 'بدون فاتورة'}</span>
        </div>
      </Field>
    </Modal>
  )
}

function CompanyExpenses({ data, canManage, reload }) {
  const toast = useToast()
  const [editing, setEditing] = useState(null)
  const [category, setCategory] = useState('')
  const [month, setMonth] = useState('')
  const all = data.companyExpenses
  const months = [...new Set(all.map((x) => String(x.date).slice(0, 7)))].sort().reverse()
  const categories = [...new Set([...COMPANY_EXPENSE_CATEGORIES, ...all.map((x) => x.category)])]
  const rows = all.filter((x) => (!category || x.category === category) && (!month || String(x.date).startsWith(month)))
  const total = sumBy(rows, 'amount')
  const byCategory = Object.entries(rows.reduce((acc, x) => ({ ...acc, [x.category]: (acc[x.category] || 0) + num(x.amount) }), {})).sort((a, b) => b[1] - a[1])

  const act = async (fn, ok) => {
    try {
      await fn()
      if (ok) toast(ok)
      reload()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  const exportCsv = () =>
    downloadCsv(`مصروفات-الشركة-${todayISO()}.csv`, rows, [
      { label: 'التاريخ', value: (x) => x.date },
      { label: 'البيان', value: (x) => x.description },
      { label: 'التصنيف', value: (x) => x.category },
      { label: 'المبلغ', value: (x) => num(x.amount).toFixed(3) },
      { label: 'الحالة', value: (x) => (x.paid ? 'مدفوع' : 'غير مدفوع') },
      { label: 'الاستحقاق', value: (x) => x.due_date || '' },
      { label: 'ملاحظات', value: (x) => x.notes },
      { label: 'فاتورة مرفقة', value: (x) => (x.receipt_path ? 'نعم' : 'لا') },
    ])

  return (
    <>
      <div className="toolbar">
        <select className="input toolbar-select" value={month} onChange={(e) => setMonth(e.target.value)} aria-label="الشهر">
          <option value="">كل الأشهر</option>
          {months.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <select className="input toolbar-select" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="التصنيف">
          <option value="">كل التصنيفات</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <Button variant="outline" onClick={exportCsv} disabled={!rows.length}>
          ⬇️ تصدير Excel
        </Button>
        {canManage && <Button onClick={() => setEditing({})}>+ إضافة مصروف للشركة</Button>}
        <div className="toolbar-count">{rows.length} بند</div>
      </div>

      {byCategory.length > 0 && (
        <div className="category-strip mb-16">
          {byCategory.map(([name, amount]) => (
            <button key={name} type="button" className={`category-chip ${category === name ? 'selected' : ''}`} onClick={() => setCategory(category === name ? '' : name)}>
              <span>{name}</span>
              <strong>{formatOMR(amount)}</strong>
              <span className="muted tiny">{percent(amount, total)}%</span>
            </button>
          ))}
        </div>
      )}

      <Panel
        icon="🏢"
        title={`مصروفات الشركة: ${formatOMR(total)}`}
        subtitle={`مصروفات عامة غير مرتبطة بمعرض (إيجار، رواتب، رسوم…) • غير مدفوع ${formatOMR(sumBy(rows.filter((x) => !x.paid), 'amount'))}`}
        className="mb-16"
      >
          <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                {['التاريخ', 'البيان', 'التصنيف', 'المبلغ', 'الحالة', 'الفاتورة', ''].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((x) => (
                <tr key={x.id}>
                  <td className="small nowrap">{x.date}</td>
                  <td>
                    <div className="strong">{x.description}</div>
                    {x.notes && <div className="muted tiny">{x.notes}</div>}
                  </td>
                  <td>
                    <Chip>{x.category}</Chip>
                  </td>
                  <td className="num strong">{formatOMR(x.amount)}</td>
                  <td>
                    <button className={`paid-toggle ${x.paid ? 'on' : ''}`} onClick={() => canManage && act(() => setCompanyExpensePaid(x.id, !x.paid))} disabled={!canManage}>
                      {x.paid ? '✓ مدفوع' : 'غير مدفوع'}
                    </button>
                    {isOverdue(x) && <div className="tiny text-dng strong">متأخر — {x.due_date}</div>}
                  </td>
                  <td>
                    {x.receipt_path ? (
                      <Button size="sm" variant="outline" onClick={() => openCompanyReceipt(x.receipt_path).catch((err) => toast(err.message, 'error'))}>
                        📎 عرض
                      </Button>
                    ) : (
                      <span className="muted tiny">—</span>
                    )}
                  </td>
                  <td>
                    {canManage && (
                      <div className="row-actions">
                        <Button size="sm" variant="outline" onClick={() => setEditing(x)} title="تعديل">
                          ✏️
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          title="حذف"
                          onClick={() => confirm(`حذف "${x.description}"؟`) && act(() => deleteCompanyExpense(x), '🗑️ تم الحذف')}
                        >
                          🗑️
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && <EmptyState icon="🏢" text={all.length ? 'لا توجد نتائج لهذا الفلتر' : 'لا توجد مصروفات عامة بعد — مثل إيجار المكتب والرواتب والرسوم'} />}
      </Panel>

      {editing && (
        <CompanyExpenseForm
          expense={editing.id ? editing : null}
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

export default function Finance() {
  const { data, loading, reload } = useData(load, null)
  const [tab, setTab] = useState('overview')
  const canManage = useCan('payments.write') // admin + finance; the viewer only reads
  const canRemind = useCan('data.write')

  if (loading) return <Loading />
  if (!data) return <EmptyState icon="💼" text="تعذّر تحميل البيانات المالية" />

  const o = companyOverview(data)
  const flow = monthlyFlow(data)

  return (
    <>
      <PageHeader title="المالية 💼" subtitle="كل أموال الشركة في مكان واحد: الإيرادات والتحصيل، المتبقي، خطة المعارض، ومصروفات المعارض والشركة" />

      <div className="tabs tabs-underline mb-16">
        {TABS.map((t) => (
          <button key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && <Overview o={o} flow={flow} go={setTab} />}
      {tab === 'receivables' && <Receivables data={data} canRemind={canRemind} />}
      {tab === 'plan' && <Plan data={data} />}
      {tab === 'exhibition-expenses' && <ExhibitionExpenses data={data} canManage={canManage} reload={reload} />}
      {tab === 'company-expenses' && <CompanyExpenses data={data} canManage={canManage} reload={reload} />}
    </>
  )
}
