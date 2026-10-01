import { useRef, useState } from 'react'
import { addSites, applyImport, assignSite, deleteAllSites, deleteTier, setTierNumbers, updateTier } from '../../api/exhibitionFile.js'
import Button from '../../components/Button.jsx'
import Field from '../../components/Field.jsx'
import Modal from '../../components/Modal.jsx'
import Panel from '../../components/Panel.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { useCan, useCanEdit } from '../../context/AuthContext.jsx'
import { DEFAULT_TIERS } from '../../lib/constants.js'
import { tiersOf } from '../../lib/finance.js'
import { formatOMR } from '../../lib/format.js'
import { matchPlan, planImport, readFirstSheet } from '../../lib/importSheet.js'
import { parseRanges, siteStatus, splitNumbers, tierColor, tiersFromSites } from '../../lib/sites.js'
import { tr } from '../../lib/i18n.js'
import { isPdfPath } from '../../api/maps.js'
import SiteMap from './SiteMap.jsx'

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
      if (clash.length) error = tr('هذه الأرقام موجودة مسبقاً: {0}', [clash.join(tr('، '))])
    } catch (err) {
      error = err.message
    }
  }

  const submit = async () => {
    if (!form.name.trim()) return toast(tr('اكتب اسم الفئة'), 'error')
    if (!editing && (!preview?.length || error)) return toast(error || tr('اكتب أرقام المواقع'), 'error')
    setSaving(true)
    try {
      if (editing) await updateTier(exhibitionId, tier.name, tier.price, { tier: form.name.trim(), price: form.price })
      else await addSites(exhibitionId, preview, form.name.trim(), form.price)
      toast(editing ? tr('✅ تم تحديث الفئة') : tr('✅ تمت إضافة {0} موقع', [preview.length]))
      onSaved()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={editing ? tr('تعديل فئة "{0}"', [tier.name]) : tr('إضافة مواقع')}
      subtitle={editing ? tr('يطبّق على {0} موقع ({1})', [tier.count, tier.ranges]) : tr('أضف مجموعة مواقع بنفس الفئة والسعر')}
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
      {!editing && (
        <Field
          label={tr('أرقام المواقع')}
          required
          hint={error ? <span className="text-dng">{error}</span> : preview ? tr('{0} موقع', [preview.length]) : tr('مثال: 1-6 أو 7-20, 23-30, 33-40 أو 21, 22, 31, 32')}
        >
          <input className="input" dir="ltr" placeholder="7-20, 23-30" value={form.numbers} onChange={set('numbers')} />
        </Field>
      )}
      <div className="form-grid">
        <Field label={tr('اسم الفئة')} required hint={tr('مثال: ركن مدخل، صف داخلي، أحمر فاتح')}>
          <input className="input" value={form.name} onChange={set('name')} />
        </Field>
        <Field label={tr('السعر (ر.ع)')}>
          <input className="input" type="number" min="0" step="0.001" value={form.price} onChange={set('price')} />
        </Field>
      </div>
      {editing && <div className="muted tiny">{tr('تغيير السعر هنا يغيّر سعر الخارطة فقط، ولا يغيّر عقود المشاركين الحالية.')}</div>}
    </Modal>
  )
}

/** Re-split the site numbers between the tiers, so each number has the price printed on the map. */
function NumbersModal({ exhibitionId, sites, tiers, onClose, onSaved }) {
  const toast = useToast()
  const [texts, setTexts] = useState(tiers.map((t) => t.ranges.replace(/،/g, ',')))
  const [saving, setSaving] = useState(false)
  const check = splitNumbers(sites.map((s) => s.number), texts)
  const bookedMoves = check.numbers
    ? sites.filter((s) => s.exhibitor_id && check.numbers.findIndex((list) => list.includes(s.number)) !== tiers.findIndex((t) => t.name === s.tier && t.price === Number(s.price)))
    : []

  const submit = async () => {
    if (check.error) return toast(check.error, 'error')
    setSaving(true)
    try {
      await setTierNumbers(exhibitionId, tiers.map((t, i) => ({ name: t.name, price: t.price, numbers: check.numbers[i] })))
      toast(tr('✅ تم تحديث أرقام الفئات'))
      onSaved()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={tr('توزيع أرقام المواقع على الفئات')}
      subtitle={tr('اكتب أرقام كل فئة كما في الخارطة المطبوعة — كل رقم في فئة واحدة')}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {tr('إلغاء')}
          </Button>
          <Button onClick={submit} disabled={saving || Boolean(check.error)}>
            {saving ? tr('جاري...') : tr('حفظ')}
          </Button>
        </>
      }
    >
      {tiers.map((t, i) => (
        <Field
          key={t.name + t.price}
          label={
            <>
              <span className="tier-dot" style={{ '--tier': tierColor(t.name, i) }} />
              {tr(t.name)} — {formatOMR(t.price)}
            </>
          }
          hint={check.numbers ? tr('{0} موقع', [check.numbers[i].length]) : undefined}
        >
          <input className="input" dir="ltr" value={texts[i]} onChange={(e) => setTexts(texts.map((x, j) => (j === i ? e.target.value : x)))} placeholder="7-20, 23-30, 33-40" />
        </Field>
      ))}
      {check.error && <div className="alert alert-danger">⚠️ {check.error}</div>}
      {bookedMoves.length > 0 && (
        <div className="alert alert-warning">
          {tr('مواقع محجوزة سيتغيّر سعرها: {0}. قيمة عقود أصحابها لا تتغيّر — عدّلها من المشاركين إن لزم.', [bookedMoves.map((s) => s.number).join(tr('، '))])}
        </div>
      )}
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
      toast(chosen ? tr('✅ الموقع {0} لـ {1}', [site.number, chosen.brand]) : tr('✅ الموقع {0} أصبح متاحاً', [site.number]))
      onSaved()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={tr('الموقع رقم {0}', [site.number])}
      subtitle={`${site.tier} • ${formatOMR(site.price)}`}
      size="sm"
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {tr('إلغاء')}
          </Button>
          <Button onClick={submit} disabled={saving || !changed}>
            {saving ? tr('جاري...') : tr('حفظ')}
          </Button>
        </>
      }
    >
      <Field label={tr('المشارك')} hint={exhibitors.length ? undefined : tr('أضف المشاركين أولاً من تبويب "المشاركون"')}>
        <select className="input" value={exhibitorId} onChange={(e) => setExhibitorId(e.target.value)}>
          <option value="">{tr('— متاح (بدون مشارك) —')}</option>
          {exhibitors.map((e) => (
            <option key={e.id} value={e.id}>
              {tr(e.brand)}
              {e.booth && e.booth !== '—' ? tr(' (يملك: {0})', [e.booth]) : ''}
            </option>
          ))}
        </select>
      </Field>
      {changed && (
        <label className="check-row">
          <input type="checkbox" checked={adjust} onChange={(e) => setAdjust(e.target.checked)} />
          <span>
            {chosen && holder
              ? tr('نقل سعر الموقع ({0}) من عقد {1} إلى عقد {2}', [formatOMR(site.price), holder.brand, chosen.brand])
              : chosen
                ? tr('إضافة سعر الموقع ({0}) إلى قيمة عقد {1}', [formatOMR(site.price), chosen.brand])
                : tr('خصم سعر الموقع ({0}) من عقد {1}', [formatOMR(site.price), holder.brand])}
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
    if (needsReplace && !replace) return toast(tr('وافق على استبدال الخارطة الحالية أولاً'), 'error')
    running.current = true
    setProgress({ done: 0, total: matched.participants.length })
    try {
      await applyImport(exhibitionId, plan, matched, { replaceSites: needsReplace && replace }, (done, total) => setProgress({ done, total }))
      toast(tr('✅ تم الاستيراد: {0} موقع، {1} مشارك جديد، {2} تحديث', [plan.sites.length, matched.created, matched.updated]))
      onDone()
    } catch (err) {
      toast(tr('{0} — يمكنك إعادة المحاولة بأمان، لن تتكرر البيانات.', [err.message]), 'error')
      setProgress(null)
      running.current = false
    }
  }

  const tiers = plan ? tiersFromSites(plan.sites) : []

  return (
    <Modal
      title={tr('📥 استيراد من ملف Excel')}
      subtitle={tr('ملف تسجيل المشاركين: رقم الكشك، لون الموقع، السعر، المبلغ المدفوع، اسم المشارك، الشركة، الهاتف، النشاط')}
      size="lg"
      onClose={progress ? () => {} : onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={Boolean(progress)}>
            {tr('إلغاء')}
          </Button>
          <Button onClick={run} disabled={!plan || Boolean(progress) || (needsReplace && !replace)}>
            {progress ? tr('جاري الاستيراد... {0}/{1}', [progress.done, progress.total]) : tr('تأكيد الاستيراد')}
          </Button>
        </>
      }
    >
      <label className="file-drop">
        <input type="file" accept=".xlsx" onChange={onFile} disabled={Boolean(progress)} />
        <span>📄 {fileName || tr('اختر ملف .xlsx')}</span>
      </label>
      {error && <div className="alert alert-danger mt-12">⚠️ {error}</div>}

      {plan && (
        <>
          <div className="grid-4 mt-14 mb-16">
            <div className="mini-stat">
              <span>{tr('المواقع')}</span>
              <strong>{tr(plan.totals.sites)}</strong>
            </div>
            <div className="mini-stat">
              <span>{tr('الإيراد الكامل')}</span>
              <strong>{formatOMR(plan.totals.fullRevenue)}</strong>
            </div>
            <div className="mini-stat">
              <span>{tr('المشاركون: جديد / تحديث')}</span>
              <strong>
                {tr(matched.created)} / {tr(matched.updated)}
              </strong>
            </div>
            <div className="mini-stat">
              <span>{tr('العقود / المدفوع')}</span>
              <strong>
                {formatOMR(plan.totals.contract)} / {formatOMR(plan.totals.paid)}
              </strong>
            </div>
          </div>

          {needsReplace && (
            <div className="alert alert-warning">
              <div>
                <strong>{tr('هذا المعرض لديه خارطة حالية (')}{tr(existingSites)}{' '}{tr('موقع).')}</strong>
                <div className="mt-8">
                  {tr('الاستيراد يستبدلها بخارطة الملف. المشاركون الحاليون')}{' '}<strong>{tr('لا يُحذفون')}</strong>{tr(': من يطابق الملف (بالهاتف أو الاسم) يُحدَّث ولا يتكرر، ودفعاتهم المسجلة تبقى كما هي.')}
                </div>
                <label className="check-row mt-8">
                  <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
                  <span>{tr('أوافق على استبدال الخارطة الحالية')}</span>
                </label>
              </div>
            </div>
          )}

          <div className="section-label">{tr('الفئات المكتشفة')}</div>
          <div className="tier-legend mb-16">
            {tiers.map((t, i) => (
              <span key={t.name + t.price} className="tier-pill" style={{ '--tier': tierColor(t.name, i) }}>
                {tr(t.name)}: {t.count} × {t.price}{' '}{tr('ر.ع (')}{tr(t.ranges)})
              </span>
            ))}
          </div>

          <div className="section-label">{tr('المشاركون')}</div>
          <div className="table-wrap mb-16">
            <table className="table table-compact">
              <thead>
                <tr>
                  <th>{tr('المواقع')}</th>
                  <th>{tr('الشركة')}</th>
                  <th>{tr('المشارك')}</th>
                  <th>{tr('الهاتف')}</th>
                  <th>{tr('العقد')}</th>
                  <th>{tr('المدفوع')}</th>
                  <th>{tr('الإجراء')}</th>
                </tr>
              </thead>
              <tbody>
                {matched.participants.map((p) => (
                  <tr key={p.numbers.join('-')}>
                    <td>{p.numbers.join(tr('، '))}</td>
                    <td className="strong">{tr(p.brand)}</td>
                    <td>{tr(p.manager)}</td>
                    <td className="ltr">{tr(p.phone)}</td>
                    <td className="num">{formatOMR(p.contract)}</td>
                    <td className="num">{formatOMR(p.paid)}</td>
                    <td className="small">
                      {p.existing ? <span className="badge badge-info">{tr('تحديث')}</span> : <span className="badge badge-success">{tr('جديد')}</span>}
                      {p.paidToRecord > 0 && <div className="tiny muted mt-8">{tr('دفعة +')}{formatOMR(p.paidToRecord)}</div>}
                      {p.paidAhead > 0 && <div className="tiny text-wrn mt-8">{tr('مسجل في النظام أكثر من الملف بـ')}{' '}{formatOMR(p.paidAhead)}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {matched.untouched.length > 0 && (
            <div className="alert alert-warning">
              <div>
                <strong>{tr('مشاركون مسجلون في هذا المعرض وغير موجودين في الملف (')}{matched.untouched.length}):</strong>{' '}
                {matched.untouched.map((e) => e.brand).join(tr('، '))}
                <div className="mt-8">{tr('لن يُحذفوا،')}{' '}{needsReplace ? tr('لكنهم سيبقون بدون موقع في الخارطة الجديدة.') : tr('ويمكنك حجز مواقع لهم من الخارطة بعد الاستيراد.')}</div>
              </div>
            </div>
          )}

          {plan.warnings.length > 0 && (
            <div className="alert alert-warning">
              <div>
                <strong>{tr('ملاحظات راجعها (')}{plan.warnings.length}):</strong>
                <ul className="warn-list">
                  {plan.warnings.map((w) => (
                    <li key={w}>{tr(w)}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
          <div className="muted tiny">
            {tr('المبالغ المدفوعة الجديدة تُسجَّل كدفعات بطريقة "غير محدد" — يمكنك تعديل طريقة الدفع لاحقاً من «المالية ← الإيرادات والدفعات». يمكن إعادة الاستيراد بأمان لتحديث البيانات من نسخة أحدث من الملف.')}
          </div>
        </>
      )}
    </Modal>
  )
}

export default function SitesTab({ exhibition, sites, exhibitors, canManage = true, onChanged }) {
  const canEdit = useCanEdit() // a marketer books sites only for their own participants
  const canWrite = useCan('data.write') // the viewer only looks
  const money = useCan('money.view') // contract and paid amounts — not for marketing
  const toast = useToast()
  const [tierForm, setTierForm] = useState(null) // { tier } | { tier: null }
  const [assigning, setAssigning] = useState(null)
  const [importing, setImporting] = useState(false)
  const [renumbering, setRenumbering] = useState(false)

  const byId = new Map(exhibitors.map((e) => [e.id, e]))
  const tiers = tiersFromSites(sites)
  const colorOf = new Map(tiers.map((t, i) => [`${t.name}|${t.price}`, tierColor(t.name, i)]))
  const taken = new Set(sites.map((s) => s.number))

  /** Open the booking of one site — a marketer only for their own participants. */
  const book = (site) => {
    if (!canWrite) return
    const holder = byId.get(site.exhibitor_id)
    if (holder && !canEdit(holder)) return toast(tr('الموقع {0} محجوز لـ {1} — أدخله مسوق آخر، والتعديل للإدارة أو لمن أدخله', [site.number, holder.brand]), 'error')
    setAssigning(sites.find((s) => s.id === site.id) || site)
  }

  const fromPlan = async () => {
    const plan = tiersOf(exhibition, DEFAULT_TIERS).filter((t) => t.count > 0)
    if (!plan.length) return toast(tr('لا توجد فئات مبدئية لهذا المعرض'), 'error')
    try {
      let next = 1
      for (const t of plan) {
        const numbers = Array.from({ length: t.count }, (_, i) => next + i)
        next += t.count
        await addSites(exhibition.id, numbers, t.name, t.price)
      }
      toast(tr('✅ تم إنشاء {0} موقع', [next - 1]))
      onChanged()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  const removeTier = async (t) => {
    const held = sites.filter((s) => s.tier === t.name && Number(s.price) === t.price && s.exhibitor_id).length
    if (!confirm(tr('حذف فئة "{0}" ({1} موقع)؟', [t.name, t.count]) + (held ? '\n' + tr('{0} منها محجوزة وسيُفك ربطها بالمشاركين.', [held]) : ''))) return
    try {
      await deleteTier(exhibition.id, t.name, t.price)
      toast(tr('🗑️ تم حذف الفئة'))
      onChanged()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  const clearAll = async () => {
    if (!confirm(tr('حذف خارطة المواقع كاملة ({0} موقع)؟ المشاركون ودفعاتهم لا يُحذفون.', [sites.length]))) return
    try {
      await deleteAllSites(exhibition.id)
      toast(tr('🗑️ تم حذف الخارطة'))
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
          <div className="strong mb-8">{tr('لم تُضف خارطة المواقع بعد')}</div>
          <div className="small mb-16">
            {canManage ? tr('أضف أرقام المواقع وفئاتها وأسعارها، أو استوردها مع المشاركين من ملف Excel.') : tr('تُضاف الخارطة من قبل الإدارة أو المالية.')}
          </div>
          {canManage && (
          <div className="page-actions center-actions">
            <Button onClick={() => setImporting(true)}>{tr('📥 استيراد من Excel')}</Button>
            <Button variant="outline" onClick={() => setTierForm({ tier: null })}>
              {tr('+ إضافة مواقع يدوياً')}
            </Button>
            {plan.length > 0 && (
              <Button variant="outline" onClick={fromPlan}>
                {tr('⚡ إنشاء من الفئات المبدئية (')}{plan.map((t) => `${t.count} ${t.name}`).join(tr('، '))})
              </Button>
            )}
          </div>
          )}
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
      {exhibition.map_path && !isPdfPath(exhibition.map_path) && (
        <SiteMap
          key={exhibition.map_path}
          path={exhibition.map_path}
          sites={sites}
          exhibitors={exhibitors}
          canManage={canManage}
          canWrite={canWrite}
          money={money}
          onBook={book}
          onChanged={onChanged}
        />
      )}
      <Panel
        icon="🏷️"
        title={tr('الفئات والأسعار')}
        subtitle={canManage ? tr('{0} موقع • {1} عند البيع الكامل', [sites.length, formatOMR(tiers.reduce((t, x) => t + x.total, 0))]) : tr('{0} موقع', [sites.length])}
        className="mb-16"
        action={
          canManage && (
          <div className="row-actions">
            <Button size="sm" onClick={() => setTierForm({ tier: null })}>
              {tr('+ إضافة مواقع')}
            </Button>
            {tiers.length > 1 && (
              <Button size="sm" variant="outline" onClick={() => setRenumbering(true)}>
                {tr('🔢 توزيع الأرقام على الفئات')}
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => setImporting(true)}>
              {tr('📥 استيراد / تحديث من Excel')}
            </Button>
            <Button size="sm" variant="danger" onClick={clearAll}>
              {tr('حذف الخارطة')}
            </Button>
          </div>
          )
        }
      >
        <div className="table-wrap">
          <table className="table table-compact">
            <thead>
              <tr>
                <th>{tr('الفئة')}</th>
                <th>{tr('أرقام المواقع')}</th>
                <th>{tr('العدد')}</th>
                <th>{tr('المحجوز')}</th>
                <th>{tr('السعر')}</th>
                {canManage && <th>{tr('الإجمالي')}</th>}
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
                      <strong>{tr(t.name)}</strong>
                    </td>
                    <td className="small">{tr(t.ranges)}</td>
                    <td className="center">{t.count}</td>
                    <td className="center">{booked}</td>
                    <td className="num">{formatOMR(t.price)}</td>
                    {canManage && <td className="num strong">{formatOMR(t.total)}</td>}
                    <td>
                      {canManage && (
                      <div className="row-actions">
                        <Button size="sm" variant="outline" onClick={() => setTierForm({ tier: t })} title={tr('تعديل')}>
                          ✏️
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => removeTier(t)} title={tr('حذف')}>
                          🗑️
                        </Button>
                      </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel icon="🗺️" title={tr('خارطة المواقع')} subtitle={tr('اضغط على أي موقع لحجزه لمشارك أو تحريره')} bodyClass="panel-pad">
        <div className="site-legend">
          {[tr('متاح'), tr('محجوز'), tr('مدفوع جزئياً'), tr('مدفوع')].map((s) => (
            <span key={s} className={`site-legend-item status-${s.replace(/\s/g, '-')}`}>
              {tr(s)}
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
                onClick={() => book(site)}
                title={`${site.number} • ${site.tier} • ${formatOMR(site.price)}${holder ? ` • ${holder.brand}` : ''}`}
              >
                <span className="site-num">{site.number}</span>
                <span className="site-name">{holder ? holder.brand : tr('{0} ر.ع', [Number(site.price)])}</span>
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
      {renumbering && (
        <NumbersModal
          exhibitionId={exhibition.id}
          sites={sites}
          tiers={tiers}
          onClose={() => setRenumbering(false)}
          onSaved={() => {
            setRenumbering(false)
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
          exhibitors={exhibitors.filter(canEdit)}
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
