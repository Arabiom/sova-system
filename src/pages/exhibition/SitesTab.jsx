import { useRef, useState } from 'react'
import { addSites, applyImport, assignSite, deleteAllSites, deleteTier, updateTier } from '../../api/exhibitionFile.js'
import Button from '../../components/Button.jsx'
import Field from '../../components/Field.jsx'
import Modal from '../../components/Modal.jsx'
import Panel from '../../components/Panel.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { DEFAULT_TIERS } from '../../lib/constants.js'
import { tiersOf } from '../../lib/finance.js'
import { formatOMR } from '../../lib/format.js'
import { matchPlan, planImport, readFirstSheet } from '../../lib/importSheet.js'
import { parseRanges, siteStatus, tierColor, tiersFromSites } from '../../lib/sites.js'

function TierForm({ exhibitionId, tier, takenNumbers, onClose, onSaved }) {
  const toast = useToast()
  const editing = Boolean(tier)
  const [form, setForm] = useState({ numbers: '', name: tier?.name || '', price: tier?.price ?? '' })
  const [saving, setSaving] = useState(false)
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  let preview = null
  let error = ''
  if (!editing && form.numbers.trim()) {
    try {
      preview = parseRanges(form.numbers)
      const clash = preview.filter((n) => takenNumbers.has(n))
      if (clash.length) error = `هذه الأرقام موجودة مسبقاً: ${clash.join('، ')}`
    } catch (err) {
      error = err.message
    }
  }

  const submit = async () => {
    if (!form.name.trim()) return toast('اكتب اسم الفئة', 'error')
    if (!editing && (!preview?.length || error)) return toast(error || 'اكتب أرقام المواقع', 'error')
    setSaving(true)
    try {
      if (editing) await updateTier(exhibitionId, tier.name, tier.price, { tier: form.name.trim(), price: form.price })
      else await addSites(exhibitionId, preview, form.name.trim(), form.price)
      toast(editing ? '✅ تم تحديث الفئة' : `✅ تمت إضافة ${preview.length} موقع`)
      onSaved()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={editing ? `تعديل فئة "${tier.name}"` : 'إضافة مواقع'}
      subtitle={editing ? `يطبّق على ${tier.count} موقع (${tier.ranges})` : 'أضف مجموعة مواقع بنفس الفئة والسعر'}
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
      {!editing && (
        <Field
          label="أرقام المواقع"
          required
          hint={error ? <span className="text-dng">{error}</span> : preview ? `${preview.length} موقع` : 'مثال: 1-6 أو 7-20, 23-30, 33-40 أو 21, 22, 31, 32'}
        >
          <input className="input" dir="ltr" placeholder="7-20, 23-30" value={form.numbers} onChange={set('numbers')} />
        </Field>
      )}
      <div className="form-grid">
        <Field label="اسم الفئة" required hint="مثال: ركن مدخل، صف داخلي، أحمر فاتح">
          <input className="input" value={form.name} onChange={set('name')} />
        </Field>
        <Field label="السعر (ر.ع)">
          <input className="input" type="number" min="0" step="0.001" value={form.price} onChange={set('price')} />
        </Field>
      </div>
      {editing && <div className="muted tiny">تغيير السعر هنا يغيّر سعر الخارطة فقط، ولا يغيّر عقود المشاركين الحالية.</div>}
    </Modal>
  )
}

function AssignModal({ site, exhibitors, holder, onClose, onSaved }) {
  const toast = useToast()
  const [exhibitorId, setExhibitorId] = useState(holder?.id || '')
  const [adjust, setAdjust] = useState(true)
  const [saving, setSaving] = useState(false)
  const chosen = exhibitors.find((e) => e.id === exhibitorId) || null
  const changed = (holder?.id || '') !== exhibitorId

  const submit = async () => {
    if (!changed) return onClose()
    setSaving(true)
    try {
      await assignSite(site, chosen, { adjustContract: adjust, previous: holder })
      toast(chosen ? `✅ الموقع ${site.number} لـ ${chosen.brand}` : `✅ الموقع ${site.number} أصبح متاحاً`)
      onSaved()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={`الموقع رقم ${site.number}`}
      subtitle={`${site.tier} • ${formatOMR(site.price)}`}
      size="sm"
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            إلغاء
          </Button>
          <Button onClick={submit} disabled={saving || !changed}>
            {saving ? 'جاري...' : 'حفظ'}
          </Button>
        </>
      }
    >
      <Field label="المشارك" hint={exhibitors.length ? undefined : 'أضف المشاركين أولاً من تبويب "المشاركون"'}>
        <select className="input" value={exhibitorId} onChange={(e) => setExhibitorId(e.target.value)}>
          <option value="">— متاح (بدون مشارك) —</option>
          {exhibitors.map((e) => (
            <option key={e.id} value={e.id}>
              {e.brand}
              {e.booth && e.booth !== '—' ? ` (يملك: ${e.booth})` : ''}
            </option>
          ))}
        </select>
      </Field>
      {changed && (
        <label className="check-row">
          <input type="checkbox" checked={adjust} onChange={(e) => setAdjust(e.target.checked)} />
          <span>
            {chosen && holder
              ? `نقل سعر الموقع (${formatOMR(site.price)}) من عقد ${holder.brand} إلى عقد ${chosen.brand}`
              : chosen
                ? `إضافة سعر الموقع (${formatOMR(site.price)}) إلى قيمة عقد ${chosen.brand}`
                : `خصم سعر الموقع (${formatOMR(site.price)}) من عقد ${holder.brand}`}
          </span>
        </label>
      )}
    </Modal>
  )
}

function ImportModal({ exhibitionId, existingSites, exhibitors, onClose, onDone }) {
  const toast = useToast()
  const [plan, setPlan] = useState(null)
  const [error, setError] = useState('')
  const [fileName, setFileName] = useState('')
  const [progress, setProgress] = useState(null)
  const [replace, setReplace] = useState(false)
  const running = useRef(false)
  const matched = plan ? matchPlan(plan, exhibitors) : null
  const needsReplace = existingSites > 0

  const onFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setPlan(null)
    setError('')
    try {
      setPlan(planImport(await readFirstSheet(file)))
    } catch (err) {
      setError(err.message)
    }
  }

  const run = async () => {
    if (running.current) return
    if (needsReplace && !replace) return toast('وافق على استبدال الخارطة الحالية أولاً', 'error')
    running.current = true
    setProgress({ done: 0, total: matched.participants.length })
    try {
      await applyImport(exhibitionId, plan, matched, { replaceSites: needsReplace && replace }, (done, total) => setProgress({ done, total }))
      toast(`✅ تم الاستيراد: ${plan.sites.length} موقع، ${matched.created} مشارك جديد، ${matched.updated} تحديث`)
      onDone()
    } catch (err) {
      toast(`${err.message} — يمكنك إعادة المحاولة بأمان، لن تتكرر البيانات.`, 'error')
      setProgress(null)
      running.current = false
    }
  }

  const tiers = plan ? tiersFromSites(plan.sites) : []

  return (
    <Modal
      title="📥 استيراد من ملف Excel"
      subtitle="ملف تسجيل المشاركين: رقم الكشك، لون الموقع، السعر، المبلغ المدفوع، اسم المشارك، الشركة، الهاتف، النشاط"
      size="lg"
      onClose={progress ? () => {} : onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={Boolean(progress)}>
            إلغاء
          </Button>
          <Button onClick={run} disabled={!plan || Boolean(progress) || (needsReplace && !replace)}>
            {progress ? `جاري الاستيراد... ${progress.done}/${progress.total}` : 'تأكيد الاستيراد'}
          </Button>
        </>
      }
    >
      <label className="file-drop">
        <input type="file" accept=".xlsx" onChange={onFile} disabled={Boolean(progress)} />
        <span>📄 {fileName || 'اختر ملف .xlsx'}</span>
      </label>
      {error && <div className="alert alert-danger mt-12">⚠️ {error}</div>}

      {plan && (
        <>
          <div className="grid-4 mt-14 mb-16">
            <div className="mini-stat">
              <span>المواقع</span>
              <strong>{plan.totals.sites}</strong>
            </div>
            <div className="mini-stat">
              <span>الإيراد الكامل</span>
              <strong>{formatOMR(plan.totals.fullRevenue)}</strong>
            </div>
            <div className="mini-stat">
              <span>المشاركون: جديد / تحديث</span>
              <strong>
                {matched.created} / {matched.updated}
              </strong>
            </div>
            <div className="mini-stat">
              <span>العقود / المدفوع</span>
              <strong>
                {formatOMR(plan.totals.contract)} / {formatOMR(plan.totals.paid)}
              </strong>
            </div>
          </div>

          {needsReplace && (
            <div className="alert alert-warning">
              <div>
                <strong>هذا المعرض لديه خارطة حالية ({existingSites} موقع).</strong>
                <div className="mt-8">
                  الاستيراد يستبدلها بخارطة الملف. المشاركون الحاليون <strong>لا يُحذفون</strong>: من يطابق الملف (بالهاتف أو الاسم) يُحدَّث ولا يتكرر، ودفعاتهم المسجلة تبقى كما هي.
                </div>
                <label className="check-row mt-8">
                  <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
                  <span>أوافق على استبدال الخارطة الحالية</span>
                </label>
              </div>
            </div>
          )}

          <div className="section-label">الفئات المكتشفة</div>
          <div className="tier-legend mb-16">
            {tiers.map((t, i) => (
              <span key={t.name + t.price} className="tier-pill" style={{ '--tier': tierColor(t.name, i) }}>
                {t.name}: {t.count} × {t.price} ر.ع ({t.ranges})
              </span>
            ))}
          </div>

          <div className="section-label">المشاركون</div>
          <div className="table-wrap mb-16">
            <table className="table table-compact">
              <thead>
                <tr>
                  <th>المواقع</th>
                  <th>الشركة</th>
                  <th>المشارك</th>
                  <th>الهاتف</th>
                  <th>العقد</th>
                  <th>المدفوع</th>
                  <th>الإجراء</th>
                </tr>
              </thead>
              <tbody>
                {matched.participants.map((p) => (
                  <tr key={p.numbers.join('-')}>
                    <td>{p.numbers.join('، ')}</td>
                    <td className="strong">{p.brand}</td>
                    <td>{p.manager}</td>
                    <td className="ltr">{p.phone}</td>
                    <td className="num">{formatOMR(p.contract)}</td>
                    <td className="num">{formatOMR(p.paid)}</td>
                    <td className="small">
                      {p.existing ? <span className="badge badge-info">تحديث</span> : <span className="badge badge-success">جديد</span>}
                      {p.paidToRecord > 0 && <div className="tiny muted mt-8">دفعة +{formatOMR(p.paidToRecord)}</div>}
                      {p.paidAhead > 0 && <div className="tiny text-wrn mt-8">مسجل في النظام أكثر من الملف بـ {formatOMR(p.paidAhead)}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {matched.untouched.length > 0 && (
            <div className="alert alert-warning">
              <div>
                <strong>مشاركون مسجلون في هذا المعرض وغير موجودين في الملف ({matched.untouched.length}):</strong>{' '}
                {matched.untouched.map((e) => e.brand).join('، ')}
                <div className="mt-8">لن يُحذفوا، {needsReplace ? 'لكنهم سيبقون بدون موقع في الخارطة الجديدة.' : 'ويمكنك حجز مواقع لهم من الخارطة بعد الاستيراد.'}</div>
              </div>
            </div>
          )}

          {plan.warnings.length > 0 && (
            <div className="alert alert-warning">
              <div>
                <strong>ملاحظات راجعها ({plan.warnings.length}):</strong>
                <ul className="warn-list">
                  {plan.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
          <div className="muted tiny">
            المبالغ المدفوعة الجديدة تُسجَّل كدفعات بطريقة "غير محدد" — يمكنك تعديل طريقة الدفع لاحقاً من صفحة المبيعات. يمكن إعادة الاستيراد بأمان لتحديث البيانات من نسخة أحدث من الملف.
          </div>
        </>
      )}
    </Modal>
  )
}

export default function SitesTab({ exhibition, sites, exhibitors, onChanged }) {
  const toast = useToast()
  const [tierForm, setTierForm] = useState(null) // { tier } | { tier: null }
  const [assigning, setAssigning] = useState(null)
  const [importing, setImporting] = useState(false)

  const byId = new Map(exhibitors.map((e) => [e.id, e]))
  const tiers = tiersFromSites(sites)
  const colorOf = new Map(tiers.map((t, i) => [`${t.name}|${t.price}`, tierColor(t.name, i)]))
  const taken = new Set(sites.map((s) => s.number))

  const fromPlan = async () => {
    const plan = tiersOf(exhibition, DEFAULT_TIERS).filter((t) => t.count > 0)
    if (!plan.length) return toast('لا توجد فئات مبدئية لهذا المعرض', 'error')
    try {
      let next = 1
      for (const t of plan) {
        const numbers = Array.from({ length: t.count }, (_, i) => next + i)
        next += t.count
        await addSites(exhibition.id, numbers, t.name, t.price)
      }
      toast(`✅ تم إنشاء ${next - 1} موقع`)
      onChanged()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  const removeTier = async (t) => {
    const held = sites.filter((s) => s.tier === t.name && Number(s.price) === t.price && s.exhibitor_id).length
    if (!confirm(`حذف فئة "${t.name}" (${t.count} موقع)؟${held ? `\n${held} منها محجوزة وسيُفك ربطها بالمشاركين.` : ''}`)) return
    try {
      await deleteTier(exhibition.id, t.name, t.price)
      toast('🗑️ تم حذف الفئة')
      onChanged()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  const clearAll = async () => {
    if (!confirm(`حذف خارطة المواقع كاملة (${sites.length} موقع)؟ المشاركون ودفعاتهم لا يُحذفون.`)) return
    try {
      await deleteAllSites(exhibition.id)
      toast('🗑️ تم حذف الخارطة')
      onChanged()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  if (!sites.length) {
    const plan = tiersOf(exhibition, DEFAULT_TIERS).filter((t) => t.count > 0)
    return (
      <Panel bodyClass="panel-pad">
        <div className="empty">
          <div className="empty-icon">🗺️</div>
          <div className="strong mb-8">لم تُضف خارطة المواقع بعد</div>
          <div className="small mb-16">أضف أرقام المواقع وفئاتها وأسعارها، أو استوردها مع المشاركين من ملف Excel.</div>
          <div className="page-actions center-actions">
            <Button onClick={() => setImporting(true)}>📥 استيراد من Excel</Button>
            <Button variant="outline" onClick={() => setTierForm({ tier: null })}>
              + إضافة مواقع يدوياً
            </Button>
            {plan.length > 0 && (
              <Button variant="outline" onClick={fromPlan}>
                ⚡ إنشاء من الفئات المبدئية ({plan.map((t) => `${t.count} ${t.name}`).join('، ')})
              </Button>
            )}
          </div>
        </div>
        {tierForm && (
          <TierForm exhibitionId={exhibition.id} tier={null} takenNumbers={taken} onClose={() => setTierForm(null)} onSaved={() => { setTierForm(null); onChanged() }} />
        )}
        {importing && <ImportModal exhibitionId={exhibition.id} existingSites={sites.length} exhibitors={exhibitors} onClose={() => setImporting(false)} onDone={() => { setImporting(false); onChanged() }} />}
      </Panel>
    )
  }

  return (
    <>
      <Panel
        icon="🏷️"
        title="الفئات والأسعار"
        subtitle={`${sites.length} موقع • ${formatOMR(tiers.reduce((t, x) => t + x.total, 0))} عند البيع الكامل`}
        className="mb-16"
        action={
          <div className="row-actions">
            <Button size="sm" onClick={() => setTierForm({ tier: null })}>
              + إضافة مواقع
            </Button>
            <Button size="sm" variant="outline" onClick={() => setImporting(true)}>
              📥 استيراد / تحديث من Excel
            </Button>
            <Button size="sm" variant="danger" onClick={clearAll}>
              حذف الخارطة
            </Button>
          </div>
        }
      >
        <div className="table-wrap">
          <table className="table table-compact">
            <thead>
              <tr>
                <th>الفئة</th>
                <th>أرقام المواقع</th>
                <th>العدد</th>
                <th>المحجوز</th>
                <th>السعر</th>
                <th>الإجمالي</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {tiers.map((t, i) => {
                const booked = sites.filter((s) => s.tier === t.name && Number(s.price) === t.price && s.exhibitor_id).length
                return (
                  <tr key={t.name + t.price}>
                    <td>
                      <span className="tier-dot" style={{ '--tier': tierColor(t.name, i) }} />
                      <strong>{t.name}</strong>
                    </td>
                    <td className="small">{t.ranges}</td>
                    <td className="center">{t.count}</td>
                    <td className="center">{booked}</td>
                    <td className="num">{formatOMR(t.price)}</td>
                    <td className="num strong">{formatOMR(t.total)}</td>
                    <td>
                      <div className="row-actions">
                        <Button size="sm" variant="outline" onClick={() => setTierForm({ tier: t })} title="تعديل">
                          ✏️
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => removeTier(t)} title="حذف">
                          🗑️
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel icon="🗺️" title="خارطة المواقع" subtitle="اضغط على أي موقع لحجزه لمشارك أو تحريره" bodyClass="panel-pad">
        <div className="site-legend">
          {['متاح', 'محجوز', 'مدفوع جزئياً', 'مدفوع'].map((s) => (
            <span key={s} className={`site-legend-item status-${s.replace(/\s/g, '-')}`}>
              {s}
            </span>
          ))}
        </div>
        <div className="site-grid">
          {sites.map((site) => {
            const holder = byId.get(site.exhibitor_id)
            const status = siteStatus(site, holder)
            return (
              <button
                key={site.id}
                className={`site-tile status-${status.replace(/\s/g, '-')}`}
                style={{ '--tier': colorOf.get(`${site.tier}|${Number(site.price)}`) }}
                onClick={() => setAssigning(site)}
                title={`${site.number} • ${site.tier} • ${formatOMR(site.price)}${holder ? ` • ${holder.brand}` : ''}`}
              >
                <span className="site-num">{site.number}</span>
                <span className="site-name">{holder ? holder.brand : `${Number(site.price)} ر.ع`}</span>
              </button>
            )
          })}
        </div>
      </Panel>

      {tierForm && (
        <TierForm
          exhibitionId={exhibition.id}
          tier={tierForm.tier}
          takenNumbers={taken}
          onClose={() => setTierForm(null)}
          onSaved={() => {
            setTierForm(null)
            onChanged()
          }}
        />
      )}
      {importing && (
        <ImportModal
          exhibitionId={exhibition.id}
          existingSites={sites.length}
          exhibitors={exhibitors}
          onClose={() => setImporting(false)}
          onDone={() => {
            setImporting(false)
            onChanged()
          }}
        />
      )}
      {assigning && (
        <AssignModal
          site={assigning}
          exhibitors={exhibitors}
          holder={byId.get(assigning.exhibitor_id) || null}
          onClose={() => setAssigning(null)}
          onSaved={() => {
            setAssigning(null)
            onChanged()
          }}
        />
      )}
    </>
  )
}
