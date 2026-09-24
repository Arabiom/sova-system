// PDF documents (contract, payment receipt, financial report).
//
// jsPDF's built-in fonts have no Arabic glyphs, so the documents are laid out as HTML
// (which the browser shapes correctly, right-to-left), rasterised with html2canvas and
// placed onto A4 pages. Both libraries are loaded on demand to keep the app bundle small.

import { COMPANY } from './constants.js'
import { exhibitionStats, summarize, vatOf, withVat } from './finance.js'
import { fixed3, monthOf, num } from './format.js'

const A4_WIDTH_PX = 794 // 210mm at 96dpi
const A4_HEIGHT_PX = 1120 // a hair under 297mm at 96dpi, so rounding never spills onto a 2nd page
const GOLD = '#C9A84C'
const INK = '#1A1410'

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
}

const omr = (value) => `${fixed3(value)} OMR`

/** Left-to-right fragment (numbers, dates, amounts) that keeps its order inside Arabic text. */
const bdi = (value) => `<bdi dir="ltr">${escapeHtml(value)}</bdi>`

/** Mark a table value as already-escaped HTML. */
const rawHtml = (html) => ({ html })
const today = () => new Date().toLocaleDateString('ar-OM')

function page(body, { footer = `${COMPANY.name} | ${COMPANY.cr} | ${COMPANY.brandFull}`, fixedHeight = true } = {}) {
  return `
  <div style="width:${A4_WIDTH_PX}px;${fixedHeight ? `min-height:${A4_HEIGHT_PX}px;` : ''}display:flex;flex-direction:column;
              font-family:Cairo,Tahoma,sans-serif;color:${INK};background:#fff;direction:rtl">
    <div style="background:${INK};padding:26px 48px;display:flex;justify-content:space-between;align-items:center">
      <div>
        <div style="color:${GOLD};font-size:30px;font-weight:900;letter-spacing:6px;line-height:1">SOVA</div>
        <div style="color:#B4A078;font-size:12px;margin-top:6px">${COMPANY.name}</div>
      </div>
      <div style="color:#B4A078;font-size:12px;text-align:left;direction:ltr">${COMPANY.cr}<br>${COMPANY.brandFull}</div>
    </div>
    <div style="flex:1;padding:32px 48px">${body}</div>
    <div style="background:${INK};color:${GOLD};font-size:11px;text-align:center;padding:14px">${escapeHtml(footer)}</div>
  </div>`
}

function title(ar, en) {
  return `<div style="text-align:center;margin-bottom:24px">
    <div style="font-size:22px;font-weight:900">${ar}</div>
    <div style="font-size:13px;color:#8A7A60;direction:ltr">${en}</div>
  </div>`
}

/** Two-language key/value table: Arabic label | value | English label. */
function rowsTable(rows) {
  return `<table style="width:100%;border-collapse:separate;border-spacing:0 4px;font-size:13px">
    ${rows
      .map(
        ([ar, value, en]) => `<tr style="background:#FDFAF5">
          <td style="padding:8px 12px;font-weight:700;width:30%">${ar}</td>
          ${value?.html !== undefined ? `<td style="padding:8px 12px">${value.html}</td>` : `<td dir="auto" style="padding:8px 12px;text-align:right">${escapeHtml(value)}</td>`}
          <td style="padding:8px 12px;color:#8A7A60;text-align:left;direction:ltr;width:26%">${en}</td>
        </tr>`,
      )
      .join('')}
  </table>`
}

async function renderPdf(html, filename) {
  const [{ jsPDF }, { default: html2canvas }] = await Promise.all([import('jspdf'), import('html2canvas')])

  const host = document.createElement('div')
  host.style.cssText = `position:fixed;top:0;left:-${A4_WIDTH_PX * 2}px;width:${A4_WIDTH_PX}px;background:#fff`
  host.innerHTML = html
  document.body.appendChild(host)

  try {
    if (document.fonts?.ready) await document.fonts.ready
    const canvas = await html2canvas(host.firstElementChild, { scale: 2, backgroundColor: '#ffffff', useCORS: true })

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const pageWidthMm = 210
    const sliceHeightPx = Math.floor((canvas.width * 297) / pageWidthMm)

    // Ignore a leftover sliver of a few pixels at the end (rounding), which would be a blank page.
    const pageCount = Math.max(1, Math.ceil((canvas.height - 8) / sliceHeightPx))
    for (let index = 0, offset = 0; index < pageCount; index++, offset += sliceHeightPx) {
      const slice = document.createElement('canvas')
      slice.width = canvas.width
      slice.height = Math.min(sliceHeightPx, canvas.height - offset)
      slice.getContext('2d').drawImage(canvas, 0, -offset)
      if (index > 0) pdf.addPage()
      pdf.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, pageWidthMm, (slice.height * pageWidthMm) / canvas.width)
    }

    pdf.save(filename)
  } finally {
    host.remove()
  }
}

const safeName = (value) => String(value || 'SOVA').trim().replace(/[\s/\\?%*:|"<>]+/g, '-')

export function contractHtml(exhibitor, exhibition, { contractNo, date = today() } = {}) {
  const contract = num(exhibitor.contract)
  const rows = [
    ['رقم العقد', contractNo, 'Contract No.'],
    ['التاريخ', date, 'Date'],
    ['العلامة التجارية', exhibitor.brand || '—', 'Brand'],
    ['المسؤول', exhibitor.manager || '—', 'Manager'],
    ['الجوال', exhibitor.phone || '—', 'Phone'],
    ['البريد', exhibitor.email || '—', 'Email'],
    ['التصنيف', exhibitor.category || '—', 'Category'],
    [
      'المعرض',
      exhibition
        ? rawHtml(`SOVA ${escapeHtml(exhibition.city)} — من ${bdi(exhibition.date_from)} إلى ${bdi(exhibition.date_to)}`)
        : '—',
      'Exhibition',
    ],
    ['الموقع', exhibition?.mall || '—', 'Venue'],
    ['رقم البوث', exhibitor.booth || '—', 'Booth No.'],
    ['حجم البوث', exhibitor.booth_size || '—', 'Booth Size'],
    ['قيمة العقد', omr(contract), 'Contract Value'],
    ['ضريبة القيمة المضافة 5%', omr(vatOf(contract)), 'VAT (5%)'],
    ['الإجمالي', omr(withVat(contract)), 'Total'],
    ['المدفوع', omr(exhibitor.paid), 'Paid'],
    ['المتبقي', omr(contract - num(exhibitor.paid)), 'Remaining'],
    ['الحالة', exhibitor.status || '—', 'Status'],
  ]
  const terms = [
    'يجب استكمال الدفع قبل تاريخ بداية المعرض.',
    'يُعتبر تخصيص البوث نهائياً عند توقيع العقد.',
    'تحتفظ SOVA بحق تغيير موقع البوث عند الضرورة.',
    'الإلغاء خلال 14 يوماً من المعرض يترتب عليه خصم 50% من قيمة العقد.',
  ]
  const signature = (label) => `<div style="width:40%;text-align:center">
      <div style="font-weight:700;font-size:13px;margin-bottom:48px">${label}</div>
      <div style="border-top:1.5px solid ${INK}"></div>
    </div>`

  return page(`
    ${title('عقد حجز بوث معرض', 'Exhibition Booth Contract')}
    ${rowsTable(rows)}
    <div style="margin-top:22px;font-size:14px;font-weight:800">الشروط والأحكام</div>
    <div style="margin-top:8px;font-size:12px;line-height:2">
      ${terms.map((t, i) => `<div>${i + 1}. ${t}</div>`).join('')}
    </div>
    <div style="display:flex;justify-content:space-between;margin-top:40px">
      ${signature('توقيع العارض')}
      ${signature('إدارة SOVA')}
    </div>`)
}

export function receiptHtml(payment, exhibitor, exhibition, { date = today() } = {}) {
  const rows = [
    ['رقم الإيصال', payment.invoice_no || '—', 'Invoice No.'],
    ['التاريخ', payment.date || date, 'Date'],
    ['العارض', exhibitor?.brand || '—', 'Exhibitor'],
    ['المعرض', exhibition ? rawHtml(`SOVA ${escapeHtml(exhibition.city)} — ${bdi(monthOf(exhibition.date_from))}`) : '—', 'Exhibition'],
    ['المبلغ', omr(payment.amount), 'Amount'],
    ['الضريبة 5%', omr(vatOf(payment.amount)), 'VAT (5%)'],
    ['الإجمالي', omr(withVat(payment.amount)), 'Total'],
    ['طريقة الدفع', payment.method || '—', 'Method'],
    ['نوع الدفعة', payment.type || '—', 'Type'],
    ['ملاحظة', payment.note || '—', 'Note'],
  ]
  return page(`
    ${title('إيصال دفع', 'Payment Receipt')}
    ${rowsTable(rows)}
    <div style="margin-top:24px;background:${GOLD};padding:16px;border-radius:8px;text-align:center;font-size:18px;font-weight:900">
      إجمالي المدفوع: ${bdi(omr(withVat(payment.amount)))}
    </div>`)
}

export function reportHtml({ exhibitions, exhibitors, payments }, exhibitionId = 'all', { date = today() } = {}) {
  const selected = exhibitionId === 'all' ? exhibitions : exhibitions.filter((e) => e.id === exhibitionId)
  const scopeExhibitors =
    exhibitionId === 'all' ? exhibitors : exhibitors.filter((e) => e.exhibition_id === exhibitionId)
  const totals = summarize(scopeExhibitors)

  const sections = selected
    .map((ex) => {
      const own = exhibitors.filter((e) => e.exhibition_id === ex.id)
      const s = summarize(own)
      const { capacity } = exhibitionStats(ex, exhibitors, payments)
      return `<div style="margin-bottom:16px;break-inside:avoid">
        <div style="background:${INK};color:${GOLD};padding:8px 14px;font-weight:800;font-size:14px;border-radius:6px 6px 0 0">
          SOVA ${escapeHtml(ex.city)} — ${bdi(monthOf(ex.date_from))} <span style="color:#B4A078;font-weight:400">| ${escapeHtml(ex.mall || '')}</span>
        </div>
        ${rowsTable([
          ['العارضون', `${s.count} / ${capacity}`, 'Exhibitors'],
          ['إجمالي العقود', omr(s.contract), 'Total Contracts'],
          ['المحصّل', omr(s.paid), 'Collected'],
          ['المتبقي', omr(s.remaining), 'Pending'],
          ['الضريبة 5%', omr(s.vat), 'VAT (5%)'],
        ])}
      </div>`
    })
    .join('')

  return page(
    `${title('التقرير المالي', `Financial Report — ${escapeHtml(date)}`)}
    ${sections || '<div style="text-align:center;color:#8A7A60">لا توجد معارض</div>'}
    <div style="margin-top:12px;background:${GOLD};padding:16px;border-radius:8px;font-size:15px;font-weight:800;line-height:2;text-align:center">
      إجمالي المحصّل: ${bdi(omr(totals.paid))}<br>
      إجمالي الضريبة 5%: ${bdi(omr(totals.vat))}<br>
      إجمالي المتبقي: ${bdi(omr(totals.remaining))}
    </div>`,
    { footer: `${COMPANY.name} | ${COMPANY.cr} | تقرير مالي سري`, fixedHeight: selected.length <= 3 },
  )
}

export function downloadContract(exhibitor, exhibition, contractNo) {
  return renderPdf(contractHtml(exhibitor, exhibition, { contractNo }), `SOVA-Contract-${safeName(exhibitor.brand)}.pdf`)
}

export function downloadReceipt(payment, exhibitor, exhibition) {
  return renderPdf(receiptHtml(payment, exhibitor, exhibition), `SOVA-Invoice-${safeName(payment.invoice_no)}.pdf`)
}

export function downloadReport(data, exhibitionId) {
  return renderPdf(reportHtml(data, exhibitionId), `SOVA-Financial-Report-${new Date().toISOString().slice(0, 10)}.pdf`)
}
