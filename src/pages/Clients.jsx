import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { clientWithPhone, deleteClient, findClient, listClients, saveClient } from '../api/clients.js'
import { listStaff } from '../api/staff.js'
import { listExhibitions } from '../api/exhibitions.js'
import { listExhibitors } from '../api/exhibitors.js'
import Button from '../components/Button.jsx'
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
  name: { label: 'الاسم', fn: (a, b) => a.name.localeCompare(b.name, 'ar') },
  recent: { label: 'الأحدث إضافة', fn: (a, b) => String(b.created_at).localeCompare(String(a.created_at)) },
  count: { label: 'الأكثر مشاركة', fn: (a, b) => b.h.count - a.h.count },
  paid: { label: 'الأعلى دفعاً', fn: (a, b) => b.h.paid - a.h.paid },
  outstanding: { label: 'الأعلى متبقياً', fn: (a, b) => b.h.outstanding - a.h.outstanding },
  last: {
    label: 'آخر مشاركة',
    fn: (a, b) => String(b.h.lastExhibition?.date_from || '').localeCompare(String(a.h.lastExhibition?.date_from || '')),
  },
}

const distinct = (values) => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ar'))

/** "هذا المشروع تمت إضافته من قبل: «X» — أضافه أحمد بتاريخ …" */
const duplicateText = (c) =>
  `هذا المشروع تمت إضافته من قبل: «${c.name}» — أضافه ${c.owner_is_me ? 'أنت' : c.owner_name} بتاريخ ${formatDate(c.created_at)}`

/** Check any number or name against the whole company database before adding a project. */
function LookupBox() {
  const [q, setQ] = useState('')
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const run = async (e) => {
    e?.preventDefault()
    if (q.trim().length < 3) return toast('اكتب رقم الهاتف أو 3 أحرف من الاسم على الأقل', 'error')
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
      <div className="strong mb-8">🔎 هل المشروع مسجل في قاعدة الشركة؟</div>
      <div className="input-with-action">
        <input className="input" placeholder="رقم الهاتف أو اسم المشروع" value={q} onChange={(e) => setQ(e.target.value)} />
        <Button type="submit" disabled={busy}>
          {busy ? '...' : 'بحث'}
        </Button>
      </div>
      {result && (
        <div className="mt-8">
          {result.length ? (
            result.map((c) => (
              <div key={c.id} className={`alert ${c.matched_by === 'phone' ? 'alert-danger' : 'alert-warning'} mb-8`}>
                {c.matched_by === 'phone' ? '⛔ الرقم مسجل: ' : 'اسم مشابه: '}«{c.name}» — أضافه {c.owner_is_me ? 'أنت' : c.owner_name} بتاريخ {formatDate(c.created_at)}
              </div>
            ))
          ) : (
            <div className="alert alert-success">✓ غير مسجل — يمكنك إضافته</div>
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
    if (!form.name?.trim()) return toast('اكتب اسم العميل أو العلامة التجارية', 'error')
    const taken = phoneKey(form.phone) ? await checkPhone() : null
    if (taken) return toast(duplicateText(taken), 'error')
    setSaving(true)
    try {
      await saveClient(form, id)
      toast(id ? '✅ تم تحديث العميل' : '✅ تمت إضافة العميل')
      onSaved()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={id ? 'تعديل بيانات العميل' : 'إضافة عميل جديد'}
      onClose={onClose}
      size="wide"
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
      <div className="form-grid">
        <Field label="اسم العميل / العلامة التجارية" required>
          <input className="input" value={form.name || ''} onChange={set('name')} />
        </Field>
        <Field label="الشخص المسؤول">
          <input className="input" value={form.contact_name || ''} onChange={set('contact_name')} />
        </Field>
        <Field label="الهاتف" hint="رقم واحد لكل مشروع — لا يُسجَّل الرقم مرتين في قاعدة الشركة">
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
        <Field label="واتساب" hint="اتركه فارغاً إذا كان نفس رقم الهاتف">
          <input className="input" type="tel" dir="ltr" value={form.whatsapp || ''} onChange={set('whatsapp')} />
        </Field>
        <Field label="البريد الإلكتروني">
          <input className="input" type="email" dir="ltr" value={form.email || ''} onChange={set('email')} />
        </Field>
        <Field label="إنستقرام">
          <input className="input" dir="ltr" placeholder="@account" value={form.instagram || ''} onChange={set('instagram')} />
        </Field>
        <Field label="القطاع / النشاط">
          <input className="input" list="sector-list" value={form.sector || ''} onChange={set('sector')} />
          <datalist id="sector-list">
            {sectors.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </Field>
        <Field label="المدينة">
          <input className="input" list="city-list" value={form.city || ''} onChange={set('city')} />
          <datalist id="city-list">
            {CITIES.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field label="مصدر العميل">
          <SelectOptions options={CLIENT_SOURCES} value={form.source || ''} onChange={set('source')} />
        </Field>
        <Field label="الحالة">
          <SelectOptions options={CLIENT_STATUSES} placeholder={null} value={form.status || 'نشط'} onChange={set('status')} />
        </Field>
      </div>
      {duplicate && <div className="alert alert-danger">⚠️ {duplicateText(duplicate)}</div>}
      <Field label="ملاحظات">
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
      subtitle={`${h.count} مشاركة • آخرها ${h.lastExhibition ? exhibitionLabel(h.lastExhibition) : '—'}`}
      onClose={onClose}
      size="wide"
      footer={
        <>
          {(client.whatsapp || client.phone) && (
            <Button variant="whatsapp" onClick={() => openWhatsApp(client.whatsapp || client.phone, '')}>
              📱 واتساب
            </Button>
          )}
          {onEdit && (
            <Button variant="outline" onClick={onEdit}>
              ✏️ تعديل
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>
            إغلاق
          </Button>
        </>
      }
    >
      {money && (
      <div className="grid-3 mb-16">
        <StatCard flat label="إجمالي العقود" value={formatOMR(h.contract)} accent="var(--ink)" />
        <StatCard flat label="المدفوع" value={formatOMR(h.paid)} accent="var(--suc)" />
        <StatCard flat label="المتبقي" value={formatOMR(h.outstanding)} accent={h.outstanding > 0 ? 'var(--wrn)' : 'var(--suc)'} />
      </div>
      )}
      {rows.map(([label, value]) => (
        <div key={label} className="detail-row">
          <span className="detail-label">{label}</span>
          <strong className="detail-value">{value}</strong>
        </div>
      ))}
      <div className="section-label mt-14">سجل المشاركات</div>
      {h.participations.length ? (
        <div className="table-wrap">
          <table className="table table-compact">
            <thead>
              <tr>
                <th>المعرض</th>
                <th>الموقع</th>
                {money && <th>العقد</th>}
                {money && <th>المدفوع</th>}
                <th>الحالة</th>
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
        <div className="empty-inline">لم يشارك في أي معرض بعد</div>
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
  const navigate = useNavigate()

  if (loading || !data) return <Loading />
  const { clients, exhibitors, exhibitions, staff } = data
  const addedBy = (c) => {
    if (!c.created_by) return '—'
    if (c.created_by === session?.user?.id) return 'أنت'
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

  const q = search.trim().toLowerCase()
  const visible = enriched
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

  const active = Object.values(filters).some(Boolean) || q

  const remove = async (c) => {
    const note = c.h.count ? ` (سجل مشاركاته في المعارض يبقى، لكن بدون ربط بالعميل)` : ''
    if (!confirm(`حذف العميل "${c.name}"؟${note}`)) return
    try {
      await deleteClient(c.id)
      toast('🗑️ تم الحذف')
      setViewing(null)
      reload()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  const exportCsv = () =>
    downloadCsv(`AIB-Clients-${todayISO()}.csv`, visible, [
      { label: 'الاسم', value: (c) => c.name },
      { label: 'المسؤول', value: (c) => c.contact_name },
      { label: 'الهاتف', value: (c) => c.phone },
      { label: 'واتساب', value: (c) => c.whatsapp },
      { label: 'البريد', value: (c) => c.email },
      { label: 'إنستقرام', value: (c) => c.instagram },
      { label: 'القطاع', value: (c) => c.sector },
      { label: 'المدينة', value: (c) => c.city },
      { label: 'المصدر', value: (c) => c.source },
      { label: 'الحالة', value: (c) => c.status },
      { label: 'عدد المشاركات', value: (c) => c.h.count },
      { label: 'آخر معرض', value: (c) => (c.h.lastExhibition ? exhibitionTitle(c.h.lastExhibition) : '') },
      ...(money
        ? [
            { label: 'إجمالي العقود', value: (c) => c.h.contract.toFixed(3) },
            { label: 'المدفوع', value: (c) => c.h.paid.toFixed(3) },
            { label: 'المتبقي', value: (c) => c.h.outstanding.toFixed(3) },
          ]
        : []),
      { label: 'ملاحظات', value: (c) => c.notes },
      ...(everyone ? [{ label: 'أضافه', value: (c) => addedBy(c) }] : []),
    ])

  const totals = {
    all: clients.length,
    active: clients.filter((c) => c.status === 'نشط').length,
    repeat: enriched.filter((c) => c.h.count > 1).length,
    owing: enriched.filter((c) => c.h.outstanding > 0).length,
  }

  return (
    <>
      <PageHeader
        title={everyone ? 'العملاء' : 'عملائي'}
        subtitle={everyone ? 'قاعدة بيانات كل عملاء الشركة، ومن أضاف كل عميل، وسجل مشاركاتهم' : 'المشاريع التي أضفتها — ابحث أولاً للتأكد أن المشروع غير مسجل'}
      >
        <Button variant="outline" onClick={exportCsv} disabled={!visible.length}>
          ⬇️ تصدير Excel
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
            📱 واتساب للنتائج
          </Button>
        )}
        {canWrite && <Button onClick={() => setEditing({ form: { status: 'نشط' }, id: null })}>+ إضافة عميل</Button>}
      </PageHeader>

      <LookupBox />

      {duplicateGroups.length > 0 && (
        <div className="alert alert-warning">
          ⚠️ {duplicateGroups.length} رقم مسجل لأكثر من عميل (من قبل منع التكرار):{' '}
          {duplicateGroups
            .slice(0, 5)
            .map((g) => g.map((c) => c.name).join(' / '))
            .join('، ')}
          {duplicateGroups.length > 5 ? ' …' : ''} — ادمجها أو احذف المكرر.
        </div>
      )}

      <div className="grid-4 mb-16">
        <StatCard flat label="كل العملاء" value={totals.all} icon="👥" accent="var(--ink)" />
        <StatCard flat label="عملاء نشطون" value={totals.active} icon="✅" accent="var(--suc)" />
        <StatCard flat label="شاركوا أكثر من مرة" value={totals.repeat} icon="🔁" accent="var(--gold)" />
        <StatCard flat label="عليهم مبالغ متبقية" value={totals.owing} icon="⏳" accent="var(--wrn)" />
      </div>

      <div className="toolbar">
        <input className="input toolbar-search" placeholder="🔍  ابحث بالاسم أو الهاتف أو البريد..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <SelectOptions className="input toolbar-select" options={sectors} placeholder="كل القطاعات" value={filters.sector} onChange={setFilter('sector')} />
        <SelectOptions className="input toolbar-select" options={cities} placeholder="كل المدن" value={filters.city} onChange={setFilter('city')} />
        <SelectOptions className="input toolbar-select" options={CLIENT_STATUSES} placeholder="كل الحالات" value={filters.status} onChange={setFilter('status')} />
        <SelectOptions className="input toolbar-select" options={CLIENT_SOURCES} placeholder="كل المصادر" value={filters.source} onChange={setFilter('source')} />
        <select className="input toolbar-select" value={filters.participation} onChange={setFilter('participation')}>
          <option value="">كل المشاركات</option>
          <option value="none">لم يشارك بعد</option>
          <option value="once">شارك مرة واحدة</option>
          <option value="repeat">شارك أكثر من مرة</option>
          {money && <option value="owing">عليه مبلغ متبقٍ</option>}
        </select>
        <select className="input toolbar-select" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="الترتيب">
          {Object.entries(SORTS).filter(([key]) => money || !['paid', 'outstanding'].includes(key)).map(([key, s]) => (
            <option key={key} value={key}>
              ترتيب: {s.label}
            </option>
          ))}
        </select>
        {active && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setSearch('')
              setFilters({ sector: '', city: '', status: '', source: '', participation: '' })
            }}
          >
            ✕ مسح الفلاتر
          </Button>
        )}
        <div className="toolbar-count">{visible.length} نتيجة</div>
      </div>

      <div className="panel">
        <div className="table-wrap">
          <table className="table" style={{ minWidth: 1000 }}>
            <thead>
              <tr>
                {['العميل', 'الهاتف', 'القطاع', 'المدينة', 'المشاركات', 'آخر معرض', ...(money ? ['المدفوع', 'المتبقي'] : []), ...(everyone ? ['أضافه'] : []), 'الحالة', ''].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((c) => (
                <tr key={c.id} className="clickable" onClick={() => setViewing(c)}>
                  <td>
                    <div className="strong">{c.name}</div>
                    {c.contact_name && <div className="muted tiny">{c.contact_name}</div>}
                  </td>
                  <td className="ltr">{c.phone}</td>
                  <td>{c.sector && <Chip>{c.sector}</Chip>}</td>
                  <td className="small">{c.city || '—'}</td>
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
                        <Button size="sm" variant="outline" onClick={() => setEditing({ form: { ...c }, id: c.id })} title="تعديل">
                          ✏️
                        </Button>
                      ) : (
                        canWrite && (
                          <span className="lock-note" title="أدخله مسوق آخر — التعديل للإدارة أو لمن أدخله">
                            🔒
                          </span>
                        )
                      )}
{canDelete && (<Button size="sm" variant="danger" onClick={() => remove(c)} title="حذف">
                        🗑️
                      </Button>)}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!visible.length && <EmptyState icon="👥" text={clients.length ? 'لا توجد نتائج مطابقة للفلاتر' : 'لا يوجد عملاء بعد — أضف عميلاً أو استورد ملف مشاركين من ملف المعرض'} />}
      </div>

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
