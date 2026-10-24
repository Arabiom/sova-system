import { beforeEach, describe, expect, it, vi } from 'vitest'

// A fake Supabase: every query is recorded; `reply(table, op)` decides what it returns.
const calls = []
let reply = () => ({ data: [], error: null })
const query = (table) => {
  const q = { table, op: 'select', filters: [] }
  const chain = new Proxy(
    {},
    {
      get(_, key) {
        if (key === 'then') {
          calls.push(q)
          const res = reply(q)
          return (ok, bad) => Promise.resolve(res).then(ok, bad)
        }
        return (...args) => {
          if (['insert', 'update', 'delete'].includes(key)) {
            q.op = key
            q.body = args[0]
          } else if (key === 'eq' || key === 'is') q.filters.push([args[0], args[1]])
          return chain
        }
      },
    },
  )
  return chain
}
const rpc = vi.fn(async () => ({ data: null, error: null }))
vi.mock('../../lib/supabase.js', () => ({ supabase: { from: (t) => query(t), rpc: (...a) => rpc(...a) } }))

const { confirmPayment, deletePayment } = await import('../payments.js')
const { acceptBooking } = await import('../bookings.js')
const { adjustPaid } = await import('../exhibitors.js')

beforeEach(() => {
  calls.length = 0
  rpc.mockClear()
  reply = () => ({ data: [], error: null })
})

describe('money is counted once', () => {
  it('a payment already confirmed (second click, or a colleague) does not move the paid total again', async () => {
    reply = (q) => (q.table === 'payments' ? { data: [], error: null } : { data: [], error: null })
    await confirmPayment({ id: 'p1', exhibitor_id: 'e1', amount: 50, status: 'بانتظار التأكيد' }, 'u1')
    expect(calls[0].filters).toContainEqual(['status', 'بانتظار التأكيد'])
    expect(rpc).not.toHaveBeenCalled()
    reply = () => ({ data: [{ id: 'p1' }], error: null })
    await confirmPayment({ id: 'p1', exhibitor_id: 'e1', amount: 50, status: 'بانتظار التأكيد' }, 'u1')
    expect(rpc).toHaveBeenCalledWith('adjust_exhibitor_paid', { p_id: 'e1', p_delta: 50 })
  })

  it('a payment someone else already deleted is not taken off twice', async () => {
    await deletePayment({ id: 'p1', exhibitor_id: 'e1', amount: 50, status: 'مؤكد' })
    expect(rpc).not.toHaveBeenCalled()
    reply = () => ({ data: [{ id: 'p1' }], error: null })
    await deletePayment({ id: 'p1', exhibitor_id: 'e1', amount: 50, status: 'مؤكد' })
    expect(rpc).toHaveBeenCalledWith('adjust_exhibitor_paid', { p_id: 'e1', p_delta: -50 })
  })

  it('falls back to read-then-write before migration 041', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'missing' } })
    reply = (q) => (q.op === 'select' ? { data: { paid: 30 }, error: null } : { data: null, error: null })
    await adjustPaid('e1', -50)
    expect(calls.find((q) => q.op === 'update').body).toEqual({ paid: 0 })
  })
})

describe('a booking is accepted once', () => {
  it('refuses when a colleague took it first, and adds no participant', async () => {
    await expect(acceptBooking({ id: 'b1', brand: 'x', phone: '' })).rejects.toThrow()
    expect(calls.some((q) => q.table === 'exhibitors')).toBe(false)
  })

  it('puts the booking back to pending when the participant cannot be saved', async () => {
    reply = (q) => {
      if (q.table === 'bookings' && q.op === 'update' && q.body.status === 'مقبول') return { data: [{ id: 'b1' }], error: null }
      if (q.table === 'clients' && q.op === 'insert') return { data: { id: 'c1' }, error: null }
      if (q.table === 'exhibitors') return { data: null, error: { message: 'boom' } }
      return { data: [], error: null }
    }
    await expect(acceptBooking({ id: 'b1', brand: 'محل', phone: '' })).rejects.toThrow()
    expect(calls.at(-1)).toMatchObject({ table: 'bookings', op: 'update', body: { status: 'معلق' } })
  })
})
