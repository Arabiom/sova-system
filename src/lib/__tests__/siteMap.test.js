import { describe, expect, it } from 'vitest'
import { alignPositions, cellSize, clusterCenters } from '../sites.js'

describe('lining up sites on the map', () => {
  it('groups close values into one column', () => {
    expect(clusterCenters([10, 10.8, 30, 29.6, 11.2])).toEqual([10.666666666666666, 29.8])
  })

  it('snaps hand-placed sites to their row and column', () => {
    const points = [
      { id: 'a', x: 20.4, y: 50 },
      { id: 'b', x: 19.6, y: 55.8 },
      { id: 'c', x: 27, y: 50.6 },
      { id: 'd', x: 27, y: 55.6 },
    ]
    expect(alignPositions(points)).toEqual([
      { id: 'a', x: 20, y: 50.3 },
      { id: 'b', x: 20, y: 55.7 },
      { id: 'c', x: 27, y: 50.3 },
      { id: 'd', x: 27, y: 55.7 },
    ])
  })

  it('returns nothing when the sites are already lined up', () => {
    expect(alignPositions([{ id: 'a', x: 10, y: 10 }, { id: 'b', x: 20, y: 10 }])).toEqual([])
  })

  it('sizes a site from the nearest column and row', () => {
    const points = [{ x: 20, y: 50 }, { x: 27, y: 50 }, { x: 20, y: 55 }, { x: 40, y: 55 }]
    expect(cellSize(points)).toEqual({ w: 6.16, h: 4.1 })
    expect(cellSize([{ x: 20, y: 50 }])).toBeNull()
  })
})

describe('splitting site numbers between tiers', () => {
  const all = Array.from({ length: 46 }, (_, i) => i + 1)
  it('accepts a split that covers every site once', async () => {
    const { splitNumbers } = await import('../sites.js')
    const r = splitNumbers(all, ['1-6', '41-46', '21, 22, 31, 32', '7-20, 23-30, 33-40'])
    expect(r.error).toBeUndefined()
    expect(r.numbers.map((n) => n.length)).toEqual([6, 6, 4, 30])
  })
  it('refuses a number in two tiers, a missing one, or one that does not exist', async () => {
    const { splitNumbers } = await import('../sites.js')
    expect(splitNumbers(all, ['1-6', '6-46']).error).toMatch('6')
    expect(splitNumbers(all, ['1-6', '7-45']).error).toMatch('46')
    expect(splitNumbers(all, ['1-6', '7-47']).error).toMatch('47')
  })
})
