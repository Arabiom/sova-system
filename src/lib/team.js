// Working time and effectiveness of each employee, from staff_activity, staff_tasks and the
// records each person created. Days are Oman days (Asia/Muscat), like the database.

import { tr } from './i18n.js'

export const TZ = 'Asia/Muscat'

/** yyyy-mm-dd of a moment in Oman. */
export function omanDay(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(date))
  const get = (t) => parts.find((p) => p.type === t).value
  return `${get('year')}-${get('month')}-${get('day')}`
}

/** Add days to a yyyy-mm-dd day. */
export function addDays(day, n) {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** The 7 days (Sunday → Saturday, the Omani working week) around `day`. */
export function weekOf(day) {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay() // 0 = Sunday
  const start = addDays(day, -weekday)
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

/** 205 → "3 س 25 د" / "3h 25m". */
export function formatMinutes(minutes) {
  const m = Math.max(0, Math.round(minutes || 0))
  const h = Math.floor(m / 60)
  const rest = m % 60
  if (!h) return tr('{0} د', [rest])
  return rest ? tr('{0} س {1} د', [h, rest]) : tr('{0} س', [h])
}

/** Time of day in Oman, 24-hour with Western digits like the dates: "08:42". */
export const clockTime = (ts) =>
  ts ? new Date(ts).toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }) : '—'

/** Minutes after midnight (Oman) of a moment — to average arrival times. */
function minutesOfDay(ts) {
  const [h, m] = new Date(ts).toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).split(':')
  return +h * 60 + +m
}

export const clockFromMinutes = (mins) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(Math.round(mins % 60)).padStart(2, '0')}`

export const isOverdue = (task, today = omanDay()) => task.status !== 'منجزة' && task.due_date && task.due_date < today

/** Periods for the performance table. */
export function periodRange(id, today = omanDay()) {
  if (id === 'week') {
    const days = weekOf(today)
    return { from: days[0], to: days[6] }
  }
  if (id === 'last-month') {
    const d = new Date(`${today.slice(0, 7)}-01T00:00:00Z`)
    d.setUTCMonth(d.getUTCMonth() - 1)
    const from = d.toISOString().slice(0, 10)
    return { from, to: addDays(`${today.slice(0, 7)}-01`, -1) }
  }
  return { from: `${today.slice(0, 7)}-01`, to: today } // this month
}

const inRange = (value, { from, to }) => {
  if (!value) return false
  const day = String(value).length > 10 ? omanDay(value) : String(value).slice(0, 10)
  return day >= from && day <= to
}

/**
 * Effectiveness of each employee over a period: time in the system, tasks, and the work they
 * recorded (participants registered, clients added, payments recorded, WhatsApp messages sent).
 */
export function teamPerformance({ staff = [], activity = [], tasks = [], exhibitors = [], clients = [], payments = [], messages = [] }, range, today = omanDay()) {
  return staff.map((s) => {
    const id = s.user_id
    const days = activity.filter((a) => a.user_id === id && inRange(a.day, range))
    const minutes = days.reduce((t, a) => t + (a.active_minutes || 0), 0)
    const arrivals = days.map((a) => minutesOfDay(a.first_seen))
    const own = tasks.filter((t) => t.assigned_to === id)
    const due = own.filter((t) => inRange(t.due_date || t.created_at, range))
    const done = due.filter((t) => t.status === 'منجزة')
    const onTime = done.filter((t) => !t.due_date || omanDay(t.completed_at) <= t.due_date)
    const count = (rows, key, dateKey = 'created_at') => rows.filter((r) => r[key] === id && inRange(r[dateKey], range)).length
    return {
      staff: s,
      daysActive: days.length,
      minutes,
      avgMinutes: days.length ? minutes / days.length : 0,
      avgArrival: arrivals.length ? clockFromMinutes(arrivals.reduce((a, b) => a + b, 0) / arrivals.length) : '—',
      tasks: due.length,
      tasksDone: done.length,
      tasksOnTime: onTime.length,
      tasksOpen: own.filter((t) => t.status !== 'منجزة').length,
      tasksOverdue: own.filter((t) => isOverdue(t, today)).length,
      completion: due.length ? Math.round((done.length / due.length) * 100) : null,
      participants: count(exhibitors, 'created_by'),
      clients: count(clients, 'created_by'),
      payments: count(payments, 'created_by'),
      messages: count(messages, 'sent_by', 'sent_at'),
    }
  })
}
