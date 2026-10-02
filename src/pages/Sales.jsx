import { useState } from 'react'
import DateInput from '../components/DateInput.jsx'
import { listExhibitions } from '../api/exhibitions.js'
import { listExhibitors } from '../api/exhibitors.js'
import { attachPaymentReceipt, confirmPayment, deletePayment, listPayments, openPaymentReceipt, recordPayment, TRANSFER_NOT_YET, updatePayment } from '../api/payments.js'
import { confirmIfPaid } from '../api/registration.js'
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
import { checkFile } from '../api/storage.js'
import { PAYMENT_METHOD_META, PAYMENT_METHODS, PAYMENT_TYPES, REFUND_TYPE } from '../lib/constants.js'
import { balanceOf, exhibitionStats, isConfirmed, sumBy, vatEnabled, vatOf, withVat } from '../lib/finance.js'
import { exhibitionLabel, exhibitionTitle, formatOMR, monthOf, num, percent, todayISO } from '../lib/format.js'
import { downloadReceipt, downloadRegistrationInvoice } from '../lib/pdf.js'
import { useData } from '../lib/useData.js'
import { useAuth, useCan } from '../context/AuthContext.jsx'
import { tr } from '../lib/i18n.js'

const load = async () => {
  const [payments, exhibitors, exhibitions] = await Promise.all([listPayments('*', { includePending: true }), listExhibitors(), listExhibitions()])
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
    if (!form.exhibitor_id || !(+form.amount > 0)) return toast(tr('اختر العارض وأدخل المبلغ'), 'error')
    if (refund && exhibitor && +form.amount > num(exhibitor.paid) + (editing ? Math.abs(num(payment.amount)) : 0)) {
      if (!confirm(tr('المبلغ المُرجَع أكبر مما دفعه {0} ({1}). متابعة؟', [exhibitor.brand, formatOMR(exhibitor.paid)]))) return
    }
    setSaving(true)
    try {
      if (editing) {
        await updatePayment(payment, form)
        toast(tr('✅ تم تعديل الدفعة'))
      } else {
        const { invoice_no: invoice } = await recordPayment(form)
        if (!refund) await confirmIfPaid(form.exhibitor_id)
        toast(refund ? tr('✅ تم تسجيل الإرجاع — {0}', [invoice]) : tr('✅ تم تسجيل الدفعة — {0}', [invoice]))
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
      title={editing ? tr(refund ? 'تعديل إرجاع {0}' : 'تعديل دفعة {0}', [payment.invoice_no || '']) : refund ? tr('تسجيل مبلغ مُرجَع') : tr('تسجيل دفعة جديدة')}
      subtitle={editing ? exhibitor?.brand : undefined}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {tr('إلغاء')}
          </Button>
          <Button onClick={submit} disabled={saving} variant={refund ? 'danger' : 'primary'}>
            {saving ? tr('جاري...') : editing ? tr('حفظ التعديل') : refund ? tr('تسجيل الإرجاع') : tr('تسجيل الدفعة')}
          </Button>
        </>
      }
    >
      {!editing && (
        <Field label={tr('العارض')} required>
          <select className="input" value={form.exhibitor_id || ''} onChange={set('exhibitor_id')}>
            <option value="">{tr('اختر العارض...')}</option>
            {exhibitors.map((e) => {
              const balance = balanceOf(e)
              return (
                <option key={e.id} value={e.id}>
                  {tr(e.brand)}{' '}{tr('— مدفوع')}{' '}{formatOMR(e.paid)} / {formatOMR(e.contract)} {balance > 0 ? tr('(متبقي {0})', [formatOMR(balance)]) : '✅'}
                </option>
              )
            })}
          </select>
        </Field>
      )}
      <div className="form-grid">
        <Field label={refund ? tr('المبلغ المُرجَع (ر.ع)') : tr('المبلغ (ر.ع)')} required>
          <input className="input" type="number" min="0" step="0.001" placeholder="0.000" value={form.amount || ''} onChange={set('amount')} />
        </Field>
        <Field label={tr('طريقة الدفع')}>
          <SelectOptions options={methods} placeholder={null} value={form.method} onChange={set('method')} />
        </Field>
        <Field label={tr('نوع الدفعة')}>
          <SelectOptions options={PAYMENT_TYPES} placeholder={null} value={form.type} onChange={set('type')} />
        </Field>
        <Field label={tr('التاريخ')}>
          <DateInput value={form.date || ''} onChange={set('date')} />
        </Field>
      </div>
      <Field label={tr('ملاحظة')}>
        <input className="input" placeholder={refund ? tr('مثال: إرجاع مبلغ المعرض الملغى') : tr('مثال: دفعة مقدمة معرض نزوى')} value={form.note || ''} onChange={set('note')} />
      </Field>
      {refund && <div className="alert alert-warning">{tr('يُسجَّل كمبلغ سالب ويُخصم من إجمالي ما دفعه العارض ومن المحصّل.')}</div>}
      {+form.amount > 0 && !refund && (
        <div className="summary-box">
          <div className="kv-row">
            <span>{tr('المبلغ')}</span>
            <strong>{formatOMR(form.amount)}</strong>
          </div>
          {vatEnabled() && (
            <div className="kv-row muted small">
              <span>{tr('ضريبة 5%')}</span>
              <span>{formatOMR(vatOf(form.amount))}</span>
            </div>
          )}
          <div className="kv-row kv-total">
            <span>{tr('الإجمالي')}</span>
            <strong className="text-suc">{formatOMR(withVat(form.amount))}</strong>
          </div>
        </div>
      )}
    </Modal>
  )
}

export default function Sales({ embedded = false, onChanged } = {}) {
  const toast = useToast()
  const { data, loading, reload: reloadOwn } = useData(load, null)
  // Inside the finance centre, the centre's own totals are refreshed too.
  const reload = () => {
    reloadOwn()
    onChanged?.()
  }
  const [scope, setScope] = useState('all')
  const [adding, setAdding] = useState(false)
  const [editingPayment, setEditingPayment] = useState(null)
  const canWrite = useCan('payments.write')
  const { session } = useAuth()
  const [confirming, setConfirming] = useState(null)

  if (loading || !data) return <Loading />
  const { payments: allPayments, exhibitors, exhibitions } = data
  const payments = allPayments.filter(isConfirmed)
  const pendingPayments = allPayments.filter((p) => !isConfirmed(p))

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
    if (!confirm(tr('حذف الدفعة {0}؟', [payment.invoice_no || '']))) return
    try {
      await deletePayment(payment)
      toast(tr('🗑️ تم حذف الدفعة'))
      reload()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  const printReceipt = async (payment) => {
    toast(tr('🖨️ جاري طباعة الفاتورة...'))
    try {
      const exhibitor = exhibitorOf(payment.exhibitor_id)
      const exhibition = exhibitionOfExhibitor(payment.exhibitor_id)
      // Participants registered through the form get the full tax invoice; others the short receipt.
      if (exhibitor?.booth_type && num(payment.amount) > 0) await downloadRegistrationInvoice({ exhibitor, exhibition, payment })
      else await downloadReceipt(payment, exhibitor, exhibition)
    } catch (err) {
      toast(tr('تعذّر إنشاء الفاتورة: {0}', [err.message]), 'error')
    }
  }

  const viewReceipt = (p) => openPaymentReceipt(p.receipt_path).catch((err) => toast(err.message, 'error'))
  const attachReceipt = async (p, e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const problem = checkFile(file, 'الإيصال')
    if (problem) return toast(problem, 'error')
    try {
      await attachPaymentReceipt(p, file, session?.user?.id)
      toast(tr('✅ أُرفق الإيصال'))
      reload()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  const confirm_ = async (payment) => {
    if (!confirm(tr('تأكيد وصول {0} من {1}؟', [formatOMR(withVat(payment.amount)), exhibitorOf(payment.exhibitor_id)?.brand || tr('العارض')]))) return
    setConfirming(payment.id)
    try {
      await confirmPayment(payment, session?.user?.id)
      await confirmIfPaid(payment.exhibitor_id)
      toast(tr('✅ تم تأكيد الدفعة'))
      reload()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setConfirming(null)
    }
  }

  return (
    <>
      <PageHeader embedded={embedded} title={tr('المبيعات والمدفوعات')} subtitle={tr('{0} دفعة مسجلة', [payments.length])}>
        <ExhibitionFilter exhibitions={exhibitions} value={scope} onChange={setScope} />
        {canWrite && <Button onClick={() => setAdding(true)}>{tr('+ تسجيل دفعة / إرجاع')}</Button>}
      </PageHeader>

      {pendingPayments.length > 0 && (
        <Panel icon="⏳" title={tr('دفعات بانتظار التأكيد ({0})', [pendingPayments.length])} subtitle={tr('سجّلها فريق التسويق — لا تُحسب ضمن المحصّل حتى تتأكد المالية من وصول المبلغ')} className="mb-20 panel-pending">
          <div className="table-wrap">
            <table className="table table-numbered" style={{ minWidth: 760 }}>
              <thead>
                <tr>
                  {[tr('رقم الفاتورة'), tr('العارض'), tr('المعرض'), vatEnabled() ? tr('المبلغ شامل الضريبة') : tr('المبلغ'), tr('الطريقة'), tr('رقم الحساب / المحوَّل إليه'), tr('التاريخ'), ''].map((h) => (
                    <th key={h}>{tr(h)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pendingPayments.map((p) => (
                  <tr key={p.id}>
                    <td className="mono muted tiny">{p.invoice_no || '—'}</td>
                    <td className="strong">{exhibitorOf(p.exhibitor_id)?.brand || '—'}</td>
                    <td className="muted small">{exhibitionLabel(exhibitionOfExhibitor(p.exhibitor_id))}</td>
                    <td className="amount">{formatOMR(withVat(p.amount))}</td>
                    <td>
                      <Chip>{p.method === 'نقد' ? tr('كاش') : p.method}</Chip>
                    </td>
                    <td className="small">
                      <div className="muted" dir="auto">{p.transfer_ref || '—'}</div>
                      {p.transfer_status && <div className={`tiny strong ${p.transfer_status === TRANSFER_NOT_YET ? 'text-wrn' : 'text-suc'}`}>{tr(p.transfer_status)}</div>}
                    </td>
                    <td className="muted small nowrap">{tr(p.date)}</td>
                    <td>
                      <div className="row-actions">
                        {canWrite && (
                          <Button size="sm" onClick={() => confirm_(p)} disabled={confirming === p.id}>
                            {confirming === p.id ? '...' : tr('✓ تأكيد الوصول')}
                          </Button>
                        )}
                        {p.receipt_path && (
                          <Button size="sm" variant="outline" onClick={() => viewReceipt(p)} title={tr('إيصال التحويل')}>
                            📎
                          </Button>
                        )}
                        {canWrite && (
                          <label className="btn btn-outline btn-sm file-pick" title={p.receipt_path ? tr('تغيير الإيصال') : tr('إرفاق إيصال التحويل')}>
                            {p.receipt_path ? '🔄' : tr('📎 إرفاق إيصال')}
                            <input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={(e) => attachReceipt(p, e)} hidden />
                          </label>
                        )}
                        <Button size="sm" variant="outline" onClick={() => printReceipt(p)} title={tr('فاتورة PDF')}>
                          🖨️
                        </Button>
                        {canWrite && (
                          <Button size="sm" variant="danger" onClick={() => remove(p)} title={tr('حذف — المبلغ لم يصل')}>
                            🗑️
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}


      <div className="grid-4 mb-16">
        <StatCard flat label={tr('إجمالي العقود')} value={formatOMR(contracts)} sub={tr('{0} عارض', [scopeExhibitors.length])} accent="var(--ink)" icon="📋" />
        <StatCard flat label={tr('إجمالي المحصّل')} value={formatOMR(collected)} sub={vatEnabled() ? tr('ضريبة: {0}', [formatOMR(vat)]) : tr('من {0} عقود', [formatOMR(contracts)])} accent="var(--gold)" icon="💵" />
        <StatCard flat label={tr('المبلغ المتبقي')} value={formatOMR(remaining)} sub={tr('{0}% من العقود', [percent(remaining, contracts)])} accent={remaining > 0 ? 'var(--wrn)' : 'var(--suc)'} icon="⏳" />
        {vatEnabled() ? (
          <StatCard flat label={tr('المجموع شامل الضريبة')} value={formatOMR(collected + vat)} sub={tr('نسبة {0}%', [percent(collected, contracts)])} accent="var(--suc)" icon="🏆" />
        ) : (
          <StatCard flat label={tr('نسبة التحصيل')} value={`${percent(collected, contracts)}%`} sub={tr('المحصّل من قيمة العقود')} accent="var(--suc)" icon="🏆" />
        )}
      </div>

      <Panel icon="🏛️" title={tr('الدخل حسب المعرض')} className="mb-20">
        <div className="income-grid">
          {exhibitions.map((ex) => {
            const s = exhibitionStats(ex, exhibitors, payments)
            const pct = percent(s.collected, s.contract)
            return (
              <div key={ex.id} className="income-cell">
                <div className="strong small">{exhibitionTitle(ex)}</div>
                <div className="muted tiny mb-8">{monthOf(ex.date_from)}</div>
                <div className="income-value">{formatOMR(s.collected)}</div>
                <div className="muted tiny">{tr('من')}{' '}{formatOMR(s.contract)}</div>
                {s.remaining > 0 && <div className="tiny text-wrn">{tr('متبقي')}{' '}{formatOMR(s.remaining)}</div>}
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
        {[...PAYMENT_METHODS, ...(scopePayments.some((p) => p.method === 'غير محدد') ? [tr('غير محدد')] : [])].map((method) => {
          const total = sumBy(scopePayments.filter((p) => p.method === method), 'amount')
          const meta = PAYMENT_METHOD_META[method] || PAYMENT_METHOD_META['غير محدد']
          return (
            <StatCard key={method} flat label={method} icon={meta.icon} accent={meta.color} value={formatOMR(total)} sub={`${percent(total, collected)}%`} />
          )
        })}
      </div>

      <Panel title={tr('💳 سجل المدفوعات')}>
        <div className="table-wrap">
          <table className="table table-numbered" style={{ minWidth: 800 }}>
            <thead>
              <tr>
                {[tr('رقم الفاتورة'), tr('العارض'), tr('المعرض'), tr('المبلغ'), ...(vatEnabled() ? [tr('ضريبة 5%')] : []), tr('الطريقة'), tr('النوع'), tr('التاريخ'), tr('ملاحظة'), ''].map((h) => (
                  <th key={h}>{tr(h)}</th>
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
                  {vatEnabled() && <td className="muted small">{formatOMR(vatOf(p.amount))}</td>}
                  <td>
                    <Chip>{tr(p.method)}</Chip>
                  </td>
                  <td>
                    <StatusBadge status={p.type || 'كامل'} />
                  </td>
                  <td className="muted small nowrap">{tr(p.date)}</td>
                  <td className="muted small truncate" title={p.note}>
                    {p.note || '—'}
                  </td>
                  <td>
                    <div className="row-actions">
                      {canWrite && (
                        <Button size="sm" variant="outline" onClick={() => setEditingPayment(p)} title={tr('تعديل')}>
                          ✏️
                        </Button>
                      )}
                      {p.receipt_path && (
                        <Button size="sm" variant="outline" onClick={() => viewReceipt(p)} title={tr('إيصال التحويل')}>
                          📎
                        </Button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => printReceipt(p)} title={tr('فاتورة PDF')}>
                        🖨️
                      </Button>
                      {canWrite && (
                        <Button size="sm" variant="danger" onClick={() => remove(p)} title={tr('حذف')}>
                          🗑️
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!scopePayments.length && <EmptyState icon="💰" text={tr('لا توجد مدفوعات')} />}
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
