import { describe, expect, it } from 'vitest'
import { classifyProspects, instagramHandle, prospectToClient, readProspectRows, researchHealth, sortProspects } from '../prospects.js'

describe('instagramHandle', () => {
  it('keeps the handle only, in lower case, whatever was written', () => {
    expect(instagramHandle('@My.Shop')).toBe('my.shop')
    expect(instagramHandle('https://www.instagram.com/My.Shop/?hl=ar')).toBe('my.shop')
    expect(instagramHandle('  ')).toBe('')
  })
})

describe('readProspectRows', () => {
  it('finds the header row and reads the known columns', () => {
    const rows = [
      ['قائمة مشاريع'],
      ['الاسم', 'النوع', 'المدينة', 'انستغرام', 'رابط المصدر'],
      ['عطور الوادي', 'عارض محتمل', 'نزوى', 'instagram.com/Wadi.Perfume', 'https://instagram.com/wadi.perfume'],
      ['مول السيب', 'موقع أو فعالية', 'السيب', '', 'https://example.com/mall'],
      ['', '', '', '', ''],
      ['بلا نوع', 'زبون', '', '', ''],
    ]
    const out = readProspectRows(rows)
    expect(out).toHaveLength(3)
    expect(out[0]).toMatchObject({ line: 3, name: 'عطور الوادي', city: 'نزوى', instagram: 'wadi.perfume' })
    expect(out[1].kind).toBe('موقع أو فعالية')
    expect(out[2].kind).toBe('عارض محتمل') // an unknown kind falls back to the default
  })

  it('refuses a file without a name column', () => {
    expect(() => readProspectRows([['المدينة', 'الهاتف'], ['مسقط', '9']])).toThrow()
  })
})

describe('classifyProspects', () => {
  it('sorts rows into new, repeated in the file, already known and incomplete', () => {
    const rows = [
      { line: 2, name: 'جديد 1', phone: '91234567', instagram: '', source_url: 'https://a.com' },
      { line: 3, name: 'نفس الرقم', phone: '+968 9123 4567', instagram: '', source_url: '' },
      { line: 4, name: 'حساب معروف', phone: '', instagram: 'known.shop', source_url: 'https://b.com' },
      { line: 5, name: 'عميل قائم', phone: '', instagram: '', source_url: 'https://c.com' },
      { line: 6, name: '', phone: '99999999', instagram: '', source_url: '' },
    ]
    const out = classifyProspects(rows, [{ name: 'x', instagram: 'known.shop' }], [{ name: 'عميل قائم', phone: '', instagram: '' }])
    expect(out.map((r) => r.state)).toEqual(['new', 'duplicate', 'exists', 'exists', 'invalid'])
    expect(out[0].noSource).toBe(false)
    expect(out[1].noSource).toBe(true)
  })
})

describe('prospectToClient', () => {
  it('becomes a «محتمل» client whose number came from a list, keeping the source', () => {
    const c = prospectToClient({ name: 'عطور الوادي', phone: '91234567', email: '', instagram: 'wadi.perfume', category: 'عطور', city: 'نزوى', notes: '', source_url: 'https://x.com' })
    expect(c).toMatchObject({ status: 'محتمل', contact_source: 'قائمة مستوردة', instagram: '@wadi.perfume', sector: 'عطور' })
    expect(c.notes).toContain('https://x.com')
  })
})

describe('sortProspects', () => {
  it('puts the best fit first, unrated after, and rejected or converted ones last', () => {
    const list = [
      { id: 'a', fit: 1, status: 'جديد', created_at: '2026-10-20' },
      { id: 'b', fit: 3, status: 'غير مناسب', created_at: '2026-10-20' },
      { id: 'c', fit: null, status: 'جديد', created_at: '2026-10-21' },
      { id: 'd', fit: 3, status: 'جديد', created_at: '2026-10-19' },
      { id: 'e', fit: 2, status: 'أصبح عميلاً', created_at: '2026-10-22' },
    ]
    expect(sortProspects(list).map((p) => p.id)).toEqual(['d', 'a', 'c', 'b', 'e'])
  })
})

describe('researchHealth', () => {
  const now = new Date('2026-10-21T08:00:00Z')
  it('is off without a code', () => {
    expect(researchHealth([], null, now).state).toBe('off')
  })
  it('is fine when the last report is recent, late after 36 hours', () => {
    expect(researchHealth([{ run_at: '2026-10-21T03:00:00Z' }], '2026-10-01T00:00:00Z', now).state).toBe('ok')
    const late = researchHealth([{ run_at: '2026-10-18T03:00:00Z' }, { run_at: '2026-10-17T03:00:00Z' }], '2026-10-01T00:00:00Z', now)
    expect(late).toMatchObject({ state: 'late', last: '2026-10-18T03:00:00Z', days: 3 })
  })
  it('counts from when the code was made until the first report', () => {
    expect(researchHealth([], '2026-10-20T21:00:00Z', now).state).toBe('ok')
    expect(researchHealth([], '2026-10-15T21:00:00Z', now).state).toBe('late')
  })
})
