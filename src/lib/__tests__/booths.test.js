import { describe, expect, it } from 'vitest'
import { boothHolder, boothKeys, duplicateBooths, formatRanges } from '../sites.js'

describe('one site = one participant', () => {
  it('reads booth labels the same way as the database', () => {
    expect(boothKeys('15')).toEqual(['15'])
    expect(boothKeys('016')).toEqual(['16'])
    expect(boothKeys('16، 22')).toEqual(['16', '22'])
    expect(boothKeys('1–3, 7')).toEqual(['1', '2', '3', '7'])
    expect(boothKeys('a-01')).toEqual(['A-01'])
    expect(boothKeys('—')).toEqual([])
    expect(boothKeys(formatRanges([5, 6, 7, 10]))).toEqual(['5', '6', '7', '10'])
  })

  const exhibitors = [
    { id: 'a', exhibition_id: 'x', brand: 'AXIS ARABI', booth: '15' },
    { id: 'b', exhibition_id: 'x', brand: 'Arabi Kh', booth: '15' },
    { id: 'c', exhibition_id: 'x', brand: 'متجر', booth: '1–3' },
    { id: 'd', exhibition_id: 'y', brand: 'آخر', booth: '15' },
  ]

  it('finds who already holds a site in the same exhibition only', () => {
    expect(boothHolder(exhibitors, 'x', '2')).toMatchObject({ exhibitor: { brand: 'متجر' }, numbers: ['2'] })
    expect(boothHolder(exhibitors, 'y', '2')).toBe(null)
    expect(boothHolder(exhibitors, 'x', '3', 'c')).toBe(null) // editing the holder itself
    expect(boothHolder(exhibitors, 'x', '')).toBe(null)
  })

  it('lists existing duplicates for clean-up', () => {
    const d = duplicateBooths(exhibitors)
    expect(d).toHaveLength(1)
    expect(d[0]).toMatchObject({ exhibitionId: 'x', number: '15' })
    expect(d[0].exhibitors.map((e) => e.brand)).toEqual(['AXIS ARABI', 'Arabi Kh'])
  })
})
