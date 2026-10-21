import { describe, expect, it } from 'vitest'
import { clientSectors, contactPlan, suits, upcomingExhibitions } from '../matching.js'
import { sectorsIn } from '../prospects.js'
import { siteReview, sortAdvisorItems } from '../advisor.js'

const today = '2026-10-21'
const omani = { id: 'om', name: 'معرض المنتجات العمانية', city: 'مسقط', mall: 'م', date_from: '2026-12-10', date_to: '2026-12-14', status: 'قادم', sectors: ['حرف يدوية', 'عطور وبخور'] }
const open = { id: 'op', city: 'نزوى', mall: 'ن', date_from: '2027-01-20', date_to: '2027-01-24', status: 'تخطيط', sectors: [] }
const past = { id: 'pa', city: 'صحار', mall: 'ص', date_from: '2026-09-01', date_to: '2026-09-05', status: 'منتهي', sectors: [] }

describe('sorting clients by sector', () => {
  it('reads every sector a text speaks of, loosely', () => {
    expect(sectorsIn('عبايات وعطور')).toEqual(['عطور وبخور', 'أزياء'])
    expect(sectorsIn('ازياْء')).toEqual(['أزياء'])
    expect(sectorsIn('')).toEqual([])
  })
  it('takes the sector and the products, and the name only when both are empty', () => {
    expect(clientSectors({ sector: '', products: 'فخار وسعفيات', name: 'عطور' })).toEqual(['حرف يدوية'])
    expect(clientSectors({ name: 'بيت العود' })).toEqual(['عطور وبخور'])
    expect(clientSectors({ sector: 'خدمات', name: 'بيت العود' })).toEqual([])
  })
  it('keeps the coming exhibitions, soonest first', () => {
    expect(upcomingExhibitions([open, past, omani, { ...omani, id: 'c', status: 'ملغى' }], today).map((e) => e.id)).toEqual(['om', 'op'])
    expect(suits(open, [])).toBe(true)
    expect(suits(omani, ['أزياء'])).toBe(false)
  })
  it('says which exhibition suits a client, why, and from when to contact it', () => {
    const upcoming = upcomingExhibitions([omani, open], today)
    const perfume = contactPlan({ sector: 'عطور وبخور' }, upcoming, today)
    expect(perfume).toMatchObject({ exhibition: { id: 'om' }, matched: ['عطور وبخور'], open: false, from: '2026-10-11', now: true })
    const fashion = contactPlan({ sector: 'أزياء' }, upcoming, today)
    expect(fashion).toMatchObject({ exhibition: { id: 'op' }, open: true, from: '2026-11-21', now: false })
    expect(contactPlan({ sector: 'عطور وبخور' }, upcoming, today, new Set(['om'])).exhibition.id).toBe('op')
    expect(contactPlan({ sector: 'عطور وبخور', outreach: 'غير مناسب' }, upcoming, today)).toBeNull()
    expect(contactPlan({ sector: 'أزياء' }, [omani], today)).toBeNull()
  })
})

describe('the follow-up employee', () => {
  it('puts open urgent tasks first and done ones last', () => {
    const items = [
      { id: 'a', status: 'تمت', priority: 'عاجلة', created_at: '1' },
      { id: 'b', status: 'مفتوحة', priority: 'عادية', created_at: '2' },
      { id: 'c', status: 'مفتوحة', priority: 'عاجلة', created_at: '3' },
      { id: 'd', status: 'مؤجلة', priority: 'عاجلة', created_at: '4' },
    ]
    expect(sortAdvisorItems(items).map((i) => i.id)).toEqual(['c', 'b', 'd', 'a'])
  })
  it('reviews the site from the records, problems first, with what to do', () => {
    const soon = { ...omani, date_from: '2026-11-01', date_to: '2026-11-05', booths: 10 }
    const review = siteReview({
      role: 'admin',
      today,
      advisorReady: false,
      exhibitions: [soon, open],
      exhibitors: [
        { exhibition_id: 'om', contract: 100, paid: 40 },
        { exhibition_id: 'om', contract: 100, paid: 100 },
      ],
      clients: [{ sector: '' }, { sector: 'أزياء' }],
      bookingsPending: 2,
      documents: [{ expiry_date: '2026-10-01' }, { expiry_date: '2026-11-01' }],
      followups: [{ status: 'مفتوحة', due_date: '2026-10-01' }],
      campaigns: [{ status: 'بانتظار الاعتماد' }],
      prospects: [{ status: 'جديد' }],
    })
    const refs = review.map((r) => r.ref)
    expect(refs.slice(0, 2)).toEqual(['db-040', 'docs-expired'])
    expect(refs).toEqual(expect.arrayContaining(['docs-soon', 'bookings', 'owing-om', 'free-om', 'sectors-op', 'clients-sector', 'followups', 'campaigns', 'prospects']))
    expect(review.find((r) => r.ref === 'owing-om').args.slice(1)).toEqual([11, 1])
    expect(review.find((r) => r.ref === 'free-om').args[0]).toBe(8)
    expect(review.every((r) => r.fix)).toBe(true)
  })
  it('shows no amounts or papers to marketing', () => {
    const review = siteReview({ role: 'marketing', today, exhibitions: [{ ...omani, date_from: '2026-11-01' }], exhibitors: [{ exhibition_id: 'om', contract: 100, paid: 0 }], documents: [] })
    expect(review.some((r) => r.ref.startsWith('owing') || r.ref.startsWith('docs') || r.ref === 'db-039')).toBe(false)
  })
})
