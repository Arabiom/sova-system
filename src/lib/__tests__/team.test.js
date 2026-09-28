import { describe, expect, it } from 'vitest'
import { addDays, clockTime, formatMinutes, isOverdue, omanDay, periodRange, teamPerformance, weekOf } from '../team.js'

describe('days and times (Oman)', () => {
  it('uses the Oman date, not UTC', () => {
    expect(omanDay('2026-09-27T21:30:00Z')).toBe('2026-09-28') // 01:30 in Muscat
    expect(omanDay('2026-09-27T19:59:00Z')).toBe('2026-09-27')
  })

  it('builds the Sunday–Saturday week', () => {
    const week = weekOf('2026-09-30') // a Wednesday
    expect(week[0]).toBe('2026-09-27')
    expect(week[6]).toBe('2026-10-03')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('formats working time and clock times', () => {
    expect(formatMinutes(205)).toBe('3 س 25 د')
    expect(formatMinutes(45)).toBe('45 د')
    expect(formatMinutes(120)).toBe('2 س')
    expect(clockTime('2026-09-28T04:42:00Z')).toMatch(/08:42/)
  })

  it('knows the report periods', () => {
    expect(periodRange('month', '2026-09-28')).toEqual({ from: '2026-09-01', to: '2026-09-28' })
    expect(periodRange('last-month', '2026-03-10')).toEqual({ from: '2026-02-01', to: '2026-02-28' })
    expect(periodRange('week', '2026-09-30')).toEqual({ from: '2026-09-27', to: '2026-10-03' })
  })
})

describe('teamPerformance', () => {
  const staff = [{ user_id: 'a', name: 'سالم' }, { user_id: 'b', name: 'مريم' }]
  const activity = [
    { user_id: 'a', day: '2026-09-27', first_seen: '2026-09-27T04:00:00Z', active_minutes: 300 },
    { user_id: 'a', day: '2026-09-28', first_seen: '2026-09-28T05:00:00Z', active_minutes: 180 },
    { user_id: 'a', day: '2026-08-30', first_seen: '2026-08-30T05:00:00Z', active_minutes: 999 }, // outside the period
  ]
  const tasks = [
    { assigned_to: 'a', status: 'منجزة', due_date: '2026-09-20', completed_at: '2026-09-19T10:00:00Z' },
    { assigned_to: 'a', status: 'منجزة', due_date: '2026-09-21', completed_at: '2026-09-23T10:00:00Z' },
    { assigned_to: 'a', status: 'جديدة', due_date: '2026-09-25' },
    { assigned_to: 'b', status: 'قيد التنفيذ', due_date: '2026-10-05' },
  ]
  const range = { from: '2026-09-01', to: '2026-09-30' }
  const [a, b] = teamPerformance(
    {
      staff,
      activity,
      tasks,
      exhibitors: [{ created_by: 'a', created_at: '2026-09-10T08:00:00Z' }, { created_by: 'b', created_at: '2026-07-10T08:00:00Z' }],
      messages: [{ sent_by: 'b', sent_at: '2026-09-11T08:00:00Z' }],
    },
    range,
    '2026-09-28',
  )

  it('adds up time in the period only', () => {
    expect(a.daysActive).toBe(2)
    expect(a.minutes).toBe(480)
    expect(a.avgMinutes).toBe(240)
    expect(a.avgArrival).toBe('08:30') // 08:00 and 09:00 Muscat
  })

  it('counts tasks done, on time and overdue', () => {
    expect([a.tasks, a.tasksDone, a.tasksOnTime, a.tasksOverdue, a.completion]).toEqual([3, 2, 1, 1, 67])
    expect(b.tasks).toBe(0) // due next month
    expect(b.tasksOpen).toBe(1)
    expect(isOverdue(tasks[2], '2026-09-28')).toBe(true)
  })

  it('counts the work each person recorded', () => {
    expect([a.participants, b.participants, b.messages]).toEqual([1, 0, 1])
  })
})
