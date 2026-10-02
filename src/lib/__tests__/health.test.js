import { describe, expect, it } from 'vitest'
import { healthChecks } from '../health.js'

const today = '2026-10-02'
const exhibitions = [
  { id: 'nz', city: 'نزوى', status: 'قادم', date_from: '2026-12-27', date_to: '2026-12-31', booth_packages: [{ name: 'أ', price: 200 }, { name: 'ب', price: 100 }] },
  { id: 'old', city: 'مسقط', status: 'قادم', date_from: '2026-08-01', date_to: '2026-08-05' },
  { id: 'pl', city: 'صحار', status: 'تخطيط', date_from: '2026-10-20', date_to: '2026-10-25' },
]
const exhibitors = [
  { id: 'a', exhibition_id: 'nz', brand: 'إيمانوا', phone: '9063699', contract: 100, paid: 0, status: 'مبدئي' },
  { id: 'b', exhibition_id: 'nz', brand: 'إيمانوا 2', phone: '9063699', contract: 50, paid: 0, status: 'مبدئي' },
  { id: 'c', exhibition_id: 'nz', brand: 'عطور', phone: '92223333', contract: 100, paid: 150, status: 'مؤكد' },
  { id: 'd', exhibition_id: 'nz', brand: 'ورد', phone: '91112222', contract: 0, paid: 0, status: 'مؤكد' },
]
const sites = [{ exhibition_id: 'nz', number: 1, price: 200 }, { exhibition_id: 'nz', number: 13, price: 125 }]
const awaiting = [{ exhibitor_id: 'c', amount: 20, date: '2026-09-20' }, { exhibitor_id: 'c', amount: 5, date: '2026-10-01' }]

describe('data health check', () => {
  const ids = (list) => list.map((c) => c.id)
  it('finds bad phones, doubles, prices, stale statuses and near planning', () => {
    const checks = healthChecks({ exhibitions, exhibitors, sites, awaiting }, today, { money: true })
    expect(ids(checks)).toEqual(['phones', 'twice', 'overpaid', 'awaiting', 'prices', 'ended', 'free', 'planning'])
    const withPayments = healthChecks({ exhibitions, exhibitors, sites, awaiting, payments: [{ exhibitor_id: 'c', amount: 100 }] }, today, { money: true })
    expect(withPayments.find((c) => c.id === 'drift').items.map((i) => i.label)).toEqual([expect.stringContaining('عطور')])
    expect(checks.find((c) => c.id === 'phones').items).toHaveLength(2)
    expect(checks.find((c) => c.id === 'prices').items[0].label).toMatch('13')
    expect(checks.find((c) => c.id === 'awaiting').items).toHaveLength(1)
  })
  it('hides money checks from roles without amounts', () => {
    const checks = healthChecks({ exhibitions, exhibitors, sites, awaiting }, today)
    expect(ids(checks)).not.toContain('overpaid')
    expect(ids(checks)).not.toContain('awaiting')
  })
})
