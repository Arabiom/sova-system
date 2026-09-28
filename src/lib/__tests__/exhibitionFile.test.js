import { describe, expect, it } from 'vitest'
import { DEFAULT_TIERS } from '../constants.js'
import { toCsv } from '../csv.js'
import { clientHistory, exhibitionFinancials, newReference, occupancyOf } from '../finance.js'
import { phoneKey } from '../format.js'
import { matchPlan, planImport } from '../importSheet.js'
import { friendlyError } from '../../api/client.js'
import { signedAmount } from '../../api/payments.js'
import { formatRanges, parseRanges, siteStatus, tierColor, tiersFromSites } from '../sites.js'

// The approved SOVA map from the business reference (46 sites, four price tiers).
const sovaMap = () => {
  const tierOf = (n) =>
    n <= 6 ? ['ركن مدخل', 200] : n >= 41 ? ['كورنر هايبر', 150] : [21, 22, 31, 32].includes(n) ? ['وسط المعرض', 125] : ['صف داخلي', 100]
  return Array.from({ length: 46 }, (_, i) => {
    const [tier, price] = tierOf(i + 1)
    return { id: `s${i + 1}`, exhibition_id: 'nz', number: i + 1, tier, price, exhibitor_id: null }
  })
}

describe('site ranges', () => {
  it('parses mixed ranges and lists', () => {
    expect(parseRanges('1-6, 9 12–14')).toEqual([1, 2, 3, 4, 5, 6, 9, 12, 13, 14])
    expect(parseRanges('21، 22، 31، 32')).toEqual([21, 22, 31, 32])
    expect(parseRanges('7-20, 23-30, 33-40')).toHaveLength(30)
  })
  it('rejects bad input', () => {
    expect(() => parseRanges('a-3')).toThrow()
    expect(() => parseRanges('9-3')).toThrow()
  })
  it('formats back to compact ranges', () => {
    expect(formatRanges([7, 8, 9, 20, 23, 24, 25])).toBe('7–9، 20، 23–25')
    expect(formatRanges([16, 22])).toBe('16، 22')
  })
})

describe('tiers and the SOVA map', () => {
  it('reproduces the four tiers and the 5,600 full revenue', () => {
    const tiers = tiersFromSites(sovaMap())
    expect(tiers.map((t) => [t.name, t.count, t.price, t.ranges])).toEqual([
      ['ركن مدخل', 6, 200, '1–6'],
      ['صف داخلي', 30, 100, '7–20، 23–30، 33–40'],
      ['وسط المعرض', 4, 125, '21–22، 31–32'],
      ['كورنر هايبر', 6, 150, '41–46'],
    ])
    expect(tiers.reduce((t, x) => t + x.total, 0)).toBe(5600)
  })

  it('colours tiers named after colours', () => {
    expect(tierColor('أحمر فاتح')).toBe('#F28B7D')
    expect(tierColor('أحمر داكن')).toBe('#8B1818')
    expect(tierColor('صف داخلي', 1)).toMatch(/^#/)
  })

  it('derives site status from the holder', () => {
    const site = { exhibitor_id: 'x' }
    expect(siteStatus({ exhibitor_id: null })).toBe('متاح')
    expect(siteStatus(site, { contract: 100, paid: 0 })).toBe('محجوز')
    expect(siteStatus(site, { contract: 100, paid: 40 })).toBe('مدفوع جزئياً')
    expect(siteStatus(site, { contract: 100, paid: 100 })).toBe('مدفوع')
  })
})

describe('exhibition financials', () => {
  it('matches the Nizwa December figures: break-even 26 sites (57%)', () => {
    const f = exhibitionFinancials(
      { exhibition: { id: 'nz' }, sites: sovaMap(), expenses: [{ amount: 840, paid: false }, { amount: 2300, paid: false }] },
      DEFAULT_TIERS,
    )
    expect(f.capacity).toBe(46)
    expect(f.fullRevenue).toBe(5600)
    expect(f.expensesTotal).toBe(3140)
    expect(f.netAtFull).toBe(2460)
    expect(f.breakEven).toBe(26)
    expect(f.breakEvenPct).toBe(57)
  })

  it('matches the Muscat Mall figures: 25×130 + 25×90, break-even 38 sites (76%)', () => {
    const sites = Array.from({ length: 50 }, (_, i) => ({ number: i + 1, tier: i < 25 ? 'مميز' : 'عادي', price: i < 25 ? 130 : 90 }))
    const f = exhibitionFinancials({ exhibition: { id: 'm' }, sites, expenses: [{ amount: 1575 }, { amount: 2500 }] }, DEFAULT_TIERS)
    expect(f.fullRevenue).toBe(5500)
    expect(f.netAtFull).toBe(1425)
    expect(f.breakEven).toBe(38)
    expect(f.breakEvenPct).toBe(76)
  })

  it('counts contracts, collections, sponsors and cash position', () => {
    const sites = sovaMap()
    sites[0].exhibitor_id = 'a'
    sites[1].exhibitor_id = 'a'
    const f = exhibitionFinancials(
      {
        exhibition: { id: 'nz' },
        sites,
        exhibitors: [{ id: 'a', exhibition_id: 'nz', contract: 350, paid: 100 }, { id: 'z', exhibition_id: 'other', contract: 999 }],
        payments: [{ exhibitor_id: 'a', amount: 100 }, { exhibitor_id: 'z', amount: 50 }],
        expenses: [{ amount: 840, paid: true }, { amount: 2300, paid: false }],
        sponsors: [{ amount: 405, status: 'مدفوع' }, { amount: 200, status: 'متفق عليه' }],
      },
      DEFAULT_TIERS,
    )
    expect(f).toMatchObject({ booked: 2, contract: 350, collected: 100, outstanding: 250, sponsorship: 605 })
    expect(f.netOnContracts).toBe(350 + 605 - 3140)
    expect(f.cashPosition).toBe(100 + 405 - 840)
    expect(f.breakEven).toBe(21) // (3140 - 605) / (5600/46) = 20.8 → 21
  })

  it('falls back to the planning tiers when there is no site map', () => {
    const ex = { id: 'e', booth_tier1_count: 10, booth_tier2_count: 15, booth_tier3_count: 11 }
    const f = exhibitionFinancials({ exhibition: ex }, DEFAULT_TIERS)
    expect(f.hasSites).toBe(false)
    expect(f.capacity).toBe(36)
    expect(f.fullRevenue).toBe(10 * 600 + 15 * 450 + 11 * 300)
    expect(occupancyOf(ex, [], [{ exhibition_id: 'e' }])).toEqual({ booked: 1, capacity: 36 })
  })
})

describe('clients', () => {
  it('matches phones in any format', () => {
    expect(phoneKey('+968 9123 4567')).toBe('91234567')
    expect(phoneKey('0096891234567')).toBe('91234567')
    expect(phoneKey(91234567)).toBe('91234567')
  })

  it('summarises a client history, newest exhibition first', () => {
    const exhibitions = [{ id: 'a', date_from: '2026-11-24' }, { id: 'b', date_from: '2026-12-27' }]
    const h = clientHistory(
      { id: 'c' },
      [
        { client_id: 'c', exhibition_id: 'a', contract: 200, paid: 200 },
        { client_id: 'c', exhibition_id: 'b', contract: 150, paid: 50 },
        { client_id: 'x', exhibition_id: 'b', contract: 999, paid: 0 },
      ],
      exhibitions,
    )
    expect(h).toMatchObject({ count: 2, contract: 350, paid: 250, outstanding: 100 })
    expect(h.lastExhibition.id).toBe('b')
  })

  it('writes Excel-friendly CSV', () => {
    const csv = toCsv([{ n: 'براند "حسناء"', p: '7732,7714' }], [
      { label: 'الاسم', value: (r) => r.n },
      { label: 'الهاتف', value: (r) => r.p },
    ])
    expect(csv.startsWith('﻿')).toBe(true)
    expect(csv).toContain('"براند ""حسناء"""')
    expect(csv).toContain('"7732,7714"')
  })
})

describe('Excel participants import', () => {
  // Same layout as the company's "تسجيل المشاركين" sheet: two title rows, then the header.
  const rows = [
    ['معرض سوفا — نزوى جراند مول', null],
    ['جدول تسجيل المشاركين', null],
    ['رقم الكشك', 'لون الموقع', 'السعر (ر.ع)', 'المبلغ المدفوع', 'المبلغ المتبقي ', 'اسم المشارك ', 'الشركة', 'رقم الهاتف', 'نوع النشاط', 'حالة الدفع', 'ملاحظات'],
    [1, 'أحمر فاتح', 175, 100, 75, 'اميرة', 'براند حسناء', 77327714, 'أزياء', null, null],
    [2, 'أحمر فاتح', 175, 0, 175, 'اميرة', 'براند حسناء', 77327714, 'أزياء', null, null],
    [3, 'أحمر فاتح', 200, null, null, null, null, null, null, null, null],
    [4, 'أحمر فاتح', 200, null, null, null, null, null, null, null, null],
    [5, 'أسود', 0, 0, 0, 'وسام', 'جمالك ورد ', 98309399, 'عطور', null, null],
    [5, 'أسود', 50, null, null, null, null, null, null, null, null],
    [6, 'أسود', 100, null, null, null, null, null, null, null, null],
    [7, 'أسود', 100, 80, 20, 'ام يوسف', 'دخونك', 71499700, 'بخور', 'تحويل عرابي', 'ستاند إضافي'],
    [8, 'أسود', 100, null, null, null, null, null, null, null, null],
    [9, 'رمادي', 125, 0, 125, 'ايمان', 'ريحة العروس - ', 9063699, 'عطور', null, null],
    ['الإجمالي', null, 1175, 180, null, null, null, null, null, null, null],
  ]

  it('builds the site map with list prices and groups participants', () => {
    const plan = planImport(rows)
    expect(plan.sites).toHaveLength(9)
    expect(plan.sites.find((s) => s.number === 1)).toEqual({ number: 1, tier: 'أحمر فاتح', price: 200 })
    expect(plan.sites.find((s) => s.number === 5).price).toBe(100)
    expect(plan.exhibitors).toHaveLength(4)
    const hasna = plan.exhibitors.find((e) => e.brand === 'براند حسناء')
    expect(hasna).toMatchObject({ numbers: [1, 2], contract: 350, paid: 100, manager: 'اميرة' })
    expect(plan.exhibitors.find((e) => e.brand === 'دخونك').notes).toBe('حالة الدفع: تحويل عرابي | ستاند إضافي')
    expect(plan.exhibitors.find((e) => e.phone === '9063699').brand).toBe('ريحة العروس')
    expect(plan.totals).toMatchObject({ sites: 9, booked: 5, participants: 4, contract: 575, paid: 180 })
  })

  it('reports duplicates, short phones and discounts', () => {
    const { warnings } = planImport(rows)
    expect(warnings.some((w) => w.includes('الكشك رقم 5 مكرر'))).toBe(true)
    expect(warnings.some((w) => w.includes('9063699'))).toBe(true)
    expect(warnings.some((w) => w.includes('بسعر 175 بدل 200'))).toBe(true)
  })

  it('explains a file without the expected columns', () => {
    expect(() => planImport([['الاسم', 'الهاتف'], ['x', 1]])).toThrow('رقم الكشك')
  })
})

describe('re-importing the same file', () => {
  const plan = {
    exhibitors: [
      { brand: 'براند حسناء', manager: 'اميرة', phone: '77327714', numbers: [1, 2], contract: 350, paid: 100 },
      { brand: 'دخونك', manager: 'ام يوسف', phone: '71499700', numbers: [17], contract: 100, paid: 80 },
      { brand: 'ماهو', manager: 'خديجة', phone: '', numbers: [32], contract: 125, paid: 0 },
    ],
  }

  it('creates everyone the first time', () => {
    const m = matchPlan(plan, [])
    expect(m).toMatchObject({ created: 3, updated: 0 })
    expect(m.participants.map((p) => p.paidToRecord)).toEqual([100, 80, 0])
  })

  it('updates instead of duplicating, and records only new money', () => {
    const existing = [
      { id: 'a', brand: 'Hasna', phone: '+968 7732 7714', paid: 100 }, // same phone, different spelling
      { id: 'b', brand: 'دخونك', phone: '71499700', paid: 50 },
      { id: 'c', brand: 'ماهو', phone: '', paid: 0 }, // no phone: matched by name
      { id: 'd', brand: 'عارض قديم', phone: '90000000', paid: 10 },
    ]
    const m = matchPlan(plan, existing)
    expect(m).toMatchObject({ created: 0, updated: 3 })
    expect(m.participants.map((p) => p.existing.id)).toEqual(['a', 'b', 'c'])
    expect(m.participants.map((p) => p.paidToRecord)).toEqual([0, 30, 0])
    expect(m.untouched.map((e) => e.id)).toEqual(['d'])
  })

  it('flags when the system already holds more than the file', () => {
    const m = matchPlan(plan, [{ id: 'b', brand: 'دخونك', phone: '71499700', paid: 120 }])
    expect(m.participants[1]).toMatchObject({ paidToRecord: 0, paidAhead: 40 })
  })
})

describe('payments, references and errors', () => {
  it('stores refunds as negative amounts whatever sign is typed', () => {
    expect(signedAmount('إرجاع', 85)).toBe(-85)
    expect(signedAmount('إرجاع', -85)).toBe(-85)
    expect(signedAmount('كامل', -50)).toBe(50)
  })

  it('makes dated, non-repeating references', () => {
    const now = new Date('2026-09-27T10:00:00Z')
    expect(newReference('INV', now)).toMatch(/^INV-260927-[0-9A-Z]{4}$/)
    const many = new Set(Array.from({ length: 200 }, () => newReference('INV', now)))
    expect(many.size).toBeGreaterThan(195)
  })

  it('explains database errors in Arabic', () => {
    expect(friendlyError({ code: '23503', message: 'violates foreign key constraint' })).toContain('بيانات مرتبطة')
    expect(friendlyError({ code: 'PGRST205', message: 'Could not find the table' })).toContain('تحديث')
    expect(friendlyError(new TypeError('Failed to fetch'))).toContain('الإنترنت')
    expect(friendlyError({ message: 'something else' })).toBe('something else')
  })

  it('neutralises spreadsheet formulas in CSV but keeps negative numbers', () => {
    const csv = toCsv([{ v: '=HYPERLINK("x")' }, { v: '-1340.000' }, { v: '@SUM(A1)' }], [{ label: 'v', value: (r) => r.v }])
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`)
    expect(csv).toContain('\r\n-1340.000')
    expect(csv).toContain("'@SUM(A1)")
  })
})
