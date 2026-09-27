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
import { useCan } from '../../context/AuthContext.jsx'

export default function ParticipantsTab({ exhibition, exhibitions, exhibitors, clients, onChanged }) {
  const toast = useToast()
  const [editing, setEditing] = useState(null)
  const canPay = useCan('payments.write')

  const printContract = async (e) => {
    toast('📄 جاري طباعة العقد...')
    try {
      await downloadContract(e, exhibition, newReference('AIB'))
    } catch (err) {
      toast(`تعذّر إنشاء العقد: ${err.message}`, 'error')
    }
  }

  return (
    <Panel
      icon="🤝"
      title="المشاركون"
      subtitle={`${exhibitors.length} مشارك`}
      action={
        <div className="row-actions">
          {canPay && (
            <Link to="/sales" className="btn btn-outline btn-sm">
              💳 تسجيل دفعة
            </Link>
          )}
          <Button size="sm" onClick={() => setEditing({ form: { status: 'مبدئي', exhibition_id: exhibition.id }, id: null })}>
            + إضافة مشارك
          </Button>
        </div>
      }
    >
      <div className="table-wrap">
        <table className="table" style={{ minWidth: 820 }}>
          <thead>
            <tr>
              {['المشارك', 'الهاتف', 'النشاط', 'المواقع', 'العقد', 'المدفوع', 'المتبقي', 'الحالة', ''].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {exhibitors.map((e) => {
              const balance = balanceOf(e)
              return (
                <tr key={e.id}>
                  <td>
                    <div className="strong">{e.brand}</div>
                    <div className="muted tiny">{e.manager}</div>
                  </td>
                  <td className="ltr">{e.phone}</td>
                  <td className="small">{e.category || '—'}</td>
                  <td>{e.booth || '—'}</td>
                  <td className="num">{formatOMR(e.contract)}</td>
                  <td className="num text-suc strong">{formatOMR(e.paid)}</td>
                  <td className={`num ${balance > 0 ? 'text-dng strong' : 'muted'}`}>{formatOMR(balance)}</td>
                  <td>
                    <StatusBadge status={e.status} />
                  </td>
                  <td>
                    <div className="row-actions">
                      <Button size="sm" variant="outline" onClick={() => printContract(e)} title="طباعة عقد">
                        📄
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditing({ form: { ...e }, id: e.id })} title="تعديل">
                        ✏️
                      </Button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {!exhibitors.length && <EmptyState icon="🤝" text="لا يوجد مشاركون بعد" />}

      {editing && (
        <ExhibitorForm
          initial={editing.form}
          id={editing.id}
          exhibitions={exhibitions}
          clients={clients}
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
