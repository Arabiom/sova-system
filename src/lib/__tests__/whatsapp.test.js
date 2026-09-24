import { describe, expect, it } from 'vitest'
import {
  confirmationMessage,
  daysUntil,
  exhibitionReminderMessage,
  normalizePhone,
  paymentReminderMessage,
  whatsappUrl,
} from '../whatsapp.js'

describe('normalizePhone', () => {
  it.each([
    ['91234567', '96891234567'],
    ['+968 9123 4567', '96891234567'],
    ['00968-9123-4567', '96891234567'],
    ['(968) 91234567', '96891234567'],
    ['', ''],
    [null, ''],
  ])('%s → %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected)
  })
})

describe('messages', () => {
  const exhibitor = { brand: 'Bloom', manager: 'سارة', contract: 450, paid: 200, booth: '—', booth_size: '3×2 متر' }
  const exhibition = { city: 'مسقط', mall: 'سيتي سنتر', date_from: '2026-10-10', date_to: '2026-10-14' }

  it('includes booking details and balance in the confirmation', () => {
    const text = confirmationMessage(exhibitor, exhibition)
    expect(text).toContain('*Bloom*')
    expect(text).toContain('SOVA مسقط')
    expect(text).toContain('المتبقي: *250.000 ر.ع*')
    expect(text).toContain('سيُحدد قريباً')
  })

  it('shows the outstanding amount in the payment reminder', () => {
    expect(paymentReminderMessage(exhibitor, exhibition)).toContain('المبلغ المتبقي: 250.000 ر.ع')
  })

  it('counts down the days to the exhibition', () => {
    const now = new Date('2026-10-01T09:00:00Z')
    expect(daysUntil('2026-10-10', now)).toBe(9)
    expect(exhibitionReminderMessage(exhibitor, exhibition, now)).toContain('تبقى 9 يوم')
    expect(exhibitionReminderMessage(exhibitor, exhibition, new Date('2026-10-11'))).toContain('أقل من يوم')
  })

  it('builds an encoded wa.me link', () => {
    expect(whatsappUrl('91234567', 'مرحبا & أهلاً')).toBe(
      `https://wa.me/96891234567?text=${encodeURIComponent('مرحبا & أهلاً')}`,
    )
  })
})
