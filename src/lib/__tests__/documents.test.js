import { describe, expect, it } from 'vitest'
import { docState, sortDocuments } from '../documents.js'

describe('company documents', () => {
  const today = '2026-10-21'
  it('knows which are valid, expiring within 30 days, expired, or open-ended', () => {
    expect(docState({ expiry_date: '2027-10-21' }, today).state).toBe('valid')
    expect(docState({ expiry_date: '2026-11-10' }, today)).toEqual({ state: 'soon', days: 20 })
    expect(docState({ expiry_date: '2026-10-21' }, today)).toEqual({ state: 'soon', days: 0 })
    expect(docState({ expiry_date: '2026-10-01' }, today)).toEqual({ state: 'expired', days: -20 })
    expect(docState({ expiry_date: null }, today).state).toBe('none')
  })
  it('lists the expired first, then the soonest to expire', () => {
    const docs = [
      { id: 'a', doc_type: 'ب', expiry_date: '2028-01-01' },
      { id: 'b', doc_type: 'أ', expiry_date: null },
      { id: 'c', doc_type: 'ج', expiry_date: '2026-11-01' },
      { id: 'd', doc_type: 'د', expiry_date: '2026-01-01' },
    ]
    expect(sortDocuments(docs, today).map((d) => d.id)).toEqual(['d', 'c', 'a', 'b'])
  })
})
