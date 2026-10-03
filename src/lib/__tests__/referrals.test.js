import { describe, expect, it } from 'vitest'
import { referralSummary } from '../referrals.js'

describe('referral commission', () => {
  const referrers = [{ id: 'r1', name: 'عربي', rate: 5 }, { id: 'r2', name: 'وسيط', rate: 10 }]
  const exhibitors = [
    { id: 'e1', referrer_id: 'r1', referral_pct: 5, paid: 200, contract: 200 },
    { id: 'e2', referrer_id: 'r1', referral_pct: 3, paid: 100, contract: 300 },
    { id: 'e3', referrer_id: 'r2', referral_pct: null, paid: 0, contract: 150 },
    { id: 'e4', referrer_id: null, paid: 500 },
  ]
  const expenses = [{ referrer_id: 'r1', amount: 4 }, { referrer_id: null, amount: 99 }]

  it('earns each participant\'s own rate on what was paid, minus what was paid out', () => {
    const [arabi, agent] = referralSummary(referrers, exhibitors, expenses)
    expect(arabi.participants.map((p) => p.earned)).toEqual([10, 3])
    expect(arabi).toMatchObject({ base: 300, earned: 13, paidOut: 4, due: 9 })
    expect(agent).toMatchObject({ base: 0, earned: 0, paidOut: 0, due: 0 })
    expect(agent.participants[0].pct).toBe(10)
  })

  it('a refund (paid going down) lowers what is earned', () => {
    const [arabi] = referralSummary(referrers, [{ id: 'e1', referrer_id: 'r1', referral_pct: 5, paid: 50 }], [])
    expect(arabi.earned).toBe(2.5)
  })
})
