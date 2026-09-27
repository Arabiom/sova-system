import { useState } from 'react'
import { listExhibitions } from '../api/exhibitions.js'
import { listExhibitors } from '../api/exhibitors.js'
import { deletePayment, listPayments, recordPayment, updatePayment } from '../api/payments.js'
import Button from '../components/Button.jsx'
import ExhibitionFilter from '../components/ExhibitionFilter.jsx'
import { EmptyState, Loading } from '../components/Feedback.jsx'
import Field, { SelectOptions } from '../components/Field.jsx'
import Modal from '../components/Modal.jsx'
import PageHeader from '../components/PageHeader.jsx'
import Panel from '../components/Panel.jsx'
import { ProgressBar } from '../components/Progress.jsx'
import StatCard from '../components/StatCard.jsx'
import StatusBadge, { Chip } from '../components/StatusBadge.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { PAYMENT_METHOD_META, PAYMENT_METHODS, PAYMENT_TYPES, REFUND_TYPE } from '../lib/constants.js'
import { balanceOf, exhibitionStats, sumBy, vatOf, withVat } from '../lib/finance.js'
import { exhibitionLabel, exhibitionTitle, formatOMR, monthOf, num, percent, todayISO } from '../lib/format.js'
import { downloadReceipt } from '../lib/pdf.js'
import { useData } from '../lib/useData.js'

const load = async () => {
  const [payments, exhibitors, exhibitions] = await Promise.all([listPayments(), listExhibitors(), listExhibitions()])
  return { payments, exhibitors, exhibitions }
}

function PaymentForm({ exhibitors, payment, onClose, onSaved }) {
  const toast = useToast()
  const editing = Boolean(payment)
  const [form, setForm] = useState(
    editing
      ? { ...payment, amount: Math.abs(num(payment.amount)) }
      : { type: 'كامل', method: 'نقد', date: todayISO() },
  )
  const [saving, setSaving] = useState(false)
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  const refund = form.type === REFUND_TYPE
  const exhibitor = exhibitors.find((e) => e.id === form.exhibitor_id)

  const submit = async () => {
    if (!form.exhibitor_id || !(+form.amount > 0)) return toast('اختر العارض وأدخل المبلغ', 'error')
    if (refund && exhibitor && +form.amount > num(exhibitor.paid) + (editing ? Math.abs(num(payment.amount)) : 0)) {
      if (!confirm(`المبلغ المُرجَع أكبر مما دفعه ${exhibitor.brand} (${formatOMR(exhibitor.paid)}). متابعة؟`)) return
    }
    setSaving(true)
    try {
      if (editing) {
        await updatePayment(payment, form)
        toast('✅ تم تعديل الدفعة')
      } else {
        const invoice = await recordPayment(form)
        toast(refund ? `✅ تم تسجيل الإرجاع — ${invoice}` : `✅ تم تسجيل الدفعة — ${invoice}`)
      }
      onSaved()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const methods = PAYMENT_METHODS.includes(form.method) || !form.method ? PAYMENT_METHODS : [...PAYMENT_METHODS, form.method]

  return (
    <Modal
      title={editing ? `تعديل ${refund ? 'إرجاع' : 'دفعة'} ${payment.invoice_no || ''}` : refund ? 'تسجيل مبلغ مُرجَع' : 'تسجيل دفعة جديدة'}
      subtitle={editing ? exhibitor?.brand : undefined}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            إلغاء
          </Button>
          <Button onClick={submit} disabled={saving} variant={refund ? 'danger' : 'primary'}>
            {saving ? 'جاري...' : editing ? 'حفظ التعديل' : refund ? 'تسجيل الإرجاع' : 'تسجيل الدفعة'}
          </Button>
        </>
      }
    >
      {!editing && (
        <Field label="العارض" required>
          <select className="input" value={form.exhibitor_id || ''} onChange={set('exhibitor_id')}>
            <option value="">اختر عارض...</option>
            {exhibitors.map((e) => {
              const balance = balanceOf(e)
              return (
                <option key={e.id} value={e.id}>
                  {e.brand} — مدفوع {formatOMR(e.paid)} / {formatOMR(e.contract)} {balance > 0 ? `(متبقي ${formatOMR(balance)})` : '✅'}
                </option>
              )
            })}
          </select>
        </Field>
      )}
      <div className="form-grid">
        <Field label={refund ? 'المبلغ المُرجَع (ر.ع)' : 'المبلغ (ر.ع)'} required>
          <input className="input" type="number" min="0" step="0.001" placeholder="0.000" value={form.amount || ''} onChange={set('amount')} />
        </Field>
        <Field label="طريقة الدفع">
          <SelectOptions options={methods} placeholder={null} value={form.method} onChange={set('method')} />
        </Field>
        <Field label="نوع الدفعة">
          <SelectOptions options={PAYMENT_TYPES} placeholder={null} value={form.type} onChange={set('type')} />
        </Field>
        <Field label="التاريخ">
          <input className="input" type="date" value={form.date || ''} onChange={set('date')} />
        </Field>
      </div>
      <Field label="ملاحظة">
        <input className="input" placeholder={refund ? 'مثال: إرجاع مبلغ المعرض الملغى' : 'مثال: دفعة مقدمة معرض نزوى'} value={form.note || ''} onChange={set('note')} />
      </Field>
      {refund && <div className="alert alert-warning">يُسجَّل كمبلغ سالب ويُخصم من إجمالي ما دفعه العارض ومن المحصّل.</div>}
      {+form.amount > 0 && !refund && (
        <div className="summary-box">
          <div className="kv-row">
            <span>المبلغ</span>
            <strong>{formatOMR(form.amount)}</strong>
          </div>
          <div className="kv-row muted small">
            <span>ضريبة 5%</span>
            <span>{formatOMR(vatOf(form.amount))}</span>
          </div>
          <div className="kv-row kv-total">
            <span>الإجمالي</span>
            <strong className="text-suc">{formatOMR(withVat(form.amount))}</strong>
          </div>
        </div>
      )}
    </Modal>
  )
}

export default function Sales() {
  const toast = useToast()
  const { data, loading, reload } = useData(load, null)
  const [scope, setScope] = useState('all')
  const [adding, setAdding] = useState(false)
  const [editingPayment, setEditingPayment] = useState(null)

  if (loading || !data) return <Loading />
  const { payments, exhibitors, exhibitions } = data

  const exhibitorOf = (id) => exhibitors.find((e) => e.id === id)
  const exhibitionOfExhibitor = (id) => exhibitions.find((ex) => ex.id === exhibitorOf(id)?.exhibition_id)

  const scopeExhibitors = scope === 'all' ? exhibitors : exhibitors.filter((e) => e.exhibition_id === scope)
  const scopeIds = new Set(scopeExhibitors.map((e) => e.id))
  const scopePayments = scope === 'all' ? payments : payments.filter((p) => scopeIds.has(p.exhibitor_id))

  const collected = sumBy(scopePayments, 'amount')
  const vat = vatOf(collected)
  const contracts = sumBy(scopeExhibitors, 'contract')
  const remaining = contracts - collected

  const remove = async (payment) => {
    if (!confirm(`حذف الدفعة ${payment.invoice_no || ''}؟`)) return
    try {
      await deletePayment(payment)
      toast('🗑️ تم حذف الدفعة')
      reload()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  const printReceipt = async (payment) => {
    toast('🖨️ جاري طباعة الفاتورة...')
    try {
      await downloadReceipt(payment, exhibitorOf(payment.exhibitor_id), exhibitionOfExhibitor(payment.exhibitor_id))
    } catch (err) {
      toast(`تعذّر إنشاء الفاتورة: ${err.message}`, 'error')
    }
  }

  return (
    <>
      <PageHeader title="المبيعات والمدفوعات" subtitle={`${payments.length} دفعة مسجلة`}>
        <ExhibitionFilter exhibitions={exhibitions} value={scope} onChange={setScope} />
        <Button onClick={() => setAdding(true)}>+ تسجيل دفعة / إرجاع</Button>
      </PageHeader>

      <div className="grid-4 mb-16">
        <StatCard flat label="إجمالي العقود" value={formatOMR(contracts)} sub={`${scopeExhibitors.length} عارض`} accent="var(--ink)" icon="📋" />
        <StatCard flat label="إجمالي المحصّل" value={formatOMR(collected)} sub={`ضريبة: ${formatOMR(vat)}`} accent="var(--gold)" icon="💵" />
        <StatCard flat label="المبلغ المتبقي" value={formatOMR(remaining)} sub={`${percent(remaining, contracts)}% من العقود`} accent={remaining > 0 ? 'var(--wrn)' : 'var(--suc)'} icon="⏳" />
        <StatCard flat label="المجموع شامل الضريبة" value={formatOMR(collected + vat)} sub={`نسبة ${percent(collected, contracts)}%`} accent="var(--suc)" icon="🏆" />
      </div>

      <Panel icon="🏛️" title="الدخل حسب المعرض" className="mb-20">
        <div className="income-grid">
          {exhibitions.map((ex) => {
            const s = exhibitionStats(ex, exhibitors, payments)
            const pct = percent(s.collected, s.contract)
            return (
              <div key={ex.id} className="income-cell">
                <div className="strong small">{exhibitionTitle(ex)}</div>
                <div className="muted tiny mb-8">{monthOf(ex.date_from)}</div>
                <div className="income-value">{formatOMR(s.collected)}</div>
                <div className="muted tiny">من {formatOMR(s.contract)}</div>
                {s.remaining > 0 && <div className="tiny text-wrn">متبقي {formatOMR(s.remaining)}</div>}
                <div className="mt-8">
                  <ProgressBar pct={pct} height={4} color={pct > 70 ? 'var(--suc)' : pct > 40 ? 'var(--gold)' : 'var(--wrn)'} />
                </div>
                <div className="muted tiny ltr-end">{pct}%</div>
              </div>
            )
          })}
        </div>
      </Panel>

      <div className="grid-4 mb-20">
        {[...PAYMENT_METHODS, ...(scopePayments.some((p) => p.method === 'غير محدد') ? ['غير محدد'] : [])].map((method) => {
          const total = sumBy(scopePayments.filter((p) => p.method === method), 'amount')
          const meta = PAYMENT_METHOD_META[method] || PAYMENT_METHOD_META['غير محدد']
          return (
            <StatCard key={method} flat label={method} icon={meta.icon} accent={meta.color} value={formatOMR(total)} sub={`${percent(total, collected)}%`} />
          )
        })}
      </div>

      <Panel title="💳 سجل المدفوعات">
        <div className="table-wrap">
          <table className="table" style={{ minWidth: 800 }}>
            <thead>
              <tr>
                {['رقم الفاتورة', 'العارض', 'المعرض', 'المبلغ', 'ضريبة 5%', 'الطريقة', 'النوع', 'التاريخ', 'ملاحظة', ''].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {scopePayments.map((p) => (
                <tr key={p.id}>
                  <td className="mono muted tiny">{p.invoice_no || '—'}</td>
                  <td className="strong">{exhibitorOf(p.exhibitor_id)?.brand || '—'}</td>
                  <td className="muted small">{exhibitionLabel(exhibitionOfExhibitor(p.exhibitor_id))}</td>
                  <td className={num(p.amount) < 0 ? 'amount text-dng' : 'amount'}>{formatOMR(p.amount)}</td>
                  <td className="muted small">{formatOMR(vatOf(p.amount))}</td>
                  <td>
                    <Chip>{p.method}</Chip>
                  </td>
                  <td>
                    <StatusBadge status={p.type || 'كامل'} />
                  </td>
                  <td className="muted small nowrap">{p.date}</td>
                  <td className="muted small truncate" title={p.note}>
                    {p.note || '—'}
                  </td>
                  <td>
                    <div className="row-actions">
                      <Button size="sm" variant="outline" onClick={() => setEditingPayment(p)} title="تعديل">
                        ✏️
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => printReceipt(p)} title="فاتورة PDF">
                        🖨️
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => remove(p)} title="حذف">
                        🗑️
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!scopePayments.length && <EmptyState icon="💰" text="لا توجد مدفوعات" />}
      </Panel>

      {editingPayment && (
        <PaymentForm
          exhibitors={exhibitors}
          payment={editingPayment}
          onClose={() => setEditingPayment(null)}
          onSaved={() => {
            setEditingPayment(null)
            reload()
          }}
        />
      )}
      {adding && (
        <PaymentForm
          exhibitors={exhibitors}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false)
            reload()
          }}
        />
      )}
    </>
  )
}
