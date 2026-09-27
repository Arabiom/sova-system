import { useState } from 'react'
import { listStaff, removeStaff, updateStaff } from '../api/staff.js'
import Button from '../components/Button.jsx'
import { EmptyState, Loading } from '../components/Feedback.jsx'
import PageHeader from '../components/PageHeader.jsx'
import Panel from '../components/Panel.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { formatDate } from '../lib/format.js'
import { ROLES } from '../lib/permissions.js'
import { useData } from '../lib/useData.js'

export default function Staff() {
  const toast = useToast()
  const { session, staff: me } = useAuth()
  const { data: staff, loading, reload } = useData(listStaff, [])
  const [names, setNames] = useState({})

  if (me?.legacy) {
    return (
      <>
        <PageHeader title="الموظفون والصلاحيات" />
        <div className="alert alert-warning">
          نظام الصلاحيات غير مفعّل بعد في قاعدة البيانات. شغّل ملف التحديث <strong>003_staff_roles.sql</strong> في Supabase ← SQL Editor، ثم حدّث الصفحة.
        </div>
      </>
    )
  }
  if (loading) return <Loading />

  const run = async (action, message) => {
    try {
      await action()
      toast(message)
      reload()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  const changeRole = (s, role) => {
    if (s.user_id === session.user.id && role !== 'admin' && !confirm('ستفقد صلاحية إدارة الموظفين. متابعة؟')) return
    run(() => updateStaff(s.user_id, { role }), `✅ ${s.email}: ${ROLES[role].label}`)
  }

  const saveName = (s) => {
    const name = names[s.user_id]
    if (name === undefined || name === s.name) return
    run(() => updateStaff(s.user_id, { name }), '✅ تم حفظ الاسم')
  }

  const revoke = (s) => {
    if (!confirm(`إلغاء صلاحية دخول ${s.email}؟\nلن يستطيع رؤية أي بيانات حتى تعيد إضافته.`)) return
    run(() => removeStaff(s.user_id), '🔒 تم إلغاء الصلاحية')
  }

  return (
    <>
      <PageHeader title="الموظفون والصلاحيات" subtitle={`${staff.length} حساب`} />

      <div className="grid-3 mb-16">
        {Object.entries(ROLES).map(([key, r]) => (
          <div key={key} className="stat-flat" style={{ '--accent': key === 'admin' ? 'var(--ink)' : key === 'finance' ? 'var(--suc)' : 'var(--gold)' }}>
            <div className="stat-flat-label">{r.label}</div>
            <div className="stat-flat-value">{staff.filter((s) => s.role === key).length}</div>
            <div className="stat-sub">{r.desc}</div>
          </div>
        ))}
      </div>

      <Panel icon="👤" title="الحسابات">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>البريد</th>
                <th>الاسم</th>
                <th>الصلاحية</th>
                <th>تاريخ الإضافة</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {staff.map((s) => {
                const self = s.user_id === session.user.id
                return (
                  <tr key={s.user_id}>
                    <td className="ltr strong">
                      {s.email}
                      {self && <span className="muted small"> (أنت)</span>}
                    </td>
                    <td>
                      <input
                        className="input input-compact"
                        placeholder="اسم الموظف"
                        value={names[s.user_id] ?? s.name ?? ''}
                        onChange={(e) => setNames((n) => ({ ...n, [s.user_id]: e.target.value }))}
                        onBlur={() => saveName(s)}
                      />
                    </td>
                    <td>
                      <select className="input input-compact" value={s.role} onChange={(e) => changeRole(s, e.target.value)}>
                        {Object.entries(ROLES).map(([key, r]) => (
                          <option key={key} value={key}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="small muted">{formatDate(s.created_at)}</td>
                    <td>{!self && <Button size="sm" variant="danger" onClick={() => revoke(s)}>إلغاء الصلاحية</Button>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {!staff.length && <EmptyState icon="👤" text="لا توجد حسابات" />}
      </Panel>

      <Panel icon="➕" title="إضافة موظف جديد" bodyClass="panel-pad" className="mt-14">
        <ol className="steps-list">
          <li>
            في Supabase افتح <strong>Authentication ← Users</strong> واضغط <strong>Add user ← Create new user</strong>.
          </li>
          <li>
            أدخل بريد الموظف وكلمة سر له، وفعّل <strong>Auto Confirm User</strong>، ثم <strong>Create user</strong>.
          </li>
          <li>
            حدّث هذه الصفحة: سيظهر الحساب هنا بصلاحية <strong>تسويق</strong> تلقائياً. غيّرها إذا لزم.
          </li>
          <li>أرسل له رابط النظام وبريده وكلمة السر.</li>
        </ol>
      </Panel>
    </>
  )
}
