import { describe, expect, it } from 'vitest'
import { calendarYears } from '../calendar.js'

describe('annual calendar', () => {
  it('places exhibitions in their month and leaves rest months empty', () => {
    const years = calendarYears([
      { id: 'a', date_from: '2026-12-27', date_to: '2026-12-31', status: 'قادم' },
      { id: 'b', date_from: '2027-02-23', date_to: '2027-02-27', status: 'تخطيط' },
      { id: 'c', date_from: '2027-03-01', date_to: '2027-03-02', status: 'ملغى' },
    ])
    expect(years.map((y) => y.year)).toEqual([2026, 2027])
    expect(years[0].months[11].exhibitions.map((e) => e.id)).toEqual(['a'])
    expect(years[1].months[1].exhibitions.map((e) => e.id)).toEqual(['b'])
    expect(years[1].months[2].exhibitions).toEqual([]) // cancelled one left out
  })
})
