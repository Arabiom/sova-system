import { describe, expect, it, vi } from 'vitest'

// A head request returns the count with no rows (data is null), as Supabase does.
const head = (count) => {
  const q = { select: () => q, eq: () => q, in: () => q, then: (ok, ko) => Promise.resolve({ data: null, count, error: null }).then(ok, ko) }
  return q
}
let counts = {}
vi.mock('../../api/client.js', () => ({
  supabase: { from: (t) => head(counts[t] ?? 0) },
  unwrap: async (p) => {
    const { data, error } = await p
    if (error) throw error
    return data
  },
  fetchAll: async () => ({ data: [], error: null }),
}))

const { countPendingBookings } = await import('../../api/bookings.js')
const { countPayments, deleteExhibitor } = await import('../../api/exhibitors.js')

describe('counts from head requests', () => {
  it('pending booking requests: the real number (the menu badge and new-request alerts)', async () => {
    counts = { bookings: 3 }
    expect(await countPendingBookings()).toBe(3)
  })

  it('payments of participants: an exhibitor with payments is not deleted', async () => {
    counts = { payments: 2 }
    expect(await countPayments(['e1'])).toBe(2)
    await expect(deleteExhibitor('e1')).rejects.toThrow(/2/)
    expect(await countPayments([])).toBe(0)
  })
})
