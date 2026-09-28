import { describe, expect, it } from 'vitest'
import {
  chatUrl,
  confirmationMessage,
  daysUntil,
  emptyValues,
  fillTemplate,
  messageProblems,
  parseManualList,
  phoneProblem,
  previewParts,
  recipientVars,
  toRecipient,
  uniqueByPhone,
  usesMoney,
  wrapSelection,
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

describe('templates with variables', () => {
  const person = toRecipient('exhibitor', { id: 'e1', brand: 'Bloom', manager: 'سارة', phone: '91234567', booth: '12', contract: 150, paid: 50 })
  const exhibition = { name: 'SOVA EXBO', city: 'مسقط', mall: 'مسقط مول', date_from: '2026-12-27', date_to: '2026-12-31', occasion: '' }

  it('fills each variable with the recipient’s own data', () => {
    const vars = recipientVars(person, exhibition, { money: true })
    const text = fillTemplate('مرحباً {الاسم} من {العلامة}، موقعكم {الموقع} في {المعرض} ({التاريخ}) — المتبقي {المتبقي}', vars)
    expect(text).toBe('مرحباً سارة من Bloom، موقعكم 12 في SOVA EXBO (27/12/2026 – 31/12/2026) — المتبقي 100.000 ر.ع')
  })

  it('never fills amounts without money permission and reports it', () => {
    const vars = recipientVars(person, exhibition, { money: false })
    expect(fillTemplate('{المتبقي}', vars)).toBe('{المتبقي}')
    expect(messageProblems('{المتبقي}', vars)).toEqual(['{المتبقي} غير متاح لصلاحيتك'])
    expect(usesMoney('المدفوع {المدفوع}')).toBe(true)
  })

  it('flags unknown variables and a missing exhibition', () => {
    const vars = recipientVars(person, null)
    expect(messageProblems('{المعرض} {شيء}', vars)).toEqual(['{المعرض}: لم يُحدد المعرض', '{شيء} متغير غير معروف'])
  })

  it('drops the dangling dash when the occasion is empty', () => {
    const vars = recipientVars(person, exhibition)
    expect(fillTemplate('*{المعرض}* — {المناسبة}\nسطر', vars)).toBe('*SOVA EXBO*\nسطر')
    expect(emptyValues('{المناسبة}', vars)).toEqual(['المناسبة'])
  })

  it('falls back to the brand when there is no contact name', () => {
    const client = toRecipient('client', { id: 'c1', name: 'متجر الورد', contact_name: '', whatsapp: '', phone: '99887766' })
    expect(recipientVars(client, null)['الاسم']).toBe('متجر الورد')
    expect(client.phone).toBe('99887766')
  })
})

describe('recipients', () => {
  it('parses a pasted list with names and removes repeated numbers', () => {
    const list = parseManualList('متجر الورد 91234567\n+968 9123 4567\n97654321 - أحمد\nبدون رقم')
    expect(list.map((r) => [r.name, r.phone])).toEqual([
      ['متجر الورد', '91234567'],
      ['أحمد', '97654321'],
    ])
  })

  it('keeps one recipient per phone number', () => {
    const [unique, dups] = uniqueByPhone([
      { key: 'a', phone: '91234567' },
      { key: 'b', phone: '+96891234567' },
      { key: 'c', phone: '' },
    ])
    expect(unique.map((r) => r.key)).toEqual(['a'])
    expect(dups.map((r) => r.key)).toEqual(['b'])
  })

  it('tells which numbers cannot receive a message', () => {
    expect(phoneProblem('91234567')).toBe('')
    expect(phoneProblem('9063699')).toBe('رقم ناقص أو زائد')
    expect(phoneProblem('')).toBe('بدون رقم')
    expect(phoneProblem('+971 50 123 4567')).toBe('')
    expect(normalizePhone('+971 50 123 4567')).toBe('971501234567')
  })

  it('builds links for each way of opening WhatsApp', () => {
    expect(chatUrl('91234567', 'hi', 'web')).toBe('https://web.whatsapp.com/send?phone=96891234567&text=hi')
    expect(chatUrl('91234567', 'hi', 'app')).toBe('whatsapp://send?phone=96891234567&text=hi')
    expect(chatUrl('91234567', 'hi')).toBe('https://wa.me/96891234567?text=hi')
  })
})

describe('formatting', () => {
  it('wraps the selection in a WhatsApp mark', () => {
    expect(wrapSelection('مرحبا بكم', 0, 5, '*')).toEqual({ text: '*مرحبا* بكم', start: 1, end: 6 })
    expect(wrapSelection('', 0, 0, '_').text).toBe('_نص_')
  })

  it('splits text into formatted parts for the preview', () => {
    expect(previewParts('أ *ب* _ج_ ~د~')).toEqual([
      { text: 'أ ' },
      { text: 'ب', kind: 'bold' },
      { text: ' ' },
      { text: 'ج', kind: 'italic' },
      { text: ' ' },
      { text: 'د', kind: 'strike' },
    ])
  })
})
