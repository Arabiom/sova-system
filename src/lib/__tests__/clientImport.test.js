import { describe, expect, it } from 'vitest'
import { classifyClients, countStates, detectColumns, parseCsv, phoneWarning, readClientRows } from '../clientImport.js'

describe('reading a client file', () => {
  it('parses CSV with quotes, semicolons and a BOM', () => {
    expect(parseCsv('﻿الاسم,الهاتف\r\n"متجر، الورد",91234567\n\n')).toEqual([
      ['الاسم', 'الهاتف'],
      ['متجر، الورد', '91234567'],
    ])
    expect(parseCsv('a;b\n1;2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('finds the header row even under a title', () => {
    const rows = [['قائمة العملاء 2026'], [], ['م', 'اسم المشروع', 'اسم المسؤول', 'رقم الهاتف', 'النشاط', 'الولاية'], ['1', 'دخونك', 'ام يوسف', '71499700', 'عطور', 'نزوى']]
    const { headerRow, cols } = detectColumns(rows)
    expect(headerRow).toBe(2)
    expect(cols).toMatchObject({ name: 1, contact_name: 2, phone: 3, sector: 4, city: 5 })
    const [client] = readClientRows(rows, headerRow, cols)
    expect(client).toMatchObject({ line: 4, name: 'دخونك', contact_name: 'ام يوسف', phone: '71499700', sector: 'عطور وبخور', city: 'نزوى' })
  })

  it('leaves the columns to the user when no header is recognised', () => {
    expect(detectColumns([['x', 'y'], ['1', '2']])).toEqual({ headerRow: -1, cols: {} })
  })
})

describe('sorting rows before saving', () => {
  const existing = [{ name: 'متجر قديم', phone: '+968 9999 0000' }, { name: 'بدون رقم', phone: '' }]
  const rows = [
    { line: 2, name: 'متجر الورد', contact_name: 'سارة', phone: '91234567', whatsapp: '', status: '' },
    { line: 3, name: 'متجر الورد 2', contact_name: '', phone: '+968 9123 4567', whatsapp: '', status: '' },
    { line: 4, name: 'نسخة', contact_name: '', phone: '99990000', whatsapp: '', status: '' },
    { line: 5, name: '', contact_name: '', phone: '', whatsapp: '', status: '' },
    { line: 6, name: '', contact_name: 'أحمد', phone: '9063699', whatsapp: '', status: 'VIP' },
    { line: 7, name: 'بدون رقم', contact_name: '', phone: '', whatsapp: '', status: '' },
  ]
  const out = classifyClients(rows, existing)

  it('marks each row', () => {
    expect(out.map((r) => r.state)).toEqual(['new', 'duplicate', 'exists', 'invalid', 'new', 'exists'])
    expect(out[1].reason).toContain('2')
    expect(out[2].reason).toContain('متجر قديم')
    expect(countStates(out)).toEqual({ new: 2, duplicate: 1, exists: 2, invalid: 1 })
  })

  it('only ticks new rows, fills the name and flags doubtful values', () => {
    expect(out.map((r) => r.include)).toEqual([true, false, false, false, true, false])
    expect(out[4].name).toBe('أحمد')
    expect(out[4].status).toBe('نشط')
    expect(out[4].warnings.join(' ')).toMatch(/رقم ناقص/)
    expect(out[4].warnings.join(' ')).toMatch(/VIP/)
  })

  it('checks phone numbers', () => {
    expect(phoneWarning('91234567')).toBe('')
    expect(phoneWarning('9063699')).toBe('رقم ناقص')
    expect(phoneWarning('+971 50 123 4567')).toBe('')
  })
})

describe('a merged client list (combined headers, free-text products, a second number)', () => {
  const rows = [
    ['م', 'الاسم', 'اسم المشروع / النشاط', 'رقم التواصل', 'رقم إضافي', 'البريد الإلكتروني', 'نوع المنتجات', 'المعارض / المصادر', 'عدد المصادر'],
    [1, 'منى الجابري', 'بوتيك الاركان', '92183456', null, null, 'ازياْء', 'معرض نزوى جراند مول', 1],
    [2, 'ميساء / عبدالله', 'Maysa collection', '97878059', '92161138', null, 'عبايات - مشروبات', 'معرض ليالي مسقط', 1],
    [3, 'جسر العذيبة', 'فطر عمان', '98288620', null, null, 'شركة فطر عمان', 'قائمة مشاركين', 1],
  ]
  it('finds every column, sorts the products into sectors and keeps what the file said', () => {
    const { headerRow, cols } = detectColumns(rows)
    expect(headerRow).toBe(0)
    expect(cols).toMatchObject({ contact_name: 1, name: 2, phone: 3, email: 5, sector: 6, source: 7, phone2: 4 })
    const [a, b, c] = readClientRows(rows, headerRow, cols)
    expect(a).toMatchObject({ name: 'بوتيك الاركان', contact_name: 'منى الجابري', phone: '92183456', sector: 'أزياء', source: 'معرض نزوى جراند مول' })
    expect(b.sector).toBe('أزياء')
    expect(b.products).toBe('عبايات - مشروبات') // what the file said becomes the products note
    expect(b.notes).toContain('92161138')
    expect(c.sector).toBe('شركة فطر عمان') // nothing to sort it into: kept as written
    expect(c).not.toHaveProperty('phone2')
    const [d, e] = readClientRows([rows[0], [4, 'x', 'مطعم الريف', '91111111', null, null, 'Restaurant'], [5, 'y', 'ز', '92222222', null, null, '8']], 0, cols)
    expect(d.sector).toBe('مطاعم وأغذية')
    expect(e.sector).toBe('')
  })
  it('reads a products column and sorts the sector from it', () => {
    const file = [['اسم المشروع', 'رقم الهاتف', 'نبذة عن المنتجات'], ['لبان ظفار', '93334444', 'لبان وبخور ومخمرية']]
    const found = detectColumns(file)
    expect(found.cols).toMatchObject({ name: 0, phone: 1, products: 2 })
    const [row] = readClientRows(file, found.headerRow, found.cols)
    expect(row).toMatchObject({ sector: 'عطور وبخور', products: 'لبان وبخور ومخمرية' })
  })
})
