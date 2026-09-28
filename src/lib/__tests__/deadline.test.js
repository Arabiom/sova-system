import { describe, expect, it } from 'vitest'
import { collectionAlerts, daysBetween, paymentDeadline } from '../finance.js'

const ex = (id, date_from, date_to = date_from, status = 'قادم') => ({ id, date_from, date_to, status })

describe('collection deadline', () => {
  it('is 10 days before opening, across month ends', () => {
    expect(paymentDeadline(ex(1, '2026-11-05'))).toBe('2026-10-26')
    expect(paymentDeadline(ex(1, '2026-03-05'))).toBe('2026-02-23')
    expect(paymentDeadline({ date_from: '' })).toBe('')
    expect(paymentDeadline(null)).toBe('')
  })

  it('counts whole days', () => {
    expect(daysBetween('2026-10-20', '2026-10-26')).toBe(6)
    expect(daysBetween('2026-10-28', '2026-10-26')).toBe(-2)
  })

  it('warns from a week before the deadline until the exhibition ends, only while money is owed', () => {
    const exhibitions = [
      ex('near', '2026-11-05', '2026-11-08'), // deadline 26/10
      ex('far', '2026-12-20'),
      ex('paid', '2026-11-01'),
      ex('cancelled', '2026-11-01', '2026-11-02', 'ملغى'),
      ex('over', '2026-10-01', '2026-10-03'),
    ]
    const exhibitors = [
      { exhibition_id: 'near', contract: 200, paid: 50 },
      { exhibition_id: 'near', contract: 100, paid: 100 },
      { exhibition_id: 'near', contract: 125, paid: 0 },
      { exhibition_id: 'far', contract: 100, paid: 0 },
      { exhibition_id: 'paid', contract: 150, paid: 150 },
      { exhibition_id: 'cancelled', contract: 150, paid: 0 },
      { exhibition_id: 'over', contract: 150, paid: 0 },
    ]
    expect(collectionAlerts(exhibitions, exhibitors, '2026-10-18')).toEqual([])
    const [a] = collectionAlerts(exhibitions, exhibitors, '2026-10-20')
    expect(a.exhibition.id).toBe('near')
    expect(a).toMatchObject({ deadline: '2026-10-26', daysLeft: 6, daysToOpen: 16, overdue: false, remaining: 275 })
    expect(a.owing).toHaveLength(2)
    expect(collectionAlerts(exhibitions, exhibitors, '2026-10-30')[0]).toMatchObject({ overdue: true, daysLeft: -4 })
    expect(collectionAlerts(exhibitions, exhibitors, '2026-11-09')).toEqual([])
  })
})
