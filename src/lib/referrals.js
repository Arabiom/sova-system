// Referral commission: each referrer earns their rate (as agreed per participant) of what the
// participants they brought have actually paid; what was paid out to them is taken off.

import { num } from './format.js'
import { sumBy } from './finance.js'

const baisa = (v) => Math.round(v * 1000) / 1000

/**
 * One row per referrer: { referrer, participants: [{ exhibitor, pct, paid, earned }], base,
 * earned, paidOut, due, payouts }. `expenses` are company expenses (payouts carry referrer_id).
 */
export function referralSummary(referrers = [], exhibitors = [], expenses = []) {
  return referrers.map((r) => {
    const participants = exhibitors
      .filter((e) => e.referrer_id === r.id)
      .map((e) => {
        const pct = e.referral_pct == null ? num(r.rate) : num(e.referral_pct)
        const paid = Math.max(0, num(e.paid))
        return { exhibitor: e, pct, paid, earned: baisa((paid * pct) / 100) }
      })
    const payouts = expenses.filter((x) => x.referrer_id === r.id)
    const earned = baisa(participants.reduce((t, p) => t + p.earned, 0))
    const paidOut = baisa(sumBy(payouts, 'amount'))
    return { referrer: r, participants, payouts, base: baisa(participants.reduce((t, p) => t + p.paid, 0)), earned, paidOut, due: baisa(earned - paidOut) }
  })
}
