// PDF documents (contract, payment receipt, financial report).
//
// jsPDF's built-in fonts have no Arabic glyphs, so the documents are laid out as HTML
// (which the browser shapes correctly, right-to-left), rasterised with html2canvas and
// placed onto A4 pages. Both libraries are loaded on demand to keep the app bundle small.

import { COMPANY } from './constants.js'
import { occupancyOf, summarize, vatOf, withVat } from './finance.js'
import { fixed3, monthOf, num } from './format.js'
import { tiersFromSites } from './sites.js'

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
        <div style="color:#B4A078;font-size:12px;margin-top:6px">${COMPANY.legalName}</div>
      </div>
      <div style="color:#B4A078;font-size:11px;text-align:left;direction:ltr;line-height:1.7">
        <img src="${COMPANY.logoLight}" alt="${COMPANY.nameEn}" style="height:34px;display:block;margin:0 0 8px auto">
        ${COMPANY.cr}<br>☎ ${COMPANY.phone} • WhatsApp ${COMPANY.whatsapp.replace(/^968/, '')}<br>${COMPANY.email} • ${COMPANY.instagram}</div>
    </div>
    <div style="flex:1;padding:24px 48px">${body}</div>
    <div style="background:${INK};color:${GOLD};font-size:11px;text-align:center;padding:14px">${escapeHtml(footer)}</div>
  </div>`
}

function title(ar, en) {
  return title_(ar, en)
}

function title_(ar, en) {
  return `<div style="text-align:center;margin-bottom:16px">
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
          <td style="padding:6px 12px;font-weight:700;width:30%">${ar}</td>
          ${value?.html !== undefined ? `<td style="padding:6px 12px">${value.html}</td>` : `<td dir="auto" style="padding:6px 12px;text-align:right">${escapeHtml(value)}</td>`}
          <td style="padding:6px 12px;color:#8A7A60;text-align:left;direction:ltr;width:26%">${en}</td>
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
    // Wait for the company logo (and any other image) so it is in the capture.
    await Promise.all([...host.querySelectorAll('img')].map((img) => img.decode().catch(() => {})))
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
        ? rawHtml(`${escapeHtml(exhibition.name?.trim() || `SOVA ${exhibition.city}`)} — من ${bdi(exhibition.date_from)} إلى ${bdi(exhibition.date_to)}`)
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
      <div style="font-weight:700;font-size:13px;margin-bottom:40px">${label}</div>
      <div style="border-top:1.5px solid ${INK}"></div>
    </div>`

  return page(`
    ${title('عقد حجز بوث معرض', 'Exhibition Booth Contract')}
    ${rowsTable(rows)}
    <div style="margin-top:22px;font-size:14px;font-weight:800">الشروط والأحكام</div>
    <div style="margin-top:8px;font-size:12px;line-height:2">
      ${terms.map((t, i) => `<div>${i + 1}. ${t}</div>`).join('')}
    </div>
    <div style="margin-top:12px;font-size:12px;color:#6B5A40">طريقة السداد: تحويل بنكي إلى ${COMPANY.bank}، أو نقداً مقابل إيصال.</div>
    <div style="display:flex;justify-content:space-between;margin-top:40px">
      ${signature('توقيع العارض')}
      ${signature(`إدارة SOVA<br><span style="font-weight:400;font-size:12px">${COMPANY.signatory}</span>`)}
    </div>`)
}

export function receiptHtml(payment, exhibitor, exhibition, { date = today() } = {}) {
  const rows = [
    ['رقم الإيصال', payment.invoice_no || '—', 'Invoice No.'],
    ['التاريخ', payment.date || date, 'Date'],
    ['العارض', exhibitor?.brand || '—', 'Exhibitor'],
    ['المعرض', exhibition ? rawHtml(`${escapeHtml(exhibition.name?.trim() || `SOVA ${exhibition.city}`)} — ${bdi(monthOf(exhibition.date_from))}`) : '—', 'Exhibition'],
    ['المبلغ', omr(payment.amount), 'Amount'],
    ['الضريبة 5%', omr(vatOf(payment.amount)), 'VAT (5%)'],
    ['الإجمالي', omr(withVat(payment.amount)), 'Total'],
    ['طريقة الدفع', payment.method || '—', 'Method'],
    ['نوع الدفعة', payment.type || '—', 'Type'],
    ['ملاحظة', payment.note || '—', 'Note'],
  ]
  const refund = num(payment.amount) < 0
  return page(`
    ${refund ? title('إيصال إرجاع مبلغ', 'Refund Receipt') : title('إيصال دفع', 'Payment Receipt')}
    ${rowsTable(rows)}
    <div style="margin-top:24px;background:${refund ? '#FDEAEA' : GOLD};padding:16px;border-radius:8px;text-align:center;font-size:18px;font-weight:900">
      ${refund ? 'إجمالي المبلغ المُرجَع' : 'إجمالي المدفوع'}: ${bdi(omr(Math.abs(withVat(payment.amount))))}
    </div>
    <div style="margin-top:14px;font-size:12px;color:#6B5A40;text-align:center">
      التحويل البنكي: ${COMPANY.bank}
    </div>`)
}

export function reportHtml({ exhibitions, exhibitors, sites = [] }, exhibitionId = 'all', { date = today() } = {}) {
  const selected = exhibitionId === 'all' ? exhibitions : exhibitions.filter((e) => e.id === exhibitionId)
  const scopeExhibitors =
    exhibitionId === 'all' ? exhibitors : exhibitors.filter((e) => e.exhibition_id === exhibitionId)
  const totals = summarize(scopeExhibitors)

  const sections = selected
    .map((ex) => {
      const own = exhibitors.filter((e) => e.exhibition_id === ex.id)
      const s = summarize(own)
      const { booked, capacity } = occupancyOf(ex, sites, exhibitors)
      return `<div style="margin-bottom:16px;break-inside:avoid">
        <div style="background:${INK};color:${GOLD};padding:8px 14px;font-weight:800;font-size:14px;border-radius:6px 6px 0 0">
          ${escapeHtml(ex.name?.trim() || `SOVA ${ex.city}`)} — ${bdi(monthOf(ex.date_from))} <span style="color:#B4A078;font-weight:400">| ${escapeHtml(ex.mall || '')}</span>
        </div>
        ${rowsTable([
          ['المواقع المحجوزة', `${booked} / ${capacity}`, 'Sites'],
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

function table(headers, rows, { total } = {}) {
  if (!rows.length) return '<div style="color:#8A7A60;font-size:12px;padding:6px 0">لا يوجد</div>'
  const th = headers.map((h) => `<th style="background:${INK};color:${GOLD};padding:7px 8px;font-size:11px;text-align:right">${h}</th>`).join('')
  const body = rows
    .map((cells, i) => `<tr style="background:${i % 2 ? '#fff' : '#FDFAF5'}">${cells.map((c) => `<td style="padding:6px 8px;font-size:11px;border-bottom:1px solid #F0E8D8">${c}</td>`).join('')}</tr>`)
    .join('')
  const foot = total
    ? `<tr>${total.map((c) => `<td style="padding:7px 8px;font-size:11px;font-weight:800;border-top:2px solid ${INK}">${c}</td>`).join('')}</tr>`
    : ''
  return `<table style="width:100%;border-collapse:collapse;margin-bottom:6px"><thead><tr>${th}</tr></thead><tbody>${body}${foot}</tbody></table>`
}

const section = (heading) => `<div style="font-size:15px;font-weight:900;margin:20px 0 8px;padding-bottom:4px;border-bottom:2px solid ${GOLD}">${heading}</div>`

export function exhibitionFileHtml({ exhibition: ex, sites, exhibitors, expenses, sponsors, financials: f }, { date = today() } = {}) {
  const title = ex.name?.trim() || `SOVA ${ex.city}`
  const tiers = sites.length ? tiersFromSites(sites) : []
  const info = [
    ['التاريخ', rawHtml(`من ${bdi(ex.date_from)} إلى ${bdi(ex.date_to)}`), 'Dates'],
    ['المول', ex.mall || '—', 'Venue'],
    ['العنوان', ex.address || '—', 'Address'],
    ['أوقات العمل', ex.hours || '—', 'Hours'],
    ['المناسبة', ex.occasion || '—', 'Occasion'],
    ['الحالة', ex.status || '—', 'Status'],
  ]
  const money = (v) => bdi(omr(v))

  return page(
    `${title_(`ملف معرض: ${escapeHtml(title)}`, `Exhibition File — ${escapeHtml(date)}`)}
    ${rowsTable(info)}

    ${section('الملخص المالي')}
    ${rowsTable([
      ['المواقع', `${f.booked} محجوز من ${f.capacity} (إشغال ${f.occupancy}%)`, 'Sites'],
      ['نقطة التعادل', `${f.breakEven} موقع (${f.breakEvenPct}%)`, 'Break-even'],
      ['الإيراد عند البيع الكامل', rawHtml(money(f.fullRevenue)), 'Full revenue'],
      ['إجمالي العقود', rawHtml(money(f.contract)), 'Contracts'],
      ['الرعايات', rawHtml(money(f.sponsorship)), 'Sponsorship'],
      ['المصروفات', rawHtml(money(f.expensesTotal)), 'Expenses'],
      ['المحصّل', rawHtml(money(f.collected)), 'Collected'],
      ['المتبقي للتحصيل', rawHtml(money(f.outstanding)), 'Outstanding'],
      ['الصافي حسب العقود', rawHtml(money(f.netOnContracts)), 'Net (contracts)'],
      ['الصافي عند البيع الكامل', rawHtml(money(f.netAtFull)), 'Net (full)'],
    ])}

    ${section('الفئات والأسعار')}
    ${table(
      ['الفئة', 'أرقام المواقع', 'العدد', 'السعر', 'الإجمالي'],
      tiers.map((t) => [escapeHtml(t.name), escapeHtml(t.ranges), t.count, money(t.price), money(t.total)]),
      { total: tiers.length ? ['الإجمالي', '', tiers.reduce((a, t) => a + t.count, 0), '', money(tiers.reduce((a, t) => a + t.total, 0))] : null },
    )}

    ${section(`المشاركون (${exhibitors.length})`)}
    ${table(
      ['المشارك', 'المسؤول', 'الهاتف', 'المواقع', 'العقد', 'المدفوع', 'المتبقي'],
      exhibitors.map((e) => [
        escapeHtml(e.brand),
        escapeHtml(e.manager || ''),
        bdi(e.phone || ''),
        escapeHtml(e.booth || '—'),
        money(e.contract),
        money(e.paid),
        money(num(e.contract) - num(e.paid)),
      ]),
      {
        total: exhibitors.length
          ? ['الإجمالي', '', '', '', money(f.contract), money(exhibitors.reduce((a, e) => a + num(e.paid), 0)), money(exhibitors.reduce((a, e) => a + num(e.contract) - num(e.paid), 0))]
          : null,
      },
    )}

    ${section('المصروفات')}
    ${table(
      ['البند', 'التصنيف', 'المبلغ', 'الاستحقاق', 'الحالة'],
      expenses.map((x) => [escapeHtml(x.item), escapeHtml(x.category || ''), money(x.amount), bdi(x.due_date || '—'), x.paid ? 'مدفوع' : 'غير مدفوع']),
      { total: expenses.length ? ['الإجمالي', '', money(f.expensesTotal), '', ''] : null },
    )}

    ${section('الرعاة')}
    ${table(
      ['الراعي', 'المسؤول', 'القيمة', 'الحالة'],
      sponsors.map((s) => [escapeHtml(s.name), escapeHtml(s.contact_name || ''), money(s.amount), escapeHtml(s.status || '')]),
    )}`,
    { footer: `${COMPANY.name} | ${COMPANY.cr} | ملف معرض — ${title}`, fixedHeight: false },
  )
}

export function downloadExhibitionFile(data) {
  const name = data.exhibition.name?.trim() || `SOVA-${data.exhibition.city}`
  return renderPdf(exhibitionFileHtml(data), `ملف-معرض-${safeName(name)}.pdf`)
}
