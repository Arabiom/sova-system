import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { clientWithPhone, deleteClient, findClient, listClients, saveClient } from '../api/clients.js'
import { listStaff } from '../api/staff.js'
import { listExhibitions } from '../api/exhibitions.js'
import { listExhibitors } from '../api/exhibitors.js'
import Button from '../components/Button.jsx'
import ClientImport from '../components/ClientImport.jsx'
import { EmptyState, Loading } from '../components/Feedback.jsx'
import Field, { SelectOptions } from '../components/Field.jsx'
import Modal from '../components/Modal.jsx'
import PageHeader from '../components/PageHeader.jsx'
import StatCard from '../components/StatCard.jsx'
import StatusBadge, { Chip } from '../components/StatusBadge.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { CITIES, CLIENT_SOURCES, CLIENT_STATUSES, SECTOR_SUGGESTIONS } from '../lib/constants.js'
import { downloadCsv } from '../lib/csv.js'
import { clientHistory } from '../lib/finance.js'
import { exhibitionLabel, exhibitionTitle, formatDate, formatOMR, phoneKey, todayISO } from '../lib/format.js'
import { useData } from '../lib/useData.js'
import { openWhatsApp } from '../lib/whatsapp.js'
import { useAuth, useCan, useCanEdit } from '../context/AuthContext.jsx'
import { tr } from '../lib/i18n.js'

const load = async () => {
  const [clients, exhibitors, exhibitions] = await Promise.all([
    listClients(),
    listExhibitors({ columns: 'id,client_id,exhibition_id,brand,booth,contract,paid,status' }),
    listExhibitions(),
  ])
  const staff = await listStaff().catch(() => []) // names of who added each client (admin/finance)
  return { clients, exhibitors, exhibitions, staff }
}

const SORTS = {
  name: { label: tr('الاسم'), fn: (a, b) => a.name.localeCompare(b.name, 'ar') },
  recent: { label: tr('الأحدث إضافة'), fn: (a, b) => String(b.created_at).localeCompare(String(a.created_at)) },
  count: { label: tr('الأكثر مشاركة'), fn: (a, b) => b.h.count - a.h.count },
  paid: { label: tr('الأعلى دفعاً'), fn: (a, b) => b.h.paid - a.h.paid },
  outstanding: { label: tr('الأعلى متبقياً'), fn: (a, b) => b.h.outstanding - a.h.outstanding },
  last: {
    label: tr('آخر مشاركة'),
    fn: (a, b) => String(b.h.lastExhibition?.date_from || '').localeCompare(String(a.h.lastExhibition?.date_from || '')),
  },
}

const distinct = (values) => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ar'))

/** "هذا المشروع تمت إضافته من قبل: «X» — أضافه أحمد بتاريخ …" */
const duplicateText = (c) =>
  tr('هذا المشروع تمت إضافته من قبل: «{0}» — أضافه {1} بتاريخ {2}', [c.name, c.owner_is_me ? tr('أنت') : c.owner_name, formatDate(c.created_at)])

/** Check any number or name against the whole company database before adding a project. */
function LookupBox() {
  const [q, setQ] = useState('')
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const run = async (e) => {
    e?.preventDefault()
    if (q.trim().length < 3) return toast(tr('اكتب رقم الهاتف أو 3 أحرف من الاسم على الأقل'), 'error')
    setBusy(true)
    try {
      setResult(await findClient(q))
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setBusy(false)
    }
  }
  return (
    <form className="panel panel-pad mb-16 lookup-box" onSubmit={run}>
      <div className="strong mb-8">{tr('🔎 هل المشروع مسجل في قاعدة الشركة؟')}</div>
      <div className="input-with-action">
        <input className="input" placeholder={tr('رقم الهاتف أو اسم المشروع')} value={q} onChange={(e) => setQ(e.target.value)} />
        <Button type="submit" disabled={busy}>
          {busy ? '...' : tr('بحث')}
        </Button>
      </div>
      {result && (
        <div className="mt-8">
          {result.length ? (
            result.map((c) => (
              <div key={c.id} className={`alert ${c.matched_by === 'phone' ? 'alert-danger' : 'alert-warning'} mb-8`}>
                {c.matched_by === 'phone' ? tr('⛔ الرقم مسجل: ') : tr('اسم مشابه: ')}«{tr(c.name)}{tr('» — أضافه')}{' '}{c.owner_is_me ? tr('أنت') : c.owner_name}{' '}{tr('بتاريخ')}{' '}{formatDate(c.created_at)}
              </div>
            ))
          ) : (
            <div className="alert alert-success">{tr('✓ غير مسجل — يمكنك إضافته')}</div>
          )}
        </div>
      )}
    </form>
  )
}

function ClientForm({ initial, id, onClose, onSaved, sectors }) {
  const toast = useToast()
  const [form, setForm] = useState(initial)
  const [saving, setSaving] = useState(false)
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  const [duplicate, setDuplicate] = useState(null) // the client already registered with this number

  // One number = one client in the whole company database (migration 010).
  const checkPhone = async (phone = form.phone) => {
    try {
      const found = await clientWithPhone(phone)
      const other = found && found.id !== id ? found : null
      setDuplicate(other)
      return other
    } catch {
      return null
    }
  }

  const submit = async () => {
    if (!form.name?.trim()) return toast(tr('اكتب اسم العميل أو العلامة التجارية'), 'error')
    const taken = phoneKey(form.phone) ? await checkPhone() : null
    if (taken) return toast(duplicateText(taken), 'error')
    setSaving(true)
    try {
      await saveClient(form, id)
      toast(id ? tr('✅ تم تحديث العميل') : tr('✅ تمت إضافة العميل'))
      onSaved()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={id ? tr('تعديل بيانات العميل') : tr('إضافة عميل جديد')}
      onClose={onClose}
      size="wide"
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
        <Field label={tr('اسم العميل / العلامة التجارية')} required>
          <input className="input" value={form.name || ''} onChange={set('name')} />
        </Field>
        <Field label={tr('الشخص المسؤول')}>
          <input className="input" value={form.contact_name || ''} onChange={set('contact_name')} />
        </Field>
        <Field label={tr('الهاتف')} hint={tr('رقم واحد لكل مشروع — لا يُسجَّل الرقم مرتين في قاعدة الشركة')}>
          <input
            className={`input ${duplicate ? 'input-invalid' : ''}`}
            type="tel"
            dir="ltr"
            placeholder="9XXXXXXX"
            value={form.phone || ''}
            onChange={(e) => {
              set('phone')(e)
              setDuplicate(null)
            }}
            onBlur={() => checkPhone()}
          />
        </Field>
        <Field label={tr('واتساب')} hint={tr('اتركه فارغاً إذا كان نفس رقم الهاتف')}>
          <input className="input" type="tel" dir="ltr" value={form.whatsapp || ''} onChange={set('whatsapp')} />
        </Field>
        <Field label={tr('البريد الإلكتروني')}>
          <input className="input" type="email" dir="ltr" value={form.email || ''} onChange={set('email')} />
        </Field>
        <Field label={tr('إنستقرام')}>
          <input className="input" dir="ltr" placeholder="@account" value={form.instagram || ''} onChange={set('instagram')} />
        </Field>
        <Field label={tr('القطاع / النشاط')}>
          <input className="input" list="sector-list" value={form.sector || ''} onChange={set('sector')} />
          <datalist id="sector-list">
            {sectors.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </Field>
        <Field label={tr('المدينة')}>
          <input className="input" list="city-list" value={form.city || ''} onChange={set('city')} />
          <datalist id="city-list">
            {CITIES.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field label={tr('مصدر العميل')}>
          <SelectOptions options={CLIENT_SOURCES} value={form.source || ''} onChange={set('source')} />
        </Field>
        <Field label={tr('الحالة')}>
          <SelectOptions options={CLIENT_STATUSES} placeholder={null} value={form.status || 'نشط'} onChange={set('status')} />
        </Field>
      </div>
      {duplicate && <div className="alert alert-danger">⚠️ {duplicateText(duplicate)}</div>}
      <Field label={tr('ملاحظات')}>
        <textarea className="input" rows={3} value={form.notes || ''} onChange={set('notes')} />
      </Field>
    </Modal>
  )
}

function ClientDetails({ client, onClose, onEdit }) {
  const { h } = client
  const money = useCan('money.view') // marketing: participation history without amounts
  const rows = [
    ['👤 المسؤول', client.contact_name],
    ['📱 الهاتف', client.phone],
    ['💬 واتساب', client.whatsapp],
    ['📧 البريد', client.email],
    ['📸 إنستقرام', client.instagram],
    ['🏷️ القطاع', client.sector],
    ['📍 المدينة', client.city],
    ['🔎 المصدر', client.source],
    ['📝 ملاحظات', client.notes],
  ].filter(([, v]) => v)

  return (
    <Modal
      title={client.name}
      subtitle={tr('{0} مشاركة • آخرها {1}', [h.count, h.lastExhibition ? exhibitionLabel(h.lastExhibition) : '—'])}
      onClose={onClose}
      size="wide"
      footer={
        <>
          {(client.whatsapp || client.phone) && (
            <Button variant="whatsapp" onClick={() => openWhatsApp(client.whatsapp || client.phone, '')}>
              {tr('📱 واتساب')}
            </Button>
          )}
          {onEdit && (
            <Button variant="outline" onClick={onEdit}>
              {tr('✏️ تعديل')}
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>
            {tr('إغلاق')}
          </Button>
        </>
      }
    >
      {money && (
      <div className="grid-3 mb-16">
        <StatCard flat label={tr('إجمالي العقود')} value={formatOMR(h.contract)} accent="var(--ink)" />
        <StatCard flat label={tr('المدفوع')} value={formatOMR(h.paid)} accent="var(--suc)" />
        <StatCard flat label={tr('المتبقي')} value={formatOMR(h.outstanding)} accent={h.outstanding > 0 ? 'var(--wrn)' : 'var(--suc)'} />
      </div>
      )}
      {rows.map(([label, value]) => (
        <div key={label} className="detail-row">
          <span className="detail-label">{tr(label)}</span>
          <strong className="detail-value">{tr(value)}</strong>
        </div>
      ))}
      <div className="section-label mt-14">{tr('سجل المشاركات')}</div>
      {h.participations.length ? (
        <div className="table-wrap">
          <table className="table table-numbered table-compact">
            <thead>
              <tr>
                <th>{tr('المعرض')}</th>
                <th>{tr('الموقع')}</th>
                {money && <th>{tr('العقد')}</th>}
                {money && <th>{tr('المدفوع')}</th>}
                <th>{tr('الحالة')}</th>
              </tr>
            </thead>
            <tbody>
              {h.participations.map((p) => (
                <tr key={p.id}>
                  <td>
                    {p.exhibition ? <Link to={`/exhibitions/${p.exhibition.id}`}>{exhibitionLabel(p.exhibition)}</Link> : '—'}
                  </td>
                  <td>{p.booth || '—'}</td>
                  {money && <td className="num">{formatOMR(p.contract)}</td>}
                  {money && <td className="num">{formatOMR(p.paid)}</td>}
                  <td>
                    <StatusBadge status={p.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-inline">{tr('لم يشارك في أي معرض بعد')}</div>
      )}
    </Modal>
  )
}

export default function Clients() {
  const toast = useToast()
  const canDelete = useCan('records.delete')
  const money = useCan('money.view') // marketing: names and details, no amounts
  const canEdit = useCanEdit() // a marketer edits only the clients they entered
  const everyone = useCan('records.viewAll') // admin/finance/viewer see the whole database; others their own clients
  const canWrite = useCan('data.write') // the viewer only looks
  const { session } = useAuth()
  const { data, loading, reload } = useData(load, null)
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState({ sector: '', city: '', status: '', source: '', participation: '' })
  const [sort, setSort] = useState('name')
  const [editing, setEditing] = useState(null)
  const [viewing, setViewing] = useState(null)
  const [shows, setShows] = useState([]) // exhibitions whose clients to show (none = everyone)
  const [importing, setImporting] = useState(false)
  const navigate = useNavigate()

  if (loading || !data) return <Loading />
  const { clients, exhibitors, exhibitions, staff } = data
  const addedBy = (c) => {
    if (!c.created_by) return '—'
    if (c.created_by === session?.user?.id) return tr('أنت')
    const s = staff.find((x) => x.user_id === c.created_by)
    return s?.name || s?.email || '—'
  }
  // Numbers registered more than once before duplicates were blocked (manager's clean-up list).
  const duplicateGroups = everyone
    ? Object.values(
        clients.reduce((groups, c) => {
          const key = phoneKey(c.phone)
          if (key) (groups[key] ||= []).push(c)
          return groups
        }, {}),
      ).filter((g) => g.length > 1)
    : []

  const enriched = clients.map((c) => ({ ...c, h: clientHistory(c, exhibitors, exhibitions) }))
  const sectors = distinct([...SECTOR_SUGGESTIONS, ...clients.map((c) => c.sector)])
  const cities = distinct(clients.map((c) => c.city))
  const setFilter = (key) => (e) => setFilters((f) => ({ ...f, [key]: e.target.value }))

  // Clients of the chosen exhibitions (any of them); everyone when none is chosen.
  const tookPart = (c, ids) => c.h.participations.some((p) => ids.includes(p.exhibition_id))
  const base = shows.length ? enriched.filter((c) => tookPart(c, shows)) : enriched
  const byExhibition = [...exhibitions]
    .sort((a, b) => String(b.date_from).localeCompare(String(a.date_from)))
    .map((ex) => ({ ex, count: enriched.filter((c) => tookPart(c, [ex.id])).length }))
  const toggleShow = (id) => setShows((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  const clearAll = () => {
    setSearch('')
    setShows([])
    setFilters({ sector: '', city: '', status: '', source: '', participation: '' })
  }
  const only = (patch) => setFilters({ sector: '', city: '', status: '', source: '', participation: '', ...patch })

  const q = search.trim().toLowerCase()
  const visible = base
    .filter(
      (c) =>
        (!q || [c.name, c.contact_name, c.phone, c.whatsapp, c.email, c.instagram].some((v) => v?.toLowerCase().includes(q))) &&
        (!filters.sector || c.sector === filters.sector) &&
        (!filters.city || c.city === filters.city) &&
        (!filters.status || c.status === filters.status) &&
        (!filters.source || c.source === filters.source) &&
        (!filters.participation ||
          (filters.participation === 'none' && c.h.count === 0) ||
          (filters.participation === 'once' && c.h.count === 1) ||
          (filters.participation === 'repeat' && c.h.count > 1) ||
          (filters.participation === 'owing' && c.h.outstanding > 0)),
    )
    .sort(SORTS[sort].fn)

  const active = Object.values(filters).some(Boolean) || q || shows.length > 0

  const remove = async (c) => {
    const note = c.h.count ? ` ${tr('(سجل مشاركاته في المعارض يبقى، لكن بدون ربط بالعميل)')}` : ''
    if (!confirm(tr('حذف العميل "{0}"؟{1}', [c.name, note]))) return
    try {
      await deleteClient(c.id)
      toast(tr('🗑️ تم الحذف'))
      setViewing(null)
      reload()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  const exportCsv = () =>
    downloadCsv(`AIB-Clients-${todayISO()}.csv`, visible, [
      { label: tr('الاسم'), value: (c) => c.name },
      { label: tr('المسؤول'), value: (c) => c.contact_name },
      { label: tr('الهاتف'), value: (c) => c.phone },
      { label: tr('واتساب'), value: (c) => c.whatsapp },
      { label: tr('البريد'), value: (c) => c.email },
      { label: tr('إنستقرام'), value: (c) => c.instagram },
      { label: tr('القطاع'), value: (c) => c.sector },
      { label: tr('المدينة'), value: (c) => c.city },
      { label: tr('المصدر'), value: (c) => c.source },
      { label: tr('الحالة'), value: (c) => c.status },
      { label: tr('عدد المشاركات'), value: (c) => c.h.count },
      { label: tr('آخر معرض'), value: (c) => (c.h.lastExhibition ? exhibitionTitle(c.h.lastExhibition) : '') },
      ...(money
        ? [
            { label: tr('إجمالي العقود'), value: (c) => c.h.contract.toFixed(3) },
            { label: tr('المدفوع'), value: (c) => c.h.paid.toFixed(3) },
            { label: tr('المتبقي'), value: (c) => c.h.outstanding.toFixed(3) },
          ]
        : []),
      { label: tr('ملاحظات'), value: (c) => c.notes },
      ...(everyone ? [{ label: tr('أضافه'), value: (c) => addedBy(c) }] : []),
    ])

  // The cards count the chosen exhibitions' clients (or everyone), and clicking one filters by it.
  const totals = {
    all: base.length,
    active: base.filter((c) => c.status === 'نشط').length,
    repeat: base.filter((c) => c.h.count > 1).length,
    owing: base.filter((c) => c.h.outstanding > 0).length,
  }

  return (
    <>
      <PageHeader
        title={everyone ? tr('العملاء') : tr('عملائي')}
        subtitle={everyone ? tr('قاعدة بيانات كل عملاء الشركة، ومن أضاف كل عميل، وسجل مشاركاتهم') : tr('المشاريع التي أضفتها — ابحث أولاً للتأكد أن المشروع غير مسجل')}
      >
        <Button variant="outline" onClick={exportCsv} disabled={!visible.length}>
          {tr('⬇️ تصدير Excel')}
        </Button>
        {canWrite && (
          <Button variant="whatsapp" onClick={() =>
              navigate('/whatsapp', {
                state: {
                  audience: 'client',
                  keys: visible.map((c) => `client:${c.id}`),
                  template: 'invitation',
                  exhibitionId: exhibitions.find((e) => e.date_from >= todayISO())?.id || '',
                },
              })
            }
            disabled={!visible.length}
          >
            {tr('📱 واتساب للنتائج')}
          </Button>
        )}
        {canWrite && (
          <Button variant="outline" onClick={() => setImporting(true)}>
            {tr('📥 استيراد من Excel')}
          </Button>
        )}
        {canWrite && <Button onClick={() => setEditing({ form: { status: 'نشط' }, id: null })}>{tr('+ إضافة عميل')}</Button>}
      </PageHeader>

      <LookupBox />

      {duplicateGroups.length > 0 && (
        <div className="alert alert-warning">
          ⚠️ {duplicateGroups.length}{' '}{tr('رقم مسجل لأكثر من عميل (من قبل منع التكرار):')}{' '}
          {duplicateGroups
            .slice(0, 5)
            .map((g) => g.map((c) => c.name).join(' / '))
            .join(tr('، '))}
          {duplicateGroups.length > 5 ? ' …' : ''}{' '}{tr('— ادمجها أو احذف المكرر.')}
        </div>
      )}

      <div className="grid-4 mb-16">
        <StatCard flat label={shows.length ? tr('عملاء المعارض المختارة') : tr('كل العملاء')} value={totals.all} icon="👥" accent="var(--ink)" onClick={() => only({})} />
        <StatCard flat label={tr('عملاء نشطون')} value={totals.active} icon="✅" accent="var(--suc)" onClick={() => only({ status: 'نشط' })} />
        <StatCard flat label={tr('شاركوا أكثر من مرة')} value={totals.repeat} icon="🔁" accent="var(--gold)" onClick={() => only({ participation: 'repeat' })} />
        <StatCard flat label={tr('عليهم مبالغ متبقية')} value={totals.owing} icon="⏳" accent="var(--wrn)" onClick={money ? () => only({ participation: 'owing' }) : undefined} />
      </div>

      <div className="panel panel-pad mb-16">
        <div className="field-label">{tr('العملاء حسب المعرض — اختر معرضاً أو أكثر:')}</div>
        <div className="ex-chips">
          <button type="button" className={`ex-chip ${shows.length ? '' : 'selected'}`} onClick={() => setShows([])}>
            {tr('كل العملاء')} <strong>{enriched.length}</strong>
          </button>
          {byExhibition.map(({ ex, count }) => (
            <button key={ex.id} type="button" className={`ex-chip ${shows.includes(ex.id) ? 'selected' : ''} ${count ? '' : 'empty'}`} onClick={() => toggleShow(ex.id)}>
              {shows.includes(ex.id) ? '✓ ' : ''}
              {exhibitionLabel(ex)} <strong>{count}</strong>
            </button>
          ))}
        </div>
        {shows.length > 1 && <div className="muted tiny mt-8">{tr('يظهر من شارك في أي معرض من المعارض المختارة.')}</div>}
      </div>

      <div className="toolbar">
        <input className="input toolbar-search" placeholder={tr('🔍  ابحث بالاسم أو الهاتف أو البريد...')} value={search} onChange={(e) => setSearch(e.target.value)} />
        <SelectOptions className="input toolbar-select" options={sectors} placeholder={tr('كل القطاعات')} value={filters.sector} onChange={setFilter('sector')} />
        <SelectOptions className="input toolbar-select" options={cities} placeholder={tr('كل المدن')} value={filters.city} onChange={setFilter('city')} />
        <SelectOptions className="input toolbar-select" options={CLIENT_STATUSES} placeholder={tr('كل الحالات')} value={filters.status} onChange={setFilter('status')} />
        <SelectOptions className="input toolbar-select" options={CLIENT_SOURCES} placeholder={tr('كل المصادر')} value={filters.source} onChange={setFilter('source')} />
        <select className="input toolbar-select" value={filters.participation} onChange={setFilter('participation')}>
          <option value="">{tr('كل المشاركات')}</option>
          <option value="none">{tr('لم يشارك بعد')}</option>
          <option value="once">{tr('شارك مرة واحدة')}</option>
          <option value="repeat">{tr('شارك أكثر من مرة')}</option>
          {money && <option value="owing">{tr('عليه مبلغ متبقٍ')}</option>}
        </select>
        <select className="input toolbar-select" value={sort} onChange={(e) => setSort(e.target.value)} aria-label={tr('الترتيب')}>
          {Object.entries(SORTS).filter(([key]) => money || !['paid', 'outstanding'].includes(key)).map(([key, s]) => (
            <option key={key} value={key}>
              {tr('ترتيب:')}{' '}{tr(s.label)}
            </option>
          ))}
        </select>
        {active && (
          <Button
            size="sm"
            variant="ghost"
            onClick={clearAll}
          >
            {tr('✕ مسح الفلاتر')}
          </Button>
        )}
        <div className="toolbar-count">{visible.length}{' '}{tr('نتيجة')}</div>
      </div>

      <div className="panel">
        <div className="table-wrap">
          <table className="table table-numbered" style={{ minWidth: 1000 }}>
            <thead>
              <tr>
                {[tr('العميل'), tr('الهاتف'), tr('القطاع'), tr('المدينة'), tr('المشاركات'), tr('آخر معرض'), ...(money ? [tr('المدفوع'), tr('المتبقي')] : []), ...(everyone ? [tr('أضافه')] : []), tr('الحالة'), ''].map((h) => (
                  <th key={h}>{tr(h)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((c) => (
                <tr key={c.id} className="clickable" onClick={() => setViewing(c)}>
                  <td>
                    <div className="strong">{tr(c.name)}</div>
                    {c.contact_name && <div className="muted tiny">{tr(c.contact_name)}</div>}
                  </td>
                  <td className="ltr">{tr(c.phone)}</td>
                  <td>{tr(c.sector) && <Chip>{tr(c.sector)}</Chip>}</td>
                  <td className="small">{tr(c.city) || '—'}</td>
                  <td className="center strong">{c.h.count}</td>
                  <td className="small">{c.h.lastExhibition ? exhibitionLabel(c.h.lastExhibition) : '—'}</td>
                  {money && <td className="num text-suc strong">{formatOMR(c.h.paid)}</td>}
                  {money && <td className={`num ${c.h.outstanding > 0 ? 'text-dng strong' : 'muted'}`}>{formatOMR(c.h.outstanding)}</td>}
                  {everyone && <td className="small">{addedBy(c)}</td>}
                  <td>
                    <StatusBadge status={c.status} />
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div className="row-actions">
                      {canEdit(c) ? (
                        <Button size="sm" variant="outline" onClick={() => setEditing({ form: { ...c }, id: c.id })} title={tr('تعديل')}>
                          ✏️
                        </Button>
                      ) : (
                        canWrite && (
                          <span className="lock-note" title={tr('أدخله مسوق آخر — التعديل للإدارة أو لمن أدخله')}>
                            🔒
                          </span>
                        )
                      )}
{canDelete && (<Button size="sm" variant="danger" onClick={() => remove(c)} title={tr('حذف')}>
                        🗑️
                      </Button>)}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!visible.length && <EmptyState icon="👥" text={clients.length ? tr('لا توجد نتائج مطابقة للفلاتر') : tr('لا يوجد عملاء بعد — أضف عميلاً أو استورد ملف مشاركين من ملف المعرض')} />}
      </div>

      {importing && <ClientImport existing={clients} onClose={() => setImporting(false)} onDone={reload} />}
      {editing && (
        <ClientForm
          initial={editing.form}
          id={editing.id}
          sectors={sectors}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            setViewing(null)
            reload()
          }}
        />
      )}
      {viewing && !editing && (
        <ClientDetails client={viewing} onClose={() => setViewing(null)} onEdit={canEdit(viewing) ? () => setEditing({ form: { ...viewing }, id: viewing.id }) : null} />
      )}
    </>
  )
}
