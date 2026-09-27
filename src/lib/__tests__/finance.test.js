import { describe, expect, it } from 'vitest'
import { DEFAULT_TIERS } from '../constants.js'
import { balanceOf, boothCapacity, exhibitionStats, groupTotals, summarize, tiersOf, vatOf, withVat } from '../finance.js'
import { percent } from '../format.js'
import { toExhibitionRow } from '../../api/exhibitions.js'
import { toExhibitorRow } from '../../api/exhibitors.js'

describe('finance', () => {
  const exhibitors = [
    { id: 'a', exhibition_id: 'x', contract: '600', paid: '600', category: 'أزياء' },
    { id: 'b', exhibition_id: 'x', contract: 450, paid: 200, category: 'جمال' },
    { id: 'c', exhibition_id: 'y', contract: 300, paid: null, category: '' },
  ]

  it('summarizes contracts, collections and VAT', () => {
    expect(summarize(exhibitors)).toEqual({
      count: 3,
      contract: 1350,
      paid: 800,
      remaining: 550,
      vat: 40,
      paidWithVat: 840,
      collectionRate: 59,
    })
  })

  it('handles an empty list without dividing by zero', () => {
    expect(summarize([]).collectionRate).toBe(0)
    expect(percent(5, 0)).toBe(0)
  })

  it('computes VAT at 5%', () => {
    expect(vatOf(100)).toBeCloseTo(5)
    expect(withVat('200')).toBeCloseTo(210)
  })

  it('computes remaining balance per exhibitor', () => {
    expect(balanceOf(exhibitors[1])).toBe(250)
    expect(balanceOf(exhibitors[2])).toBe(300)
  })

  it('uses the total entered on the exhibition, falling back to the tier counts', () => {
    expect(boothCapacity({ booth_tier1_count: 10, booth_tier2_count: '15', booth_tier3_count: 11 })).toBe(36)
    expect(boothCapacity({ booths: 20 })).toBe(20)
    expect(boothCapacity({ booths: 46, booth_tier1_count: 10 })).toBe(46)
    expect(boothCapacity({})).toBe(0)
  })

  it('builds per-exhibition stats from the payment log', () => {
    const payments = [
      { exhibitor_id: 'a', amount: 600 },
      { exhibitor_id: 'b', amount: 150 },
      { exhibitor_id: 'c', amount: 300 },
    ]
    const stats = exhibitionStats({ id: 'x', booth_tier1_count: 5 }, exhibitors, payments)
    expect(stats).toMatchObject({ booked: 2, capacity: 5, contract: 1050, collected: 750, remaining: 300 })
  })

  it('groups and sorts totals', () => {
    expect(groupTotals(exhibitors, (e) => e.category || 'أخرى')).toEqual([
      ['أزياء', 1],
      ['جمال', 1],
      ['أخرى', 1],
    ])
    expect(groupTotals([{ m: 'نقد', a: 5 }, { m: 'شيك', a: 9 }, { m: 'نقد', a: 1 }], (r) => r.m, (r) => r.a)).toEqual([
      ['شيك', 9],
      ['نقد', 6],
    ])
  })

  it('falls back to default tier names and prices', () => {
    expect(tiersOf({ booth_tier1_name: 'VIP', booth_tier1_count: 3 }, DEFAULT_TIERS)).toEqual([
      { name: 'VIP', price: 600, count: 3 },
      { name: 'وسط', price: 450, count: 0 },
      { name: 'خلفي', price: 300, count: 0 },
    ])
  })
})

describe('row mapping', () => {
  it('maps the exhibition form to table columns', () => {
    const row = toExhibitionRow({
      city: 'نزوى',
      mall: 'نزوى جراند مول',
      date_from: '2026-11-01',
      date_to: '2026-11-05',
      booth_tier1_count: '4',
      booth_tier2_price: '500',
      booth_tier2_count: 6,
    })
    expect(row).toMatchObject({
      status: 'تخطيط',
      notes: '',
      booth_tier1_name: 'أمامي',
      booth_tier1_price: 600,
      booth_tier2_price: 500,
      booth_tier3_count: 0,
      booths: 10,
      booth_price: 500,
    })
  })

  it('maps the exhibitor form to table columns without touching paid', () => {
    const row = toExhibitorRow({ brand: 'B', manager: 'M', exhibition_id: 'x', contract: '450.5', paid: 999 })
    expect(row).toMatchObject({ booth: '—', contract: 450.5, status: 'مبدئي' })
    expect(row).not.toHaveProperty('paid')
  })
})

describe('booth total typed on the exhibition', () => {
  it('is saved as typed and drives capacity without skewing the average price', async () => {
    const { toExhibitionRow } = await import('../../api/exhibitions.js')
    const { exhibitionFinancials } = await import('../finance.js')
    expect(toExhibitionRow({ city: 'نزوى', mall: 'م', booths: '46' }).booths).toBe(46)
    expect(toExhibitionRow({ city: 'نزوى', mall: 'م', booth_tier1_count: 10, booth_tier2_count: 5 }).booths).toBe(15)
    const ex = { id: 'x', booths: 40, booth_tier1_count: 10, booth_tier1_price: 200, booth_tier2_count: 10, booth_tier2_price: 100, booth_tier3_count: 0 }
    const f = exhibitionFinancials({ exhibition: ex, expenses: [{ amount: 1500 }] }, [{}, {}, {}])
    expect(f.capacity).toBe(40)
    expect(f.avgPrice).toBe(150) // (10×200 + 10×100) / 20 priced booths
    expect(f.breakEven).toBe(10)
  })
})

describe('any number of planning tiers', () => {
  it('saves every tier and fills the legacy columns with the first three', async () => {
    const { toExhibitionRow, formTiers } = await import('../../api/exhibitions.js')
    const tiers = [
      { name: 'ركن مدخل', price: '200', count: '6' },
      { name: 'كورنر هاير', price: 150, count: 6 },
      { name: 'وسط المعرض', price: 125, count: 4 },
      { name: 'صف داخلي', price: 100, count: 30 },
      { name: '', price: '', count: '' }, // blank row is dropped
    ]
    const row = toExhibitionRow({ city: 'نزوى', mall: 'م', tiers })
    expect(row.tiers).toHaveLength(4)
    expect(row.tiers[3]).toEqual({ name: 'صف داخلي', price: 100, count: 30 })
    expect(row).toMatchObject({ booth_tier1_name: 'ركن مدخل', booth_tier3_count: 4, booths: 46 })
    // editing an old exhibition shows its three columns as rows
    expect(formTiers({ booth_tier1_name: 'أ', booth_tier1_price: 5, booth_tier1_count: 2, booth_tier2_count: 0 })).toEqual([{ name: 'أ', price: 5, count: 2 }])
    expect(formTiers({})).toEqual([{ name: '', price: '', count: '' }])
  })

  it('uses the tier list for capacity, revenue and break-even', async () => {
    const { exhibitionFinancials, boothCapacity } = await import('../finance.js')
    const ex = { id: 'x', tiers: [{ name: 'أ', price: 200, count: 6 }, { name: 'ب', price: 150, count: 6 }, { name: 'ج', price: 125, count: 4 }, { name: 'د', price: 100, count: 30 }] }
    expect(boothCapacity(ex)).toBe(46)
    const f = exhibitionFinancials({ exhibition: ex }, [{}, {}, {}])
    expect(f.capacity).toBe(46)
    expect(f.fullRevenue).toBe(5600) // 1200 + 900 + 500 + 3000
  })
})

describe('VAT off until the company registers', () => {
  it('adds no VAT anywhere when turned off, and 5% when on', async () => {
    const { setVatEnabled, vatEnabled, vatOf, withVat, withoutVat, registrationTotals } = await import('../finance.js')
    const { contractHtml, registrationInvoiceHtml } = await import('../pdf.js')
    try {
      setVatEnabled(false)
      expect(vatEnabled()).toBe(false)
      expect([vatOf(200), withVat(200), withoutVat(200)]).toEqual([0, 200, 200])
      expect(registrationTotals({ boothPrice: 200 })).toMatchObject({ subtotal: 200, vat: 0, total: 200 })
      const contract = contractHtml({ brand: 'B', contract: 200, paid: 100 }, null, { contractNo: 'C', date: 'x' })
      expect(contract).not.toContain('ضريبة')
      expect(contract).toContain('100.000 OMR') // remaining, no VAT
      const invoice = registrationInvoiceHtml({ exhibitor: { brand: 'B', contract: 200, paid: 0, booth_type: 'ركن مدخل', extras: [] }, payment: { amount: 200, status: 'مؤكد' } })
      expect(invoice).not.toContain('ضريبة القيمة المضافة')
      setVatEnabled(true)
      expect(withVat(200)).toBe(210)
    } finally {
      setVatEnabled(true)
    }
  })
})
