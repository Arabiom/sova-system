import { useState } from 'react'
import { listStaff, removeStaff, updateStaff } from '../api/staff.js'
import Button from '../components/Button.jsx'
import { EmptyState, Loading } from '../components/Feedback.jsx'
import CompanySettings from '../components/CompanySettings.jsx'
import PageHeader from '../components/PageHeader.jsx'
import Panel from '../components/Panel.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { formatDate } from '../lib/format.js'
import { ROLES } from '../lib/permissions.js'
import { useData } from '../lib/useData.js'
import { tr } from '../lib/i18n.js'

export default function Staff() {
  const toast = useToast()
  const { session, staff: me } = useAuth()
  const { data: staff, loading, reload } = useData(listStaff, [])
  const [names, setNames] = useState({})

  if (me?.legacy) {
    return (
      <>
        <PageHeader title={tr('الموظفون والصلاحيات')} />
        <div className="alert alert-warning">
          {tr('نظام الصلاحيات غير مفعّل بعد في قاعدة البيانات. شغّل ملف التحديث')}{' '}<strong>003_staff_roles.sql</strong>{' '}{tr('في Supabase ← SQL Editor، ثم حدّث الصفحة.')}
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
    if (s.user_id === session.user.id && role !== 'admin' && !confirm(tr('ستفقد صلاحية إدارة الموظفين. متابعة؟'))) return
    run(() => updateStaff(s.user_id, { role }), `✅ ${s.email}: ${ROLES[role].label}`)
  }

  const saveName = (s) => {
    const name = names[s.user_id]
    if (name === undefined || name === s.name) return
    run(() => updateStaff(s.user_id, { name }), '✅ تم حفظ الاسم')
  }

  const revoke = (s) => {
    if (!confirm(tr('إلغاء صلاحية دخول {0}؟\nلن يستطيع رؤية أي بيانات حتى تعيد إضافته.', [s.email]))) return
    run(() => removeStaff(s.user_id), '🔒 تم إلغاء الصلاحية')
  }

  return (
    <>
      <PageHeader title={tr('الموظفون والصلاحيات')} subtitle={tr('{0} حساب', [staff.length])} />
      <CompanySettings />

      <div className="grid-3 mb-16">
        {Object.entries(ROLES).map(([key, r]) => (
          <div key={key} className="stat-flat" style={{ '--accent': key === 'admin' ? 'var(--ink)' : key === 'finance' ? 'var(--suc)' : 'var(--gold)' }}>
            <div className="stat-flat-label">{tr(r.label)}</div>
            <div className="stat-flat-value">{staff.filter((s) => s.role === key).length}</div>
            <div className="stat-sub">{tr(r.desc)}</div>
          </div>
        ))}
      </div>

      <Panel icon="👤" title={tr('الحسابات')}>
        <div className="table-wrap">
          <table className="table table-numbered">
            <thead>
              <tr>
                <th>{tr('البريد')}</th>
                <th>{tr('الاسم')}</th>
                <th>{tr('الصلاحية')}</th>
                <th>{tr('تاريخ الإضافة')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {staff.map((s) => {
                const self = s.user_id === session.user.id
                return (
                  <tr key={s.user_id}>
                    <td className="ltr strong">
                      {tr(s.email)}
                      {self && <span className="muted small">{' '}{tr('(أنت)')}</span>}
                    </td>
                    <td>
                      <input
                        className="input input-compact"
                        placeholder={tr('اسم الموظف')}
                        value={names[s.user_id] ?? s.name ?? ''}
                        onChange={(e) => setNames((n) => ({ ...n, [s.user_id]: e.target.value }))}
                        onBlur={() => saveName(s)}
                      />
                    </td>
                    <td>
                      <select className="input input-compact" value={s.role} onChange={(e) => changeRole(s, e.target.value)}>
                        {Object.entries(ROLES).map(([key, r]) => (
                          <option key={key} value={key}>
                            {tr(r.label)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="small muted">{formatDate(s.created_at)}</td>
                    <td>{!self && <Button size="sm" variant="danger" onClick={() => revoke(s)}>{tr('إلغاء الصلاحية')}</Button>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {!staff.length && <EmptyState icon="👤" text={tr('لا توجد حسابات')} />}
      </Panel>

      <Panel icon="➕" title={tr('إضافة موظف جديد')} bodyClass="panel-pad" className="mt-14">
        <ol className="steps-list">
          <li>
            {tr('في Supabase افتح')}{' '}<strong>Authentication ← Users</strong>{' '}{tr('واضغط')}{' '}<strong>Add user ← Create new user</strong>.
          </li>
          <li>
            {tr('أدخل بريد الموظف وكلمة سر له، وفعّل')}{' '}<strong>Auto Confirm User</strong>{tr('، ثم')}{' '}<strong>Create user</strong>.
          </li>
          <li>
            {tr('حدّث هذه الصفحة: سيظهر الحساب هنا بصلاحية')}{' '}<strong>{tr('تسويق')}</strong>{' '}{tr('تلقائياً. غيّرها إذا لزم.')}
          </li>
          <li>{tr('أرسل له رابط النظام وبريده وكلمة السر.')}</li>
        </ol>
      </Panel>
    </>
  )
}
