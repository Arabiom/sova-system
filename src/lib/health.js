// Data health check: things in the records that are probably mistakes, each with where to fix it.
// Nothing here changes data — it only lists what a person should look at.

import { balanceOf, isPlanning } from './finance.js'
import { exhibitionLabel, num, phoneKey } from './format.js'
import { tr } from './i18n.js'
import { packagesOf } from './packages.js'
import { phoneProblem } from './whatsapp.js'

const DAY = 86_400_000
const dayNumber = (iso) => Math.floor(Date.parse(`${String(iso).slice(0, 10)}T00:00:00Z`) / DAY)
const open = (ex) => ex && !['منتهي', 'ملغى'].includes(ex.status)

/**
 * [{ id, level: 'error' | 'warn' | 'info', title, hint, items: [{ label, to }] }] — only the
 * checks that found something. `today` is YYYY-MM-DD.
 */
export function healthChecks({ exhibitions = [], exhibitors = [], sites = [], awaiting = [], payments = null }, today, { money = false } = {}) {
  const exOf = new Map(exhibitions.map((e) => [e.id, e]))
  const file = (exhibitionId) => `/exhibitions/${exhibitionId}`
  const who = (e) => `${e.brand || e.manager || tr('بدون اسم')} — ${exhibitionLabel(exOf.get(e.exhibition_id))}`
  const checks = []
  const add = (id, level, title, hint, items) => items.length && checks.push({ id, level, title, hint, items })
  const live = exhibitors.filter((e) => open(exOf.get(e.exhibition_id)))

  // 1. Phone numbers WhatsApp cannot reach.
  add(
    'phones',
    'error',
    tr('أرقام جوال غير صحيحة'),
    tr('لن تصلهم رسائل واتساب ولا التذكيرات. صحّح الرقم من صفحة العارضين.'),
    live.filter((e) => phoneProblem(e.phone)).map((e) => ({ label: `${who(e)} • ${e.phone || '—'} (${phoneProblem(e.phone)})`, to: '/exhibitors' })),
  )

  // 2. The same phone twice in one exhibition: often a participant registered twice.
  const seen = new Map()
  const twice = []
  for (const e of live) {
    const key = `${e.exhibition_id}|${phoneKey(e.phone)}`
    if (!phoneKey(e.phone)) continue
    if (seen.has(key)) twice.push({ label: `${who(e)} • ${tr('نفس رقم')} ${seen.get(key).brand || seen.get(key).manager}`, to: '/exhibitors' })
    else seen.set(key, e)
  }
  add('twice', 'warn', tr('نفس رقم الجوال مسجّل مرتين في معرض واحد'), tr('تأكد أنه ليس تسجيلاً مكرراً — إن كان لنفس المشارك موقعان فلا مشكلة.'), twice)

  if (money) {
    // 3. Paid more than the contract.
    add(
      'overpaid',
      'warn',
      tr('مدفوع أكثر من قيمة العقد'),
      tr('إما أن قيمة العقد ناقصة، أو أن دفعة سُجّلت مرتين، أو يلزم إرجاع الفرق.'),
      live.filter((e) => balanceOf(e) < -0.0005).map((e) => ({ label: `${who(e)} • ${tr('زيادة')} ${(-balanceOf(e)).toFixed(3)}`, to: '/finance?tab=receivables' })),
    )
    // 4. Confirmed with no contract value.
    add(
      'free',
      'info',
      tr('«مؤكد» بدون قيمة عقد'),
      tr('إن كانت مشاركة مجانية فلا مشكلة، وإلا أضف قيمة العقد.'),
      live.filter((e) => e.status === 'مؤكد' && !(num(e.contract) > 0)).map((e) => ({ label: who(e), to: '/exhibitors' })),
    )
    // 4b. The paid total kept on the participant differs from their confirmed payments.
    if (payments) {
      const sums = new Map()
      for (const p of payments) sums.set(p.exhibitor_id, (sums.get(p.exhibitor_id) || 0) + num(p.amount))
      add(
        'drift',
        'error',
        tr('المدفوع لا يطابق مجموع الدفعات'),
        tr('المبلغ المدفوع في ملف المشارك يختلف عن مجموع دفعاته المؤكدة. راجع دفعاته من «الإيرادات والدفعات».'),
        live
          .filter((e) => Math.abs(num(e.paid) - (sums.get(e.id) || 0)) > 0.0005)
          .map((e) => ({ label: `${who(e)} • ${tr('في الملف')} ${num(e.paid).toFixed(3)} / ${tr('الدفعات')} ${(sums.get(e.id) || 0).toFixed(3)}`, to: '/finance?tab=income' })),
      )
    }
    // 5. Payments waiting for finance for more than 3 days.
    add(
      'awaiting',
      'warn',
      tr('دفعات تنتظر تأكيد الوصول منذ أكثر من 3 أيام'),
      tr('أكّد وصول المبلغ أو احذف الدفعة من «الإيرادات والدفعات».'),
      awaiting
        .filter((p) => dayNumber(today) - dayNumber(p.date || p.created_at) > 3)
        .map((p) => {
          const e = exhibitors.find((x) => x.id === p.exhibitor_id)
          return { label: `${e ? who(e) : '—'} • ${num(p.amount).toFixed(3)} (${String(p.date || p.created_at).slice(0, 10)})`, to: '/finance?tab=income' }
        }),
    )
  }

  // 6. Site prices that match no package of the exhibition: registering from the map can't pick one.
  const priceGaps = []
  for (const ex of exhibitions.filter(open)) {
    const prices = new Set(packagesOf(ex).map((p) => num(p.price)))
    if (!prices.size) continue
    const off = sites.filter((s) => s.exhibition_id === ex.id && !prices.has(num(s.price)))
    if (off.length) priceGaps.push({ label: `${exhibitionLabel(ex)} • ${tr('مواقع')} ${off.map((s) => s.number).sort((a, b) => a - b).join('، ')}`, to: file(ex.id) })
  }
  add('prices', 'warn', tr('أسعار مواقع لا تطابق أي باقة'), tr('عند التسجيل من الخارطة لن تُختار الباقة تلقائياً. صحّح فئة الموقع أو أسعار الباقات.'), priceGaps)

  // 7. Exhibitions whose dates are over but the status was not updated.
  add(
    'ended',
    'warn',
    tr('معارض انتهى تاريخها ولم تُحدَّث حالتها'),
    tr('غيّر الحالة إلى «منتهي» حتى لا تظهر في التذكيرات والقوائم القادمة.'),
    exhibitions.filter((ex) => open(ex) && ex.date_to && ex.date_to < today).map((ex) => ({ label: `${exhibitionLabel(ex)} • ${tr('انتهى')} ${ex.date_to}`, to: file(ex.id) })),
  )

  // 8. Still «تخطيط» close to opening: its money is left out of every total.
  add(
    'planning',
    'info',
    tr('معارض قريبة وما زالت «قيد التخطيط»'),
    tr('أرقامها لا تدخل في المالية حتى تُغيَّر الحالة إلى «قادم».'),
    exhibitions
      .filter((ex) => isPlanning(ex) && ex.date_from && dayNumber(ex.date_from) - dayNumber(today) <= 45)
      .map((ex) => ({ label: `${exhibitionLabel(ex)} • ${tr('يفتتح')} ${ex.date_from}`, to: file(ex.id) })),
  )

  const rank = { error: 0, warn: 1, info: 2 }
  return checks.sort((a, b) => rank[a.level] - rank[b.level])
}
