import { describe, expect, it } from 'vitest'
import { toExhibitionRow } from '../../api/exhibitions.js'
import { participationTerms } from '../constants.js'
import { boothNoteOf, cleanPackages, extrasOf, hasOwnPackages, packageOf, packagesOf } from '../packages.js'

const own = {
  booth_packages: [
    { name: 'ركن VIP', area: '4×3 متر', price: 350, includes: 'طاولتان + إضاءة' },
    { name: 'عادي', area: '2×2 متر', price: '90', includes: '' },
  ],
  booth_extras: [{ name: 'كرسي إضافي', price: 3 }],
  booth_note: 'تشمل الكهرباء',
}

describe('packages of an exhibition', () => {
  it('uses the exhibition own packages, extras and note', () => {
    expect(hasOwnPackages(own)).toBe(true)
    expect(packagesOf(own).map((p) => [p.name, p.area, p.price])).toEqual([
      ['ركن VIP', '4×3 متر', 350],
      ['عادي', '2×2 متر', 90],
    ])
    expect(extrasOf(own)).toEqual([{ name: 'كرسي إضافي', price: 3 }])
    expect(boothNoteOf(own)).toBe('تشمل الكهرباء')
    expect(packageOf(own, 'عادي').price).toBe(90)
    expect(packageOf(own, 'ركن مدخل')).toBe(null)
  })

  it('shows nothing generic until the exhibition has its own', () => {
    expect(hasOwnPackages({})).toBe(false)
    expect(packagesOf({})).toEqual([])
    expect(extrasOf({})).toEqual([])
    expect(boothNoteOf({})).toBe('')
    expect(packageOf({}, 'ركن مدخل')).toBe(null)
  })

  it('drops blank rows', () => {
    expect(cleanPackages([{ name: ' ' }, { name: 'أ', price: '5' }])).toEqual([{ name: 'أ', area: '', price: 5, includes: '' }])
  })

  it('is saved with the exhibition only when the form carries it', () => {
    const base = { city: 'مسقط', mall: 'م', date_from: '2026-11-01', date_to: '2026-11-03', tiers: [] }
    expect('booth_packages' in toExhibitionRow(base)).toBe(false)
    const row = toExhibitionRow({ ...base, packages: [{ name: 'أ', price: 10 }, { name: '' }], extras: [], extrasSet: false, booth_note: ' ' })
    expect(row.booth_packages).toEqual([{ name: 'أ', area: '', price: 10, includes: '' }])
    expect(row.booth_extras).toBe(null)
    expect(row.booth_note).toBe('')
  })
})

describe('terms', () => {
  it('state the area of the participant package', () => {
    const site = (area) => participationTerms(area).find((t) => t.title === 'حدود الموقع').text
    expect(site('4×3 متر')).toMatch(/^مساحة الموقع 4×3 متر،/)
    expect(site('')).toMatch(/^مساحة الموقع حسب الباقة المختارة في الاستمارة،/)
  })
})

describe('invoice and contract use the exhibition packages', async () => {
  const { contractHtml, registrationInvoiceHtml } = await import('../pdf.js')
  const exhibition = { id: 'ms', city: 'مسقط', mall: 'مول', date_from: '2026-11-24', date_to: '2026-11-28', ...own }
  const exhibitor = { brand: 'متجر', manager: 'سارة', booth_type: 'ركن VIP', booth: '7', booth_size: '4×3 متر', contract: 350, paid: 0, extras: [] }

  it('invoice line: package, site and what it includes; no generic note', () => {
    const html = registrationInvoiceHtml({ exhibitor, exhibition, payment: null })
    expect(html).toContain('ركن VIP')
    expect(html).toContain('موقع رقم')
    expect(html).toContain('طاولتان + إضاءة')
    expect(html).toContain('تشمل الكهرباء')
    expect(html).toContain('مساحة الموقع 4×3 متر')
    expect(html).not.toContain('2 × 3')
  })

  it('contract: features of the package and its area in the terms', () => {
    const html = contractHtml(exhibitor, exhibition, { contractNo: 'C-1' })
    expect(html).toContain('طاولتان + إضاءة')
    expect(html).toContain('مساحة الموقع 4×3 متر')
  })
})
