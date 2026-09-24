import { describe, expect, it } from 'vitest'
import { contractHtml, escapeHtml, receiptHtml, reportHtml } from '../pdf.js'

describe('pdf templates', () => {
  it('escapes user-entered text', () => {
    expect(escapeHtml('<img src=x onerror=alert(1)> & "q"')).toBe('&lt;img src=x onerror=alert(1)&gt; &amp; &quot;q&quot;')
    const html = contractHtml({ brand: '<script>x</script>', contract: 100 }, null, { contractNo: 'SOVA-1', date: '1/1/2026' })
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('puts contract totals with VAT in the contract', () => {
    const html = contractHtml({ brand: 'B', contract: 400, paid: 100 }, { city: 'صحار', date_from: '2026-01-01', date_to: '2026-01-03' }, { contractNo: 'SOVA-1', date: 'x' })
    expect(html).toContain('400.000 OMR')
    expect(html).toContain('20.000 OMR')
    expect(html).toContain('420.000 OMR')
    expect(html).toContain('300.000 OMR')
  })

  it('uses the stored invoice number on receipts', () => {
    expect(receiptHtml({ invoice_no: 'INV-123456', amount: 50 }, { brand: 'B' }, null)).toContain('INV-123456')
  })

  it('limits the report to the selected exhibition', () => {
    const data = {
      exhibitions: [
        { id: 'x', city: 'مسقط', date_from: '2026-01-01' },
        { id: 'y', city: 'صلالة', date_from: '2026-02-01' },
      ],
      exhibitors: [
        { id: 'a', exhibition_id: 'x', contract: 100, paid: 100 },
        { id: 'b', exhibition_id: 'y', contract: 900, paid: 0 },
      ],
      payments: [],
    }
    const html = reportHtml(data, 'x', { date: 'd' })
    expect(html).toContain('SOVA مسقط')
    expect(html).not.toContain('SOVA صلالة')
    expect(html).toContain('إجمالي المتبقي: <bdi dir="ltr">0.000 OMR</bdi>')
  })
})
