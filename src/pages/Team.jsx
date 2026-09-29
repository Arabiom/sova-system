import { useState } from 'react'
import { IconText } from '../components/Glyph.jsx'
import { listClients } from '../api/clients.js'
import { listExhibitions } from '../api/exhibitions.js'
import { listExhibitors } from '../api/exhibitors.js'
import { listPayments } from '../api/payments.js'
import { listStaff } from '../api/staff.js'
import { deleteTask, listActivity, listTasks, saveTask, setTaskStatus, TASK_DOING, TASK_DONE, TASK_NEW, TASK_PRIORITIES, TASK_STATUSES, validateTask } from '../api/team.js'
import { listLog } from '../api/whatsapp.js'
import Button from '../components/Button.jsx'
import DateInput from '../components/DateInput.jsx'
import { EmptyState, Loading } from '../components/Feedback.jsx'
import Field from '../components/Field.jsx'
import Modal from '../components/Modal.jsx'
import PageHeader from '../components/PageHeader.jsx'
import Panel from '../components/Panel.jsx'
import StatCard from '../components/StatCard.jsx'
import { useAuth, useCan } from '../context/AuthContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { downloadCsv } from '../lib/csv.js'
import { formatDayMonthYear } from '../lib/dates.js'
import { exhibitionLabel } from '../lib/format.js'
import { tr, uiLocale } from '../lib/i18n.js'
import { addDays, clockTime, formatMinutes, isOverdue, omanDay, periodRange, teamPerformance, TZ, weekOf } from '../lib/team.js'
import { useData } from '../lib/useData.js'

const load = async () => {
  const from = addDays(omanDay(), -70)
  const [staff, tasks, activity, exhibitions] = await Promise.all([
    listStaff().catch(() => []),
    listTasks(),
    listActivity(from),
    listExhibitions().catch(() => []),
  ])
  return { staff, tasks, activity, exhibitions }
}

// Work each person recorded — only loaded for the people who see everyone's effectiveness.
const loadWork = async () => {
  const [exhibitors, clients, payments, messages] = await Promise.all([
    listExhibitors({ columns: 'id,created_by,created_at' }).catch(() => []),
    listClients().catch(() => []),
    listPayments('id,created_by,created_at', { includePending: true }).catch(() => []),
    listLog({ limit: 5000 }).then((rows) => rows || [], () => []),
  ])
  return { exhibitors, clients, payments, messages }
}

const PRIORITY_TONE = { 'عادية': 'neutral', 'مهمة': 'warning', 'عاجلة': 'danger' }
const NEXT = { [TASK_NEW]: [TASK_DOING, '▶ بدء التنفيذ'], [TASK_DOING]: [TASK_DONE, '✓ تم الإنجاز'], [TASK_DONE]: [TASK_DOING, '↺ إعادة فتح'] }

export default function Team() {
  const { data, loading, reload } = useData(load, null)
  const seeAll = useCan('team.view')
  const [tab, setTab] = useState('tasks')

  if (loading || !data) return <Loading />
  if (data.tasks === null || data.activity === null) {
    return (
      <>
        <PageHeader title={tr('المهام والحضور')} />
        <div className="alert alert-warning">{tr('هذا القسم يحتاج تحديث قاعدة البيانات 017 — شغّله في Supabase ← SQL Editor ثم حدّث الصفحة.')}</div>
      </>
    )
  }

  const tabs = [
    { id: 'tasks', label: tr('✅ المهام') },
    { id: 'time', label: tr('⏱️ الحضور وساعات العمل') },
    ...(seeAll ? [{ id: 'performance', label: tr('📈 فعالية الموظفين') }] : []),
  ]

  return (
    <>
      <PageHeader title={tr('المهام والحضور')} subtitle={tr('مهام كل موظف، ومتى دخل وكم ساعة عمل، وفعالية الفريق')} />
      <div className="tabs tabs-underline mb-16">
        {tabs.map((t) => (
          <button key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
            <IconText text={t.label} size={16} />
          </button>
        ))}
      </div>
      {tab === 'tasks' && <Tasks data={data} reload={reload} />}
      {tab === 'time' && <Timesheet data={data} />}
      {tab === 'performance' && seeAll && <Performance data={data} />}
    </>
  )
}

/** Everyone the signed-in person can see, with their own row always present. */
function usePeople(staff) {
  const { session, staff: me } = useAuth()
  const uid = session?.user?.id
  const people = staff.length ? staff : me ? [{ user_id: uid, name: me.name, email: me.email || session?.user?.email, role: me.role }] : []
  const nameOf = (id) => {
    if (id === uid) return tr('أنت')
    const s = people.find((p) => p.user_id === id)
    return s ? s.name || s.email : tr('المدير')
  }
  return { uid, people, nameOf }
}

// ─── Tasks ──────────────────────────────────────────────────────────────────────────

function TaskForm({ task, people, exhibitions, canAssign, uid, onClose, onSaved }) {
  const toast = useToast()
  const [form, setForm] = useState(task?.id ? task : { assigned_to: canAssign ? '' : uid, priority: TASK_PRIORITIES[0], ...task })
  const [saving, setSaving] = useState(false)
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const submit = async () => {
    const errors = validateTask(form)
    if (errors.length) return toast(tr('أكمل: {0}', [errors.map((x) => tr(x)).join(tr('، '))]), 'error')
    setSaving(true)
    try {
      await saveTask(form, task?.id)
      toast(task?.id ? tr('✅ تم تعديل المهمة') : tr('✅ أُضيفت المهمة'))
      onSaved()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={task?.id ? tr('تعديل المهمة') : tr('مهمة جديدة')}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {tr('إلغاء')}
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? tr('جاري الحفظ...') : tr('حفظ')}
          </Button>
        </>
      }
    >
      <Field label={tr('عنوان المهمة')} required>
        <input className="input" autoFocus placeholder={tr('مثال: التواصل مع مشاركي معرض نزوى لتأكيد الحضور')} value={form.title || ''} onChange={set('title')} />
      </Field>
      <Field label={tr('التفاصيل')}>
        <textarea className="input" rows={3} value={form.details || ''} onChange={set('details')} />
      </Field>
      <div className="form-grid">
        <Field label={tr('الموظف')} required>
          <select className="input" value={form.assigned_to || ''} onChange={set('assigned_to')} disabled={!canAssign}>
            <option value="">{tr('اختر...')}</option>
            {people.map((p) => (
              <option key={p.user_id} value={p.user_id}>
                {p.user_id === uid ? `${p.name || p.email} (${tr('أنت')})` : p.name || p.email}
              </option>
            ))}
          </select>
        </Field>
        <Field label={tr('موعد التسليم')}>
          <DateInput value={form.due_date || ''} onChange={set('due_date')} />
        </Field>
        <Field label={tr('الأولوية')}>
          <select className="input" value={form.priority} onChange={set('priority')}>
            {TASK_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {tr(p)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={tr('المعرض (اختياري)')}>
          <select className="input" value={form.exhibition_id || ''} onChange={set('exhibition_id')}>
            <option value="">—</option>
            {exhibitions.map((ex) => (
              <option key={ex.id} value={ex.id}>
                {exhibitionLabel(ex)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {!canAssign && <div className="muted tiny">{tr('المهام التي تضيفها هنا لك أنت. إسناد المهام للموظفين من صلاحية المدير والمالية.')}</div>}
    </Modal>
  )
}

function TaskCard({ task, nameOf, exhibition, today, showAssignee, canManage, canMove, onMove, onNote, onEdit, onDelete }) {
  const overdue = isOverdue(task, today)
  const [next, label] = NEXT[task.status] || NEXT[TASK_NEW]
  return (
    <div className={`task-card ${overdue ? 'overdue' : ''} ${task.status === TASK_DONE ? 'done' : ''}`}>
      <div className="task-card-head">
        <span className={`badge badge-${PRIORITY_TONE[task.priority] || 'neutral'}`}>{tr(task.priority)}</span>
        {showAssignee && <span className="task-who">👤 {nameOf(task.assigned_to)}</span>}
      </div>
      <div className="task-title">{task.title}</div>
      {task.details && <div className="task-details">{task.details}</div>}
      <div className="task-meta">
        {task.due_date && (
          <span className={overdue ? 'text-dng strong' : task.due_date === today ? 'text-wrn strong' : ''}>
            📅 {formatDayMonthYear(task.due_date)}
            {overdue ? ` — ${tr('متأخرة')}` : task.due_date === today ? ` — ${tr('اليوم')}` : ''}
          </span>
        )}
        {exhibition && <span>🏛️ {exhibitionLabel(exhibition)}</span>}
        {task.status === TASK_DONE && task.completed_at && (
          <span className="text-suc">
            ✓ {tr('أُنجزت')} {new Date(task.completed_at).toLocaleDateString(uiLocale(), { timeZone: TZ })}
          </span>
        )}
      </div>
      {task.note && <div className="task-note">💬 {task.note}</div>}
      <div className="task-actions">
        {canMove && (
          <Button size="sm" variant={next === TASK_DONE ? 'success' : 'outline'} onClick={() => onMove(task, next)}>
            {tr(label)}
          </Button>
        )}
        {canMove && (
          <Button size="sm" variant="ghost" onClick={() => onNote(task)} title={tr('ملاحظة')}>
            💬
          </Button>
        )}
        {canManage && (
          <>
            <Button size="sm" variant="ghost" onClick={() => onEdit(task)} title={tr('تعديل')}>
              ✏️
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onDelete(task)} title={tr('حذف')}>
              🗑️
            </Button>
          </>
        )}
      </div>
    </div>
  )
}

function Tasks({ data, reload }) {
  const toast = useToast()
  const { role } = useAuth()
  const canAssign = useCan('tasks.assign')
  const canWrite = useCan('data.write')
  const seeAll = useCan('team.view')
  const { uid, people, nameOf } = usePeople(data.staff)
  const today = omanDay()
  const [who, setWho] = useState(seeAll ? 'all' : uid)
  const [editing, setEditing] = useState(null)
  const exhibitionOf = (id) => data.exhibitions.find((e) => e.id === id)

  const visible = data.tasks.filter((t) => who === 'all' || t.assigned_to === who)
  const mine = data.tasks.filter((t) => t.assigned_to === uid && t.status !== TASK_DONE)
  const open = visible.filter((t) => t.status !== TASK_DONE)
  const overdue = visible.filter((t) => isOverdue(t, today))
  const doneWeek = visible.filter((t) => t.status === TASK_DONE && t.completed_at && omanDay(t.completed_at) >= addDays(today, -6))
  const priorityRank = (t) => TASK_PRIORITIES.indexOf(t.priority) // عاجلة first
  const sorted = (rows) =>
    [...rows].sort((a, b) => (isOverdue(b, today) - isOverdue(a, today)) || priorityRank(b) - priorityRank(a) || String(a.due_date || '9999').localeCompare(String(b.due_date || '9999')))

  const act = async (fn, ok) => {
    try {
      await fn()
      if (ok) toast(ok)
      reload()
    } catch (err) {
      toast(err.message, 'error')
    }
  }
  const move = (task, status) => act(() => setTaskStatus(task.id, status), status === TASK_DONE ? tr('✅ أحسنت! أُنجزت المهمة') : null)
  const note = (task) => {
    const text = prompt(tr('ملاحظة على المهمة (تظهر للمدير):'), task.note || '')
    if (text === null) return
    act(() => setTaskStatus(task.id, task.status, text.trim()), tr('✅ حُفظت الملاحظة'))
  }
  const remove = (task) => confirm(tr('حذف المهمة «{0}»؟', [task.title])) && act(() => deleteTask(task.id), tr('🗑️ تم الحذف'))
  const canManage = (t) => role === 'admin' || role === 'finance' || (t.created_by === uid && t.assigned_to === uid)
  const canMove = (t) => canWrite && (canAssign || t.assigned_to === uid || t.created_by === uid)

  return (
    <>
      <div className="grid-4 mb-16">
        <StatCard flat label={tr('مهام مفتوحة')} value={open.length} icon="📋" accent="var(--info)" />
        <StatCard flat label={tr('متأخرة')} value={overdue.length} icon="⏰" accent={overdue.length ? 'var(--dng)' : 'var(--suc)'} />
        <StatCard flat label={tr('أُنجزت خلال 7 أيام')} value={doneWeek.length} icon="✅" accent="var(--suc)" />
        <StatCard flat label={tr('مهامي المفتوحة')} value={mine.length} icon="👤" accent="var(--gold)" />
      </div>

      <div className="toolbar">
        {seeAll && (
          <select className="input toolbar-select" value={who} onChange={(e) => setWho(e.target.value)} aria-label={tr('الموظف')}>
            <option value="all">{tr('كل الموظفين')}</option>
            {people.map((p) => (
              <option key={p.user_id} value={p.user_id}>
                {p.user_id === uid ? tr('أنت') : p.name || p.email}
              </option>
            ))}
          </select>
        )}
        {canWrite && <Button onClick={() => setEditing({ assigned_to: who !== 'all' ? who : canAssign ? '' : uid })}>{tr('+ مهمة جديدة')}</Button>}
      </div>

      <div className="task-board">
        {TASK_STATUSES.map((status) => {
          const rows = sorted(visible.filter((t) => t.status === status))
          const shown = status === TASK_DONE ? rows.slice(0, 30) : rows
          return (
            <section key={status} className={`task-col task-col-${TASK_STATUSES.indexOf(status)}`}>
              <div className="task-col-head">
                <span>{tr(status)}</span>
                <span className="tab-count">{rows.length}</span>
              </div>
              {shown.map((t) => (
                <TaskCard
                  key={t.id}
                  task={t}
                  today={today}
                  nameOf={nameOf}
                  exhibition={exhibitionOf(t.exhibition_id)}
                  showAssignee={who === 'all'}
                  canManage={canWrite && canManage(t)}
                  canMove={canMove(t)}
                  onMove={move}
                  onNote={note}
                  onEdit={setEditing}
                  onDelete={remove}
                />
              ))}
              {!rows.length && <div className="empty-inline">{status === TASK_DONE ? tr('لا توجد مهام منجزة بعد') : tr('لا توجد مهام')}</div>}
            </section>
          )
        })}
      </div>

      {editing && (
        <TaskForm
          task={editing}
          people={canAssign ? people : people.filter((p) => p.user_id === uid)}
          exhibitions={data.exhibitions}
          canAssign={canAssign}
          uid={uid}
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

// ─── Working time ───────────────────────────────────────────────────────────────────

function Timesheet({ data }) {
  const seeAll = useCan('team.view')
  const { uid, people } = usePeople(data.staff)
  const today = omanDay()
  const [anchor, setAnchor] = useState(today)
  const days = weekOf(anchor)
  const rows = (seeAll ? people : people.filter((p) => p.user_id === uid)).map((p) => {
    const cells = days.map((day) => data.activity.find((a) => a.user_id === p.user_id && a.day === day))
    return { person: p, cells, minutes: cells.reduce((t, c) => t + (c?.active_minutes || 0), 0), days: cells.filter(Boolean).length }
  })
  const dayName = (day) => new Date(`${day}T12:00:00Z`).toLocaleDateString(uiLocale(), { weekday: 'short', timeZone: 'UTC' })

  const exportCsv = () =>
    downloadCsv(`${tr('الحضور')}-${days[0]}.csv`, rows, [
      { label: tr('الموظف'), value: (r) => r.person.name || r.person.email },
      ...days.flatMap((day, i) => [
        { label: `${formatDayMonthYear(day)} ${tr('دخول')}`, value: (r) => (r.cells[i] ? clockTime(r.cells[i].first_seen) : '') },
        { label: `${formatDayMonthYear(day)} ${tr('آخر نشاط')}`, value: (r) => (r.cells[i] ? clockTime(r.cells[i].last_seen) : '') },
        { label: `${formatDayMonthYear(day)} ${tr('دقائق')}`, value: (r) => r.cells[i]?.active_minutes ?? '' },
      ]),
      { label: tr('إجمالي الدقائق'), value: (r) => r.minutes },
    ])

  return (
    <>
      <div className="toolbar">
        <Button variant="outline" onClick={() => setAnchor(addDays(days[0], -7))}>
          {tr('→ الأسبوع السابق')}
        </Button>
        <Button variant="outline" onClick={() => setAnchor(today)} disabled={days.includes(today)}>
          {tr('هذا الأسبوع')}
        </Button>
        <Button variant="outline" onClick={() => setAnchor(addDays(days[6], 1))} disabled={days.includes(today)}>
          {tr('الأسبوع التالي ←')}
        </Button>
        <Button variant="outline" onClick={exportCsv} disabled={!rows.length}>
          {tr('⬇️ تصدير Excel')}
        </Button>
        <div className="toolbar-count">
          {formatDayMonthYear(days[0])} – {formatDayMonthYear(days[6])}
        </div>
      </div>

      <Panel icon="⏱️" title={tr('جدول الحضور وساعات العمل')} subtitle={tr('لكل يوم: وقت الدخول – آخر نشاط، ومدة العمل الفعلي في النظام')}>
        <div className="table-wrap">
          <table className="table timesheet">
            <thead>
              <tr>
                <th>{tr('الموظف')}</th>
                {days.map((day) => (
                  <th key={day} className={day === today ? 'is-today' : ''}>
                    <div>{dayName(day)}</div>
                    <div className="muted tiny">{formatDayMonthYear(day).slice(0, 5)}</div>
                  </th>
                ))}
                <th>{tr('الأسبوع')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ person, cells, minutes, days: active }) => (
                <tr key={person.user_id}>
                  <td className="strong nowrap">
                    {person.user_id === uid ? `${person.name || person.email} (${tr('أنت')})` : person.name || person.email}
                  </td>
                  {cells.map((c, i) => (
                    <td key={days[i]} className={days[i] === today ? 'is-today' : ''}>
                      {c ? (
                        <div className="ts-cell">
                          <div className="ts-time">
                            {clockTime(c.first_seen)} – {clockTime(c.last_seen)}
                          </div>
                          <div className="ts-hours">{formatMinutes(c.active_minutes)}</div>
                        </div>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  ))}
                  <td>
                    <div className="strong">{formatMinutes(minutes)}</div>
                    <div className="muted tiny">{tr('{0} أيام', [active])}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && <EmptyState icon="⏱️" text={tr('لا توجد بيانات بعد')} />}
        <div className="muted tiny mt-10 ts-note">
          {tr('يُسجَّل الوقت تلقائياً أثناء استخدام الموظف للنظام: النافذة المفتوحة بدون أي حركة لأكثر من 5 دقائق لا تُحسب، وعدة نوافذ مفتوحة تُحسب مرة واحدة. الأوقات بتوقيت عُمان.')}
        </div>
      </Panel>
    </>
  )
}

// ─── Effectiveness ──────────────────────────────────────────────────────────────────

const PERIODS = [
  { id: 'week', label: 'هذا الأسبوع' },
  { id: 'month', label: 'هذا الشهر' },
  { id: 'last-month', label: 'الشهر الماضي' },
]

function Performance({ data }) {
  const { data: work, loading } = useData(loadWork, null)
  const { uid, people } = usePeople(data.staff)
  const [period, setPeriod] = useState('month')
  if (loading || !work) return <Loading />
  const range = periodRange(period)
  const rows = teamPerformance({ staff: people, activity: data.activity, tasks: data.tasks, ...work }, range)
  const name = (s) => (s.user_id === uid ? `${s.name || s.email} (${tr('أنت')})` : s.name || s.email)

  const exportCsv = () =>
    downloadCsv(`${tr('فعالية الموظفين')}-${range.from}.csv`, rows, [
      { label: tr('الموظف'), value: (r) => r.staff.name || r.staff.email },
      { label: tr('أيام الحضور'), value: (r) => r.daysActive },
      { label: tr('ساعات العمل'), value: (r) => (r.minutes / 60).toFixed(1) },
      { label: tr('متوسط اليوم'), value: (r) => formatMinutes(r.avgMinutes) },
      { label: tr('متوسط وقت الدخول'), value: (r) => r.avgArrival },
      { label: tr('مهام الفترة'), value: (r) => r.tasks },
      { label: tr('منجزة'), value: (r) => r.tasksDone },
      { label: tr('في موعدها'), value: (r) => r.tasksOnTime },
      { label: tr('متأخرة الآن'), value: (r) => r.tasksOverdue },
      { label: tr('مشاركون سجّلهم'), value: (r) => r.participants },
      { label: tr('عملاء أضافهم'), value: (r) => r.clients },
      { label: tr('دفعات سجّلها'), value: (r) => r.payments },
      { label: tr('رسائل واتساب'), value: (r) => r.messages },
    ])

  return (
    <>
      <div className="toolbar">
        <div className="tabs">
          {PERIODS.map((p) => (
            <button key={p.id} className={`tab ${period === p.id ? 'active' : ''}`} onClick={() => setPeriod(p.id)}>
              {tr(p.label)}
            </button>
          ))}
        </div>
        <Button variant="outline" onClick={exportCsv}>
          {tr('⬇️ تصدير Excel')}
        </Button>
        <div className="toolbar-count">
          {formatDayMonthYear(range.from)} – {formatDayMonthYear(range.to)}
        </div>
      </div>

      <Panel icon="📈" title={tr('فعالية الموظفين')} subtitle={tr('الوقت في النظام، إنجاز المهام، والعمل المسجّل لكل موظف خلال الفترة')}>
        <div className="table-wrap">
          <table className="table" style={{ minWidth: 1100 }}>
            <thead>
              <tr>
                <th>{tr('الموظف')}</th>
                <th>{tr('أيام الحضور')}</th>
                <th>{tr('ساعات العمل')}</th>
                <th>{tr('متوسط وقت الدخول')}</th>
                <th>{tr('المهام')}</th>
                <th>{tr('مشاركون سجّلهم')}</th>
                <th>{tr('عملاء أضافهم')}</th>
                <th>{tr('دفعات سجّلها')}</th>
                <th>{tr('رسائل واتساب')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.staff.user_id}>
                  <td className="strong nowrap">{name(r.staff)}</td>
                  <td className="num">{r.daysActive}</td>
                  <td>
                    <div className="strong">{formatMinutes(r.minutes)}</div>
                    {r.daysActive > 0 && <div className="muted tiny">{tr('{0} في اليوم', [formatMinutes(r.avgMinutes)])}</div>}
                  </td>
                  <td className="num">{r.avgArrival}</td>
                  <td>
                    {r.tasks ? (
                      <>
                        <div className="strong">
                          {r.tasksDone}/{r.tasks} <span className="muted">({r.completion}%)</span>
                        </div>
                        <div className="muted tiny">{tr('{0} في موعدها', [r.tasksOnTime])}</div>
                      </>
                    ) : (
                      <span className="muted">—</span>
                    )}
                    {r.tasksOverdue > 0 && <div className="tiny text-dng strong">{tr('{0} متأخرة الآن', [r.tasksOverdue])}</div>}
                  </td>
                  <td className="num">{r.participants}</td>
                  <td className="num">{r.clients}</td>
                  <td className="num">{r.payments}</td>
                  <td className="num">{r.messages}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && <EmptyState icon="📈" text={tr('لا توجد بيانات بعد')} />}
        <div className="muted tiny mt-10">
          {tr('المهام: ما موعده (أو أُضيف) خلال الفترة، والمنجز منه، وما أُنجز في موعده. العمل المسجّل: ما أدخله الموظف بنفسه في النظام خلال الفترة.')}
        </div>
      </Panel>
    </>
  )
}
