import { describe, expect, it } from 'vitest'
import { chosenExtras, validateRegistration } from '../../api/registration.js'
import { BOOTH_EXTRAS, BOOTH_PACKAGES, PAYMENT_PENDING } from '../constants.js'
import { exhibitionFinancials, exhibitionStats, isConfirmed, registrationTotals } from '../finance.js'
import { contractHtml, participantCharges, registrationInvoiceHtml } from '../pdf.js'

const extraPrices = Object.fromEntries(BOOTH_EXTRAS.map((x) => [x.name, x.price]))

describe('registration form', () => {
  it('has the four booth packages and extras at the form prices', () => {
    expect(BOOTH_PACKAGES.map((p) => [p.name, p.price])).toEqual([
      ['ركن مدخل', 200],
      ['كورنر هاير', 150],
      ['وسط المعرض', 125],
      ['صف داخلي', 100],
    ])
    expect(extraPrices).toEqual({ 'علاقة': 10, 'طاولة إضافية': 5, 'ستاند للأغراض': 10, 'لوحة خلفية مطبوعة': 15 })
  })

  it('adds VAT 5% on top of package + extras', () => {
    const extras = chosenExtras({ extras: { 'علاقة': 1, 'طاولة إضافية': 2, 'ستاند للأغراض': 0 }, extraPrices, otherExtras: 'رف', otherAmount: '3' })
    expect(extras).toEqual([
      { name: 'علاقة', price: 10, qty: 1 },
      { name: 'طاولة إضافية', price: 5, qty: 2 },
      { name: 'رف', price: 3, qty: 1 },
    ])
    // 200 + 10 + 2×5 + 3 = 223; VAT 11.150; total 234.150
    expect(registrationTotals({ boothPrice: 200, extras })).toEqual({ boothPrice: 200, extrasTotal: 23, discount: 0, subtotal: 223, vat: 11.15, total: 234.15 })
    expect(registrationTotals({ boothPrice: 100 })).toMatchObject({ subtotal: 100, vat: 5, total: 105 })
  })

  it('keeps a discount as its own line and takes it off the total', () => {
    const extras = chosenExtras({ extras: { 'علاقة': 1 }, extraPrices, discount: '25' })
    expect(extras).toEqual([
      { name: 'علاقة', price: 10, qty: 1 },
      { name: 'خصم', price: -25, qty: 1 },
    ])
    // 200 + 10 − 25 = 185
    expect(registrationTotals({ boothPrice: 200, extras })).toMatchObject({ extrasTotal: 10, discount: 25, subtotal: 185 })
    // the invoice rebuilds the full package price from the stored contract (185) and extras
    expect(participantCharges({ contract: 185, extras })).toMatchObject({ boothPrice: 200, discount: 25, subtotal: 185 })
  })

  it('lists what is missing before saving', () => {
    expect(validateRegistration({})).toEqual(expect.arrayContaining(['اختر المعرض', 'الاسم الكامل', 'اسم المشروع', 'رقم التواصل', 'القطاع', 'نظام البوث']))
    const ok = { exhibition_id: 'e', manager: 'م', brand: 'ب', phone: '9', category: 'أزياء', package: 'صف داخلي', terms_accepted: true }
    expect(validateRegistration(ok)).toEqual([])
    expect(validateRegistration({ ...ok, terms_accepted: false })).toEqual(['موافقة المشارك على الشروط والأحكام'])
    expect(validateRegistration({ ...ok, amount: 100 })).toEqual(['طريقة السداد'])
  })
})

describe('payments awaiting confirmation', () => {
  const ex = { id: 'x' }
  const exhibitors = [{ id: 'a', exhibition_id: 'x', contract: 200 }]
  const payments = [
    { exhibitor_id: 'a', amount: 100 },
    { exhibitor_id: 'a', amount: 50, status: 'مؤكد' },
    { exhibitor_id: 'a', amount: 200, status: PAYMENT_PENDING },
  ]

  it('are not counted as collected', () => {
    expect(payments.map(isConfirmed)).toEqual([true, true, false])
    expect(exhibitionStats(ex, exhibitors, payments).collected).toBe(150)
    expect(exhibitionFinancials({ exhibition: ex, exhibitors, payments }, [{}, {}, {}]).collected).toBe(150)
  })
})

describe('tax invoice', () => {
  const exhibitor = {
    brand: 'متجر الورد',
    manager: 'سارة',
    civil_id: '12345678',
    phone: '91234567',
    category: 'زهور وهدايا',
    products: 'باقات',
    booth_type: 'ركن مدخل',
    booth: '3',
    extras: [{ name: 'علاقة', price: 10, qty: 1 }],
    contract: 210,
    paid: 0,
    terms_accepted: true,
  }
  const exhibition = { city: 'نزوى', mall: 'نزوى جراند مول', date_from: '2026-12-27', date_to: '2026-12-31' }

  it('rebuilds the charges from the stored exhibitor', () => {
    expect(participantCharges(exhibitor)).toMatchObject({ boothPrice: 200, extrasTotal: 10, subtotal: 210, vat: 10.5, total: 220.5 })
  })

  it('shows every form detail, VAT, what was paid and the pending state', () => {
    const payment = { invoice_no: 'INV-261227-AB12', amount: 210, method: 'تحويل عبر رقم الهاتف', transfer_ref: '99887766', date: '2026-10-01', status: PAYMENT_PENDING }
    const html = registrationInvoiceHtml({ exhibitor, exhibition, payment })
    for (const text of ['>فاتورة<', 'INV-261227-AB12', 'سارة', '12345678', 'متجر الورد', '91234567', 'زهور وهدايا', 'باقات', 'ركن مدخل', 'علاقة', 'نزوى جراند مول', '99887766']) {
      expect(html).toContain(text)
    }
    expect(html).not.toContain('فاتورة ضريبية')
    expect(html).toContain('210.000 OMR') // subtotal
    expect(html).toContain('10.500 OMR') // VAT
    expect(html).toContain('220.500 OMR') // total = paid (210 + VAT)
    expect(html).toContain('بانتظار تأكيد')
    expect(html).toContain('0.000 OMR') // nothing remaining
    expect(html).toContain('غير قابلة للاسترداد بعد تأكيد الحجز') // terms page
  })

  it('does not show a pending notice once the payment is confirmed', () => {
    const html = registrationInvoiceHtml({ exhibitor: { ...exhibitor, paid: 100 }, exhibition, payment: { invoice_no: 'I', amount: 100, method: 'نقد', status: 'مؤكد' } })
    expect(html).not.toContain('بانتظار تأكيد')
    expect(html).toContain('كاش')
    expect(html).toContain('105.000 OMR') // paid with VAT
    expect(html).toContain('115.500 OMR') // remaining 220.5 - 105
  })

  it('uses the form cancellation terms in contracts', () => {
    const html = contractHtml({ brand: 'B', contract: 100 }, null, { contractNo: 'C', date: 'x' })
    expect(html).toContain('غير قابلة للاسترداد بعد تأكيد الحجز')
    expect(html).not.toContain('خصم 50%')
  })
})

describe('paid amount includes VAT; several sectors', () => {
  it('splits what the participant paid into subscription + VAT', async () => {
    const { withoutVat, vatOf } = await import('../finance.js')
    expect(withoutVat(210)).toBe(200)
    expect(withoutVat(225.75)).toBe(215)
    expect(withoutVat(105)).toBe(100)
    expect(withoutVat(100)).toBe(95.238)
    expect(Number((withoutVat(100) + vatOf(withoutVat(100))).toFixed(3))).toBe(100)
  })

  it('accepts up to three sectors', async () => {
    const { sectorsText, MAX_SECTORS } = await import('../../api/registration.js')
    expect(MAX_SECTORS).toBe(3)
    expect(sectorsText({ categories: ['أزياء', 'أقمشة'] })).toBe('أزياء، أقمشة')
    const ok = { exhibition_id: 'e', manager: 'م', brand: 'ب', phone: '9', package: 'صف داخلي', terms_accepted: true }
    expect(validateRegistration({ ...ok, categories: [] })).toEqual(['القطاع'])
    expect(validateRegistration({ ...ok, categories: ['أزياء', 'أقمشة', 'تجميل'] })).toEqual([])
    expect(validateRegistration({ ...ok, categories: ['أزياء', 'أقمشة', 'تجميل', 'حلويات'] })).toEqual(['القطاع (3 كحد أقصى)'])
  })
})
