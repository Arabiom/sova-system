import { useState } from 'react'
import { Link } from 'react-router-dom'
import Button from '../../components/Button.jsx'
import ExhibitorForm from '../../components/ExhibitorForm.jsx'
import { EmptyState } from '../../components/Feedback.jsx'
import Panel from '../../components/Panel.jsx'
import StatusBadge from '../../components/StatusBadge.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { balanceOf, newReference } from '../../lib/finance.js'
import { formatOMR } from '../../lib/format.js'
import { downloadContract } from '../../lib/pdf.js'
import { useCan, useCanEdit } from '../../context/AuthContext.jsx'
import { duplicateBooths } from '../../lib/sites.js'
import { tr } from '../../lib/i18n.js'

export default function ParticipantsTab({ exhibition, exhibitions, exhibitors, clients, onChanged }) {
  const toast = useToast()
  const [editing, setEditing] = useState(null)
  const canPay = useCan('payments.write')
  const money = useCan('money.view') // marketing: names and details, no amounts
  const canEdit = useCanEdit() // a marketer edits only the participants they entered
  const canWrite = useCan('data.write') // the viewer only looks
  const duplicates = duplicateBooths(exhibitors)

  const printContract = async (e) => {
    toast(tr('📄 جاري طباعة العقد...'))
    try {
      await downloadContract(e, exhibition, newReference('AIB'))
    } catch (err) {
      toast(tr('تعذّر إنشاء العقد: {0}', [err.message]), 'error')
    }
  }

  return (
    <Panel
      icon="🤝"
      title={tr('المشاركون')}
      subtitle={tr('{0} مشارك', [exhibitors.length])}
      action={
        <div className="row-actions">
          {canPay && (
            <Link to="/sales" className="btn btn-outline btn-sm">
              {tr('💳 تسجيل دفعة')}
            </Link>
          )}
          {canWrite && (
            <Button size="sm" onClick={() => setEditing({ form: { status: 'مبدئي', exhibition_id: exhibition.id }, id: null })}>
              {tr('+ إضافة مشارك')}
            </Button>
          )}
        </div>
      }
    >
      {duplicates.length > 0 && (
        <div className="alert alert-danger">
          {tr('⚠️ مواقع مسجلة لأكثر من مشارك (من قبل منع التكرار) — عدّل رقم الموقع لأحدهم:')}{' '}
          {duplicates
            .slice(0, 6)
            .map((d) => tr('الموقع {0}: {1}', [d.number, d.exhibitors.map((e) => e.brand).join(tr(' و '))]))
            .join(' • ')}
        </div>
      )}
      <div className="table-wrap">
        <table className="table" style={{ minWidth: 820 }}>
          <thead>
            <tr>
              {[tr('المشارك'), tr('الهاتف'), tr('النشاط'), tr('المواقع'), ...(money ? [tr('العقد'), tr('المدفوع'), tr('المتبقي')] : []), tr('الحالة'), ''].map((h) => (
                <th key={h}>{tr(h)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {exhibitors.map((e) => {
              const balance = balanceOf(e)
              return (
                <tr key={e.id}>
                  <td>
                    <div className="strong">{tr(e.brand)}</div>
                    <div className="muted tiny">{tr(e.manager)}</div>
                  </td>
                  <td className="ltr">{tr(e.phone)}</td>
                  <td className="small">{tr(e.category) || '—'}</td>
                  <td>{e.booth || '—'}</td>
                  {money && <td className="num">{formatOMR(e.contract)}</td>}
                  {money && <td className="num text-suc strong">{formatOMR(e.paid)}</td>}
                  {money && <td className={`num ${balance > 0 ? 'text-dng strong' : 'muted'}`}>{formatOMR(balance)}</td>}
                  <td>
                    <StatusBadge status={e.status} />
                  </td>
                  <td>
                    <div className="row-actions">
                      {money && (
                        <Button size="sm" variant="outline" onClick={() => printContract(e)} title={tr('طباعة عقد')}>
                          📄
                        </Button>
                      )}
                      {canEdit(e) ? (
                        <Button size="sm" variant="outline" onClick={() => setEditing({ form: { ...e }, id: e.id })} title={tr('تعديل')}>
                          ✏️
                        </Button>
                      ) : (
                        canWrite && (
                          <span className="lock-note" title={tr('أدخله مسوق آخر — التعديل للإدارة أو لمن أدخله')}>
                            🔒
                          </span>
                        )
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {!exhibitors.length && <EmptyState icon="🤝" text={tr('لا يوجد مشاركون بعد')} />}

      {editing && (
        <ExhibitorForm
          initial={editing.form}
          id={editing.id}
          exhibitions={exhibitions}
          clients={clients}
          exhibitors={exhibitors}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            onChanged()
          }}
        />
      )}
    </Panel>
  )
}
