import { describe, expect, it } from 'vitest'
import { autoSlash, formatDayMonthYear, parseDayMonthYear } from '../dates.js'

describe('day/month/year dates', () => {
  it('reads the day first, as typed in Oman', () => {
    expect(parseDayMonthYear('27/12/2026')).toBe('2026-12-27')
    expect(parseDayMonthYear('2/7/2026')).toBe('2026-07-02')
    expect(parseDayMonthYear('27-12-2026')).toBe('2026-12-27')
    expect(parseDayMonthYear('31/09/2026')).toBe('') // September has 30 days
    expect(parseDayMonthYear('12/27/2026')).toBe('') // month 27 does not exist
    expect(parseDayMonthYear('27/12')).toBe('')
  })

  it('adds the slashes to digits typed on a keypad', () => {
    expect(autoSlash('27')).toBe('27')
    expect(autoSlash('2712')).toBe('27/12')
    expect(autoSlash('27122026')).toBe('27/12/2026')
    expect(autoSlash('27/1')).toBe('27/1')
    // one key at a time, as the field sees it
    let text = ''
    for (const key of '27122026') text = autoSlash(text + key)
    expect(text).toBe('27/12/2026')
    // written by hand another way: left alone
    expect(autoSlash('2/7/2026')).toBe('2/7/2026')
    expect(autoSlash('27/1/2026')).toBe('27/1/2026')
    expect(autoSlash('27-12-2026')).toBe('27-12-2026')
    // deleting back over a slash
    expect(autoSlash('27/12/')).toBe('27/12')
  })

  it('shows stored dates day first', () => {
    expect(formatDayMonthYear('2026-12-27')).toBe('27/12/2026')
    expect(formatDayMonthYear('')).toBe('')
  })
})
