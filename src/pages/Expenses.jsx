import { useMemo, useState } from 'react'
import { listExhibitions } from '../api/exhibitions.js'
import { listStaff } from '../api/staff.js'
import {
  deleteStaffExpense,
  EXPENSE_APPROVED,
  EXPENSE_PENDING,
  EXPENSE_REIMBURSED,
  EXPENSE_REJECTED,
  EXPENSE_STATUSES,
  expenseTotals,
  listStaffExpenses,
  openReceipt,
  reviewStaffExpense,
  saveStaffExpense,
  STAFF_EXPENSE_CATEGORIES,
  validateStaffExpense,
} from '../api/staffExpenses.js'
import { checkFile, FILE_MAX_MB } from '../api/storage.js'
import Button from '../components/Button.jsx'
import DateInput from '../components/DateInput.jsx'
import ExhibitionFilter from '../components/ExhibitionFilter.jsx'
import { EmptyState, Loading } from '../components/Feedback.jsx'
import Field, { SelectOptions } from '../components/Field.jsx'
import Modal from '../components/Modal.jsx'
import PageHeader from '../components/PageHeader.jsx'
import Panel from '../components/Panel.jsx'
import StatCard from '../components/StatCard.jsx'
import StatusBadge, { Chip } from '../components/StatusBadge.jsx'
import { useAuth, useCan } from '../context/AuthContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { downloadCsv } from '../lib/csv.js'
import { exhibitionLabel, formatOMR, num, todayISO } from '../lib/format.js'
import { useData } from '../lib/useData.js'
import { tr } from '../lib/i18n.js'

const PAY_METHODS = ['نقد', 'بطاقة بنكية', 'تحويل بنكي', 'أخرى']

const load = async (reviewer) => {
  const [expenses, exhibitions, staff] = await Promise.all([
    listStaffExpenses(),
    listExhibitions(),
    reviewer ? listStaff().catch(() => []) : Promise.resolve([]),
  ])
  return { expenses, exhibitions, staff }
}

export function ExpenseForm({ expense, exhibitions, userId, onClose, onSaved }) {
  const toast = useToast()
  const editing = Boolean(expense?.id)
  const [form, setForm] = useState(expense || { date: todayISO(), payment_method: 'نقد' })
  const [file, setFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const choose = (e) => {
    const chosen = e.target.files?.[0]
    e.target.value = ''
    if (!chosen) return
    const problem = checkFile(chosen, 'الإيصال')
    if (problem) return toast(problem, 'error')
    setFile(chosen)
  }

  const submit = async () => {
    const errors = validateStaffExpense(form, { hasReceipt: Boolean(file || expense?.receipt_path) })
    if (errors.length) return toast(tr('أكمل: {0}', [errors.map((x) => tr(x)).join(tr('، '))]), 'error')
    setSaving(true)
    try {
      await saveStaffExpense(form, { userId, receiptFile: file, id: expense?.id, oldReceipt: expense?.receipt_path })
      toast(editing ? tr('✅ تم تعديل المصروف') : tr('✅ تم رفع المصروف — بانتظار المراجعة'))
      onSaved()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={editing ? tr('تعديل مصروف') : tr('إضافة مصروف')}
      subtitle={tr('كل مبلغ دفعته من أجل الشركة، مع صورة الفاتورة أو الإيصال')}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {tr('إلغاء')}
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? tr('جاري الرفع...') : editing ? tr('حفظ التعديل') : tr('رفع المصروف')}
          </Button>
        </>
      }
    >
      <div className="form-grid">
        <Field label={tr('المبلغ (ر.ع)')} required>
          <input className="input" type="number" min="0" step="0.001" placeholder="0.000" value={form.amount ?? ''} onChange={set('amount')} />
        </Field>
        <Field label={tr('التاريخ')} required>
          <DateInput value={form.date || ''} onChange={set('date')} />
        </Field>
      </div>
      <Field label={tr('وصف المصروف')} required>
        <input className="input" placeholder={tr('مثال: طباعة بنرات معرض نزوى')} value={form.description || ''} onChange={set('description')} />
      </Field>
      <div className="form-grid">
        <Field label={tr('التصنيف')}>
          <input className="input" list="staff-expense-categories" value={form.category || ''} onChange={set('category')} />
          <datalist id="staff-expense-categories">
            {STAFF_EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field label={tr('الجهة / المحل')}>
          <input className="input" placeholder={tr('مثال: مطبعة النهضة')} value={form.vendor || ''} onChange={set('vendor')} />
        </Field>
        <Field label={tr('طريقة الدفع')}>
          <SelectOptions options={PAY_METHODS} placeholder={null} value={form.payment_method || 'نقد'} onChange={set('payment_method')} />
        </Field>
        <Field label={tr('المعرض (إن وجد)')}>
          <select className="input" value={form.exhibition_id || ''} onChange={set('exhibition_id')}>
            <option value="">{tr('— مصروف عام للشركة —')}</option>
            {exhibitions.map((ex) => (
              <option key={ex.id} value={ex.id}>
                {exhibitionLabel(ex)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label={tr('صورة الفاتورة أو الإيصال')} required hint={tr('صورة (PNG أو JPG) أو PDF، حتى {0} ميجابايت. يمكنك تصويرها بالجوال مباشرة.', [FILE_MAX_MB])}>
        <div className="row-actions">
          <label className="btn btn-outline btn-sm file-pick">
            {file || expense?.receipt_path ? tr('🔄 تغيير الإيصال') : tr('📎 إرفاق الإيصال')}
            <input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={choose} hidden />
          </label>
          <span className="muted small">{file ? `✓ ${file.name}` : expense?.receipt_path ? tr('✓ مرفق') : tr('لم يُرفق بعد')}</span>
        </div>
      </Field>
    </Modal>
  )
}

export default function Expenses({ embedded = false, onChanged } = {}) {
  const toast = useToast()
  const { session } = useAuth()
  const userId = session?.user?.id
  const reviewer = useCan('expenses.review') // admin + finance (the accountant) approve / reject / reimburse
  const seeAll = useCan('records.viewAll') // …and, with the viewer, see everyone's expenses
  const canWrite = useCan('data.write') // the viewer only looks
  const { data, loading, reload: reloadOwn } = useData(() => load(seeAll), null)
  // Inside the finance centre, the centre's own totals are refreshed too.
  const reload = () => {
    reloadOwn()
    onChanged?.()
  }
  const [editing, setEditing] = useState(null)
  const [filters, setFilters] = useState({ person: '', status: '', month: '', exhibition: 'all' })
  const [busy, setBusy] = useState(null)

  const expenses = useMemo(() => data?.expenses || [], [data])
  if (loading) return <Loading />
  if (!data) return <EmptyState icon="🧾" text={tr('تعذّر تحميل المصروفات. إذا ظهرت رسالة «جدول غير موجود» فشغّل ملف التحديث 008 في Supabase ثم حدّث الصفحة.')} />
  const { exhibitions, staff } = data

  const nameOf = (id) => {
    if (id === userId) return tr('أنا')
    const s = staff.find((x) => x.user_id === id)
    return s?.name || s?.email || '—'
  }
  const exhibitionOf = (id) => exhibitions.find((ex) => ex.id === id)
  const months = [...new Set(expenses.map((x) => String(x.date).slice(0, 7)))].sort().reverse()
  const people = [...new Set(expenses.map((x) => x.user_id))]

  const visible = expenses.filter(
    (x) =>
      (!filters.person || x.user_id === filters.person) &&
      (!filters.status || x.status === filters.status) &&
      (!filters.month || String(x.date).startsWith(filters.month)) &&
      (filters.exhibition === 'all' || x.exhibition_id === filters.exhibition),
  )
  const totals = expenseTotals(visible)
  const setFilter = (key) => (e) => setFilters((f) => ({ ...f, [key]: e?.target ? e.target.value : e }))

  const act = async (x, status) => {
    let note = ''
    if (status === EXPENSE_REJECTED) {
      note = prompt(tr('سبب الرفض (يظهر للموظف):'), '') ?? null
      if (note === null) return
    }
    setBusy(x.id)
    try {
      await reviewStaffExpense(x.id, status, { reviewerId: userId, note })
      toast(`✅ ${status}`)
      reload()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setBusy(null)
    }
  }

  const remove = async (x) => {
    if (!confirm(tr('حذف المصروف "{0}" وإيصاله؟', [x.description]))) return
    try {
      await deleteStaffExpense(x)
      toast(tr('🗑️ تم الحذف'))
      reload()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  const viewReceipt = (x) => openReceipt(x.receipt_path).catch((err) => toast(err.message, 'error'))

  const exportCsv = () =>
    downloadCsv(`مصروفات-الموظفين-${todayISO()}.csv`, visible, [
      { label: tr('التاريخ'), value: (x) => x.date },
      { label: tr('الموظف'), value: (x) => nameOf(x.user_id) },
      { label: tr('الوصف'), value: (x) => x.description },
      { label: tr('التصنيف'), value: (x) => x.category },
      { label: tr('الجهة'), value: (x) => x.vendor },
      { label: tr('طريقة الدفع'), value: (x) => x.payment_method },
      { label: tr('المعرض'), value: (x) => (x.exhibition_id ? exhibitionLabel(exhibitionOf(x.exhibition_id)) : 'عام') },
      { label: tr('المبلغ'), value: (x) => num(x.amount).toFixed(3) },
      { label: tr('الحالة'), value: (x) => x.status },
      { label: tr('ملاحظة المراجعة'), value: (x) => x.review_note },
      { label: tr('إيصال مرفق'), value: (x) => (x.receipt_path ? 'نعم' : 'لا') },
    ])

  return (
    <>
      <PageHeader embedded={embedded}
        title={seeAll ? tr('مصروفات الموظفين') : tr('مصروفاتي')}
        subtitle={seeAll ? tr('كل ما صرفه الموظفون من أجل الشركة مع فواتيره — للمراجعة والاعتماد') : tr('سجّل كل مبلغ تصرفه من أجل الشركة وأرفق فاتورته')}
      >
        {seeAll && (
          <Button variant="outline" onClick={exportCsv} disabled={!visible.length}>
            {tr('⬇️ تصدير Excel')}
          </Button>
        )}
        {canWrite && <Button onClick={() => setEditing({})}>{tr('+ إضافة مصروف')}</Button>}
      </PageHeader>

      <div className="grid-4 mb-16">
        <StatCard flat label={tr('الإجمالي')} value={formatOMR(totals.all)} sub={tr('{0} مصروف', [visible.length])} accent="var(--ink)" icon="🧾" />
        <StatCard flat label={tr('بانتظار المراجعة')} value={formatOMR(totals.pending)} accent="var(--wrn)" icon="⏳" />
        <StatCard flat label={seeAll ? tr('معتمد — مستحق للموظفين') : tr('معتمد — مستحق لك')} value={formatOMR(totals.owed)} accent="var(--info)" icon="✅" />
        <StatCard flat label={tr('تم التعويض')} value={formatOMR(totals.reimbursed)} accent="var(--suc)" icon="💵" />
      </div>

      <div className="toolbar">
        {seeAll && (
          <select className="input toolbar-select" value={filters.person} onChange={setFilter('person')} aria-label={tr('الموظف')}>
            <option value="">{tr('كل الموظفين')}</option>
            {people.map((id) => (
              <option key={id} value={id}>
                {nameOf(id)}
              </option>
            ))}
          </select>
        )}
        <SelectOptions className="input toolbar-select" options={EXPENSE_STATUSES} placeholder={tr('كل الحالات')} value={filters.status} onChange={setFilter('status')} />
        <select className="input toolbar-select" value={filters.month} onChange={setFilter('month')} aria-label={tr('الشهر')}>
          <option value="">{tr('كل الأشهر')}</option>
          {months.map((m) => (
            <option key={m} value={m}>
              {tr(m)}
            </option>
          ))}
        </select>
        <ExhibitionFilter className="toolbar-select" exhibitions={exhibitions} value={filters.exhibition} onChange={setFilter('exhibition')} />
        <div className="toolbar-count">{visible.length}{' '}{tr('نتيجة')}</div>
      </div>

      <Panel title={tr('🧾 المصروفات والفواتير')}>
        <div className="table-wrap">
          <table className="table" style={{ minWidth: 900 }}>
            <thead>
              <tr>
                {[tr('التاريخ'), ...(seeAll ? [tr('الموظف')] : []), tr('الوصف'), tr('التصنيف'), tr('المعرض'), tr('المبلغ'), tr('الحالة'), tr('الإيصال'), ''].map((h) => (
                  <th key={h}>{tr(h)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((x) => {
                const mine = x.user_id === userId
                const pending = x.status === EXPENSE_PENDING
                return (
                  <tr key={x.id}>
                    <td className="small nowrap">{tr(x.date)}</td>
                    {seeAll && <td className="strong">{nameOf(x.user_id)}</td>}
                    <td>
                      <div className="strong">{tr(x.description)}</div>
                      {(x.vendor || x.payment_method) && <div className="muted tiny">{[x.vendor, x.payment_method].filter(Boolean).join(' • ')}</div>}
                      {x.review_note && <div className="tiny text-dng">{tr('ملاحظة:')}{' '}{tr(x.review_note)}</div>}
                    </td>
                    <td>{tr(x.category) && <Chip>{tr(x.category)}</Chip>}</td>
                    <td className="small">{x.exhibition_id ? exhibitionLabel(exhibitionOf(x.exhibition_id)) : tr('عام')}</td>
                    <td className="amount">{formatOMR(x.amount)}</td>
                    <td>
                      <StatusBadge status={x.status} />
                    </td>
                    <td>
                      {x.receipt_path ? (
                        <Button size="sm" variant="outline" onClick={() => viewReceipt(x)} title={tr('عرض الفاتورة')}>
                          {tr('📎 عرض')}
                        </Button>
                      ) : (
                        <span className="muted tiny">—</span>
                      )}
                    </td>
                    <td>
                      <div className="row-actions">
                        {reviewer && pending && (
                          <>
                            <Button size="sm" onClick={() => act(x, EXPENSE_APPROVED)} disabled={busy === x.id} title={tr('اعتماد')}>
                              {tr('✓ اعتماد')}
                            </Button>
                            <Button size="sm" variant="danger" onClick={() => act(x, EXPENSE_REJECTED)} disabled={busy === x.id} title={tr('رفض')}>
                              ✕
                            </Button>
                          </>
                        )}
                        {reviewer && x.status === EXPENSE_APPROVED && (
                          <Button size="sm" variant="outline" onClick={() => act(x, EXPENSE_REIMBURSED)} disabled={busy === x.id} title={tr('تم دفع المبلغ للموظف')}>
                            {tr('💵 تم التعويض')}
                          </Button>
                        )}
                        {((mine && pending) || reviewer) && (
                          <Button size="sm" variant="outline" onClick={() => setEditing(x)} title={tr('تعديل')}>
                            ✏️
                          </Button>
                        )}
                        {((mine && pending) || reviewer) && (
                          <Button size="sm" variant="danger" onClick={() => remove(x)} title={tr('حذف')}>
                            🗑️
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {!visible.length && <EmptyState icon="🧾" text={expenses.length ? tr('لا توجد نتائج لهذا الفلتر') : canWrite ? tr('لا توجد مصروفات بعد — اضغط «+ إضافة مصروف»') : tr('لا توجد مصروفات بعد')} />}
      </Panel>

      {editing && (
        <ExpenseForm
          expense={editing.id ? editing : null}
          exhibitions={exhibitions}
          userId={editing.user_id || userId}
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
