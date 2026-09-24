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

  it('uses tier counts for capacity, falling back to the legacy booths column', () => {
    expect(boothCapacity({ booth_tier1_count: 10, booth_tier2_count: '15', booth_tier3_count: 11 })).toBe(36)
    expect(boothCapacity({ booths: 20 })).toBe(20)
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
