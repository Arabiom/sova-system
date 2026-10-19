import { describe, expect, it } from 'vitest'
import { campaignActions, segmentClients } from '../digital.js'

const clients = [
  { id: 'a', name: 'أ', phone: '91111111', contact_source: 'نموذج الموقع', status: 'نشط', city: 'نزوى', sector: 'عطور' },
  { id: 'b', name: 'ب', phone: '+968 9222 2222', contact_source: 'صفحة البايو', status: 'نشط', city: 'مسقط' },
  { id: 'c', name: 'ج', phone: '0096892222222', contact_source: 'عارض سابق', status: 'نشط' }, // same number as ب
  { id: 'd', name: 'د', phone: '123', contact_source: 'نموذج الموقع', status: 'نشط' }, // not a number
  { id: 'e', name: 'هـ', phone: '93333333', contact_source: 'قائمة مستوردة', status: 'متوقف' },
  { id: 'f', name: 'و', phone: '94444444', contact_source: '', status: 'محتمل', last_contact_at: '2026-10-15T10:00:00Z' },
]

describe('choosing a campaign’s recipients', () => {
  it('never includes a number on the stop list, whatever its written form', () => {
    const r = segmentClients(clients, {}, new Set(['91111111']), '2026-10-19')
    expect(r.recipients.map((x) => x.client_id)).not.toContain('a')
    expect(r.left.optedOut).toBe(1)
  })

  it('each number once, and only valid numbers', () => {
    const r = segmentClients(clients, {}, new Set(), '2026-10-19')
    expect(r.recipients.map((x) => x.client_id)).toEqual(['a', 'b', 'e', 'f'])
    expect(r.left).toEqual({ noPhone: 1, optedOut: 0, duplicate: 1 })
  })

  it('filters by number source, status, city and days since last contact', () => {
    expect(segmentClients(clients, { sources: ['نموذج الموقع', 'صفحة البايو'] }).recipients.map((x) => x.client_id)).toEqual(['a', 'b'])
    expect(segmentClients(clients, { statuses: ['نشط'], cities: ['مسقط'] }).recipients.map((x) => x.client_id)).toEqual(['b'])
    expect(segmentClients(clients, { sources: [''] }).recipients.map((x) => x.client_id)).toEqual(['f'])
    // contacted 4 days ago: left out of «not contacted for 7 days»; never contacted counts as long ago
    const r = segmentClients(clients, { notContactedDays: 7 }, new Set(), '2026-10-19')
    expect(r.recipients.map((x) => x.client_id)).not.toContain('f')
    expect(r.recipients.map((x) => x.client_id)).toContain('a')
  })
})

describe('who may do what with a campaign', () => {
  const at = (status) => ({ status })
  it('only the admin approves, and only a campaign waiting for approval', () => {
    expect(campaignActions(at('بانتظار الاعتماد'), { role: 'admin', canWrite: true }).approve).toBe(true)
    expect(campaignActions(at('بانتظار الاعتماد'), { role: 'marketing', canWrite: true }).approve).toBe(false)
    expect(campaignActions(at('بانتظار الاعتماد'), { role: 'finance', canWrite: true }).approve).toBe(false)
    expect(campaignActions(at('مسودة'), { role: 'admin', canWrite: true }).approve).toBe(false)
  })
  it('the viewer does nothing; a sent campaign stays as it is', () => {
    expect(Object.values(campaignActions(at('مسودة'), { role: 'viewer', canWrite: false })).some(Boolean)).toBe(false)
    const sent = campaignActions(at('أُرسلت'), { role: 'admin', canWrite: true })
    expect([sent.cancel, sent.backToDraft, sent.remove, sent.approve]).toEqual([false, false, false, false])
  })
})
