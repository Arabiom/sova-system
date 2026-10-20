import { describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/supabase.js', () => ({ supabase: {} }))
const { fetchAll } = await import('../client.js')

/** A fake query over `total` rows that records which ranges were asked for. */
function table(total, { failAt } = {}) {
  const asked = []
  const build = () => ({
    order: () => ({
      range: async (from, to) => {
        asked.push(from)
        if (from === failAt) return { data: null, error: { message: 'boom' } }
        const data = Array.from({ length: Math.max(0, Math.min(to, total - 1) - from + 1) }, (_, i) => ({ id: from + i }))
        return { data, error: null }
      },
    }),
  })
  return { build, asked }
}

describe('fetchAll', () => {
  it('reads a short list in one request', async () => {
    const t = table(10)
    const res = await fetchAll(t.build, { pageSize: 5 * 2 + 1 })
    expect(res.data).toHaveLength(10)
    expect(t.asked).toEqual([0])
  })

  it('reads a long list a few pages at a time, in order, and stops at the last page', async () => {
    const t = table(11304)
    const res = await fetchAll(t.build)
    expect(res.data).toHaveLength(11304)
    expect(res.data.every((r, i) => r.id === i)).toBe(true)
    expect(t.asked.slice(0, 5)).toEqual([0, 1000, 2000, 3000, 4000])
    expect(t.asked.length).toBeLessThanOrEqual(13)
  })

  it('returns the error of a failing page', async () => {
    const t = table(5000, { failAt: 2000 })
    const res = await fetchAll(t.build)
    expect(res).toEqual({ data: null, error: { message: 'boom' } })
  })

  it('handles a list of exactly one full page', async () => {
    const t = table(1000)
    const res = await fetchAll(t.build)
    expect(res.data).toHaveLength(1000)
  })
})
