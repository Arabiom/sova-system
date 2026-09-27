import { useState } from 'react'
import { listExhibitions } from '../api/exhibitions.js'
import { listClients } from '../api/clients.js'
import { deleteExhibitor, listExhibitors } from '../api/exhibitors.js'
import Button from '../components/Button.jsx'
import { EmptyState, Loading } from '../components/Feedback.jsx'
import ExhibitionFilter from '../components/ExhibitionFilter.jsx'
import ExhibitorForm from '../components/ExhibitorForm.jsx'
import { SelectOptions } from '../components/Field.jsx'
import PageHeader from '../components/PageHeader.jsx'
import StatusBadge, { Chip } from '../components/StatusBadge.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { CATEGORIES } from '../lib/constants.js'
import { balanceOf, newReference } from '../lib/finance.js'
import { exhibitionLabel, formatOMR } from '../lib/format.js'
import { downloadContract } from '../lib/pdf.js'
import { useData } from '../lib/useData.js'
import { useAuth, useCan, useCanEdit } from '../context/AuthContext.jsx'
import { listStaff } from '../api/staff.js'

const load = async () => {
  const [exhibitors, exhibitions, clients, staff] = await Promise.all([
    listExhibitors(),
    listExhibitions(),
    listClients(),
    listStaff().catch(() => []), // admin/finance see every name; others only their own
  ])
  return { exhibitors, exhibitions, clients, staff }
}

export default function Exhibitors() {
  const toast = useToast()
  const canDelete = useCan('records.delete')
  const money = useCan('money.view') // marketing: names and details, no amounts
  const canEdit = useCanEdit() // a marketer edits only the participants they entered
  const canWrite = useCan('data.write') // the viewer only looks
  const { session } = useAuth()
  const { data, loading, reload } = useData(load, null)
  const [editing, setEditing] = useState(null)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [scope, setScope] = useState('all')

  if (loading || !data) return <Loading />
  const { exhibitors, exhibitions, clients, staff } = data
  const enteredBy = (e) => {
    if (!e.created_by) return '—'
    if (e.created_by === session?.user?.id) return 'أنت'
    const s = staff.find((x) => x.user_id === e.created_by)
    return s?.name || s?.email || 'مسوق آخر'
  }
  const exhibitionOf = (id) => exhibitions.find((ex) => ex.id === id)

  const categories = [...new Set([...CATEGORIES, ...exhibitors.map((e) => e.category).filter(Boolean)])]
  const q = search.trim().toLowerCase()
  const visible = exhibitors.filter(
    (e) =>
      (!q || e.brand?.toLowerCase().includes(q) || e.manager?.toLowerCase().includes(q) || e.phone?.includes(q)) &&
      (!category || e.category === category) &&
      (scope === 'all' || e.exhibition_id === scope),
  )

  const remove = async (e) => {
    if (!confirm(`حذف العارض "${e.brand}" وكل بياناته؟`)) return
    try {
      await deleteExhibitor(e.id)
      toast('🗑️ تم الحذف')
      reload()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  const printContract = async (e) => {
    toast('📄 جاري طباعة العقد...')
    try {
      await downloadContract(e, exhibitionOf(e.exhibition_id), newReference('AIB'))
    } catch (err) {
      toast(`تعذّر إنشاء العقد: ${err.message}`, 'error')
    }
  }

  return (
    <>
      <PageHeader title={money ? 'العارضون والعقود' : 'المشاركون'} subtitle={`${exhibitors.length} مشارك مسجل`}>
        {canWrite && <Button onClick={() => setEditing({ form: { status: 'مبدئي' }, id: null })}>+ إضافة عارض</Button>}
      </PageHeader>

      <div className="toolbar">
        <input className="input toolbar-search" placeholder="🔍  ابحث بالاسم أو الجوال..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <ExhibitionFilter className="toolbar-select" exhibitions={exhibitions} value={scope} onChange={setScope} />
        <SelectOptions className="input toolbar-select" options={categories} placeholder="كل التصنيفات" value={category} onChange={(e) => setCategory(e.target.value)} />
        <div className="toolbar-count">{visible.length} نتيجة</div>
      </div>

      <div className="panel">
        <div className="table-wrap">
          <table className="table" style={{ minWidth: 950 }}>
            <thead>
              <tr>
                {['العلامة', 'المسؤول', 'الجوال', 'التصنيف', 'المعرض', 'البوث', ...(money ? ['العقد', 'المدفوع'] : []), 'سجّله', 'الحالة', ''].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((e) => {
                const balance = balanceOf(e)
                return (
                  <tr key={e.id}>
                    <td className="strong">{e.brand}</td>
                    <td>{e.manager}</td>
                    <td className="ltr">{e.phone}</td>
                    <td>{e.category && <Chip>{e.category}</Chip>}</td>
                    <td className="small">{exhibitionLabel(exhibitionOf(e.exhibition_id))}</td>
                    <td>{e.booth || '—'}</td>
                    {money && <td className="num">{formatOMR(e.contract)}</td>}
                    {money && (
                      <td>
                        <span className={`strong num ${balance > 0 ? 'text-dng' : 'text-suc'}`}>{formatOMR(e.paid)}</span>
                        {balance > 0 && <div className="tiny text-dng">متبقي {formatOMR(balance)}</div>}
                      </td>
                    )}
                    <td className="small">{enteredBy(e)}</td>
                    <td>
                      <StatusBadge status={e.status} />
                    </td>
                    <td>
                      <div className="row-actions">
                        {money && (
                          <Button size="sm" variant="outline" onClick={() => printContract(e)} title="طباعة عقد">
                            📄
                          </Button>
                        )}
                        {canEdit(e) ? (
                          <Button size="sm" variant="outline" onClick={() => setEditing({ form: { ...e }, id: e.id })} title="تعديل">
                            ✏️
                          </Button>
                        ) : (
                          canWrite && (
                            <span className="lock-note" title="أدخله مسوق آخر — التعديل للإدارة أو لمن أدخله">
                              🔒
                            </span>
                          )
                        )}
{canDelete && (<Button size="sm" variant="danger" onClick={() => remove(e)} title="حذف">
                          🗑️
                        </Button>)}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {!visible.length && <EmptyState icon="🤝" text="لا يوجد عارضون" />}
      </div>

      {editing && (
        <ExhibitorForm
          initial={editing.form}
          id={editing.id}
          exhibitions={exhibitions}
          clients={clients}
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
