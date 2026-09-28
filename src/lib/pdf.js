// PDF documents (contract, payment receipt, financial report).
//
// jsPDF's built-in fonts have no Arabic glyphs, so the documents are laid out as HTML
// (which the browser shapes correctly, right-to-left), rasterised with html2canvas and
// placed onto A4 pages. Both libraries are loaded on demand to keep the app bundle small.

import { BOOTH_NOTE, BOOTH_PACKAGES, COMPANY, PARTICIPATION_TERMS } from './constants.js'
import { isConfirmed, occupancyOf, PAYMENT_DEADLINE_DAYS, paymentDeadline, registrationTotals, summarize, vatEnabled, vatOf, withVat } from './finance.js'
import { fixed3, monthOf, num } from './format.js'
import { tiersFromSites } from './sites.js'
import { inArabic } from './i18n.js'
import { formatDayMonthYear } from './dates.js'

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
const today = () => new Date().toLocaleDateString('ar-OM-u-nu-latn')

function page(body, { footer = `${COMPANY.legalName} | ${COMPANY.nameEn} | ${COMPANY.cr}`, fixedHeight = true, exactHeight = false } = {}) {
  const height = exactHeight ? `height:${A4_HEIGHT_PX}px;overflow:hidden;` : fixedHeight ? `min-height:${A4_HEIGHT_PX}px;` : ''
  return `
  <div style="width:${A4_WIDTH_PX}px;${height}display:flex;flex-direction:column;
              font-family:Cairo,Tahoma,sans-serif;color:${INK};background:#fff;direction:rtl">
    <div style="background:${INK};padding:26px 48px;display:flex;justify-content:space-between;align-items:center">
      <div>
        <img src="${COMPANY.logoLight}" alt="${COMPANY.nameEn}" style="height:46px;display:block">
        <div style="color:#B4A078;font-size:12px;margin-top:8px">${COMPANY.legalName}</div>
      </div>
      <div style="color:#B4A078;font-size:11px;text-align:left;direction:ltr;line-height:1.7">
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

/**
 * Render HTML pages into an A4 PDF. With `onePage`, everything is fitted onto a single page:
 * if the content is taller than A4 (longer data, bigger fonts on this device) it is scaled down
 * rather than cut off or spilled onto a second page.
 */
async function renderPdf(html, filename, { onePage = false, fitPages = false } = {}) {
  const [{ jsPDF }, { default: html2canvas }] = await Promise.all([import('jspdf'), import('html2canvas')])

  const host = document.createElement('div')
  host.style.cssText = `position:fixed;top:0;left:-${A4_WIDTH_PX * 2}px;width:${A4_WIDTH_PX}px;background:#fff`
  host.innerHTML = html
  document.body.appendChild(host)

  try {
    if (document.fonts?.ready) await document.fonts.ready
    // Wait for the company logo (and any other image) so it is in the capture.
    await Promise.all([...host.querySelectorAll('img')].map((img) => img.decode().catch(() => {})))
    const capture = (el) => html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true })
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const pageWidthMm = 210

    // Fit a captured page onto one A4 page, shrinking it (centred) if it is taller than A4.
    const addFitted = (c) => {
      const heightMm = (c.height * pageWidthMm) / c.width
      const scale = Math.min(1, 297 / heightMm)
      const w = pageWidthMm * scale
      pdf.addImage(c.toDataURL('image/jpeg', 0.92), 'JPEG', (pageWidthMm - w) / 2, 0, w, heightMm * scale)
    }
    if (onePage || fitPages) {
      const pages = fitPages ? [...host.firstElementChild.children] : [host.firstElementChild]
      for (let i = 0; i < pages.length; i++) {
        if (i > 0) pdf.addPage()
        addFitted(await capture(pages[i]))
      }
      pdf.save(filename)
      return
    }

    const canvas = await capture(host.firstElementChild)
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

/** «Pay everything by …» line, shown while money is still owed and the exhibition has a date. */
function deadlineLine(exhibition, owed) {
  const deadline = paymentDeadline(exhibition)
  if (!deadline || owed <= 0.0005) return ''
  return `<div style="font-size:11px;font-weight:700;color:#B42318;margin-top:4px">آخر موعد لسداد كامل المبلغ: ${bdi(formatDayMonthYear(deadline))} (قبل الافتتاح بـ ${bdi(PAYMENT_DEADLINE_DAYS)} أيام)</div>`
}

const safeName = (value) => String(value || 'SOVA').trim().replace(/[\s/\\?%*:|"<>]+/g, '-')

export function contractHtml(exhibitor, exhibition, { contractNo, date = today() } = {}) {
  const e = exhibitor
  const contract = num(e.contract)
  const paid = num(e.paid)
  const pkg = BOOTH_PACKAGES.find((p) => p.name === e.booth_type)
  const exName = exhibition ? escapeHtml(exhibition.name?.trim() || `SOVA ${exhibition.city}`) : '—'
  const money = (v) => bdi(omr(v))
  const box = (label, value) => `<div style="padding:4px 0;border-bottom:1px solid #EFE7D6">
      <div style="font-size:10.5px;color:#6B5A40">${label}</div>
      <div dir="auto" style="font-size:13.5px;font-weight:700;color:${INK};line-height:1.45">${value}</div>
    </div>`
  const section = (text) => `<div style="font-size:14px;font-weight:900;margin:10px 0 2px;padding-bottom:3px;border-bottom:2px solid ${GOLD}">${text}</div>`
  const sumRow = (label, value, strong) =>
    `<div style="display:flex;justify-content:space-between;padding:3px 0;${strong ? `font-weight:900;font-size:15px;border-top:1.5px solid ${INK};margin-top:2px` : 'font-size:13px'}">
      <span>${label}</span><span>${money(value)}</span></div>`

  return page(
    `<div style="display:flex;justify-content:space-between;align-items:flex-end">
      <div>
        <div style="font-size:24px;font-weight:900;line-height:1.3">عقد حجز موقع في معرض</div>
        <div style="font-size:12px;color:#8A7A60;direction:ltr;text-align:right">Exhibition Booth Contract</div>
      </div>
      <div style="font-size:13px;line-height:1.8;text-align:left">
        رقم العقد: <strong>${bdi(contractNo || '—')}</strong><br>
        التاريخ: <strong>${bdi(date)}</strong>
      </div>
    </div>

    ${section('الطرف الثاني — المشارك')}
    <div style="display:grid;grid-template-columns:1fr 1fr;column-gap:30px">
      ${box('اسم المشروع / العلامة التجارية', escapeHtml(e.brand || '—'))}
      ${box('اسم المسؤول', escapeHtml(e.manager || '—'))}
      ${box('رقم التواصل', bdi(e.phone || '—'))}
      ${box(e.civil_id ? 'الرقم المدني' : 'البريد الإلكتروني', bdi(e.civil_id || e.email || '—'))}
      ${box('القطاع / النشاط', escapeHtml(e.category || '—'))}
      ${box('نوع المنتجات', escapeHtml(e.products || '—'))}
    </div>

    ${section('المعرض والموقع')}
    <div style="display:grid;grid-template-columns:1fr 1fr;column-gap:30px">
      ${box('المعرض', exName)}
      ${box('المكان', escapeHtml(exhibition?.mall || '—'))}
      ${box('المدة', exhibition ? `من ${bdi(exhibition.date_from)} إلى ${bdi(exhibition.date_to)}` : '—')}
      ${box('رقم الموقع', `<span style="font-size:17px">${bdi(e.booth && e.booth !== '—' ? e.booth : '—')}</span>`)}
      ${box('نظام البوث', `${escapeHtml(e.booth_type || '—')}${pkg ? `<div style="font-size:10.5px;font-weight:400;color:#6B5A40">${escapeHtml(pkg.includes)}</div>` : ''}`)}
      ${box('المساحة', escapeHtml(e.booth_size || '—'))}
    </div>

    <div style="display:grid;grid-template-columns:1.1fr 1fr;gap:16px;margin-top:10px;align-items:start">
      <div style="background:#FDFAF5;border:1px solid #EFE7D6;border-radius:10px;padding:8px 14px">
        <div style="font-size:13.5px;font-weight:900;margin-bottom:2px">القيمة المالية</div>
        ${vatEnabled()
          ? `${sumRow('قيمة العقد', contract)}${sumRow('ضريبة القيمة المضافة 5%', vatOf(contract))}${sumRow('الإجمالي', withVat(contract), true)}`
          : sumRow('قيمة العقد', contract, true)}
      </div>
      <div style="background:#FDFAF5;border:1px solid #EFE7D6;border-radius:10px;padding:8px 14px">
        <div style="font-size:13.5px;font-weight:900;margin-bottom:2px">السداد</div>
        ${sumRow('المدفوع', withVat(paid))}
        ${sumRow('المتبقي', Math.max(0, withVat(contract) - withVat(paid)), true)}
        <div style="font-size:11px;color:#6B5A40;margin-top:4px">حالة العقد: <strong>${escapeHtml(e.status || '—')}</strong></div>
        ${deadlineLine(exhibition, withVat(contract) - withVat(paid))}
      </div>
    </div>
    <div style="font-size:11px;color:#6B5A40;margin-top:6px">طريقة السداد: تحويل بنكي إلى ${COMPANY.bank}، أو نقداً مقابل إيصال. المبالغ بالريال العُماني.</div>

    ${section('الشروط والأحكام')}
    <div style="display:grid;grid-template-columns:1fr 1fr;column-gap:22px;row-gap:3px">
      ${PARTICIPATION_TERMS.map(
        (t, i) => `<div style="font-size:10.5px;line-height:1.55">
          <strong style="color:${INK}">${bdi(i + 1)}. ${t.title}:</strong> <span style="color:#3A2E22">${t.text}</span>
        </div>`,
      ).join('')}
    </div>

    <div style="display:flex;justify-content:space-between;margin-top:16px;font-size:12px">
      <div style="width:44%">
        <div style="font-weight:800;min-height:38px">الطرف الثاني (المشارك)<br><span style="font-weight:600">${escapeHtml(e.manager || e.brand || '')}</span></div>
        <div style="height:26px"></div>
        <div style="border-top:1.5px solid ${INK};padding-top:3px;color:#6B5A40">التوقيع</div>
      </div>
      <div style="width:44%">
        <div style="font-weight:800;min-height:38px">الطرف الأول: ${COMPANY.legalName}<br><span style="font-weight:600">${COMPANY.signatory}</span></div>
        <div style="height:26px"></div>
        <div style="border-top:1.5px solid ${INK};padding-top:3px;color:#6B5A40">التوقيع والختم</div>
      </div>
    </div>`,
    { fixedHeight: true },
  )
}

export function receiptHtml(payment, exhibitor, exhibition, { date = today() } = {}) {
  const rows = [
    ['رقم الإيصال', payment.invoice_no || '—', 'Invoice No.'],
    ['التاريخ', payment.date || date, 'Date'],
    ['العارض', exhibitor?.brand || '—', 'Exhibitor'],
    ['المعرض', exhibition ? rawHtml(`${escapeHtml(exhibition.name?.trim() || `SOVA ${exhibition.city}`)} — ${bdi(monthOf(exhibition.date_from))}`) : '—', 'Exhibition'],
    ['المبلغ', omr(payment.amount), 'Amount'],
    ...(vatEnabled()
      ? [
          ['الضريبة 5%', omr(vatOf(payment.amount)), 'VAT (5%)'],
          ['الإجمالي', omr(withVat(payment.amount)), 'Total'],
        ]
      : []),
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
          ...(vatEnabled() ? [['الضريبة 5%', omr(s.vat), 'VAT (5%)']] : []),
        ])}
      </div>`
    })
    .join('')

  return page(
    `${title('التقرير المالي', `Financial Report — ${escapeHtml(date)}`)}
    ${sections || '<div style="text-align:center;color:#8A7A60">لا توجد معارض</div>'}
    <div style="margin-top:12px;background:${GOLD};padding:16px;border-radius:8px;font-size:15px;font-weight:800;line-height:2;text-align:center">
      إجمالي المحصّل: ${bdi(omr(totals.paid))}<br>
      ${vatEnabled() ? `إجمالي الضريبة 5%: ${bdi(omr(totals.vat))}<br>` : ''}
      إجمالي المتبقي: ${bdi(omr(totals.remaining))}
    </div>`,
    { footer: `${COMPANY.legalName} | ${COMPANY.cr} | تقرير مالي سري`, fixedHeight: selected.length <= 3 },
  )
}

export function downloadContract(exhibitor, exhibition, contractNo) {
  return renderPdf(inArabic(() => contractHtml(exhibitor, exhibition, { contractNo })), `AIB-Contract-${safeName(exhibitor.brand)}.pdf`, { onePage: true })
}

export function downloadReceipt(payment, exhibitor, exhibition) {
  return renderPdf(inArabic(() => receiptHtml(payment, exhibitor, exhibition)), `AIB-Receipt-${safeName(payment.invoice_no)}.pdf`)
}

export function downloadReport(data, exhibitionId) {
  return renderPdf(inArabic(() => reportHtml(data, exhibitionId)), `AIB-Financial-Report-${new Date().toISOString().slice(0, 10)}.pdf`)
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
    { footer: `${COMPANY.legalName} | ${COMPANY.cr} | ملف معرض — ${title}`, fixedHeight: false },
  )
}

export function downloadExhibitionFile(data) {
  const name = data.exhibition.name?.trim() || `SOVA-${data.exhibition.city}`
  return renderPdf(inArabic(() => exhibitionFileHtml(data)), `ملف-معرض-${safeName(name)}.pdf`)
}

// ── Registration tax invoice (استمارة تسجيل المشاركين) ─────────────────────
const cell = (label, value) => `<div style="padding:5px 0;border-bottom:1px solid #EFE7D6">
    <div style="font-size:10px;color:#8A7A60">${label}</div>
    <div dir="auto" style="font-size:13px;font-weight:700;min-height:18px">${value}</div>
  </div>`

const heading = (text) => `<div style="font-size:13px;font-weight:900;margin:12px 0 4px;padding-bottom:3px;border-bottom:2px solid ${GOLD}">${text}</div>`

/** Charges of a registered participant, rebuilt from what is stored on the exhibitor. */
export function participantCharges(exhibitor) {
  const extras = Array.isArray(exhibitor.extras) ? exhibitor.extras : []
  const extrasSum = extras.reduce((t, x) => t + num(x.price) * num(x.qty), 0)
  return { extras, ...registrationTotals({ boothPrice: num(exhibitor.contract) - extrasSum, extras }) }
}

/** The booth line of an invoice: package and site number, with what the package includes beneath. */
function boothItem(e, pkg) {
  const site = e.booth && !['—', '-'].includes(String(e.booth).trim()) ? ` — موقع رقم ${bdi(e.booth)}` : ''
  const includes = pkg ? `<div style="font-size:10px;color:#6B5A40;margin-top:2px">يشمل: ${escapeHtml(pkg.includes)}</div>` : ''
  return `<strong>${escapeHtml(e.booth_type || 'نظام البوث')}</strong>${site}${includes}`
}

export function registrationInvoiceHtml({ exhibitor: e, exhibition: ex, payment }, { date = today() } = {}) {
  const c = participantCharges(e)
  const pkg = BOOTH_PACKAGES.find((p) => p.name === e.booth_type)
  const pending = payment && !isConfirmed(payment)
  // Paid so far (before VAT): the confirmed total, plus this payment while it awaits confirmation.
  const paidNet = num(e.paid) + (pending ? num(payment.amount) : 0)
  const paidGross = withVat(paidNet)
  const remaining = Math.max(0, c.total - paidGross)
  const exName = ex ? escapeHtml(ex.name?.trim() || `SOVA ${ex.city}`) : '—'
  const money = (v) => bdi(omr(v))

  const items = [
    [boothItem(e, pkg), 1, c.boothPrice],
    ...c.extras.filter((x) => num(x.price) >= 0).map((x) => [escapeHtml(x.name), num(x.qty), num(x.price)]),
  ]
  const td = 'padding:6px 10px;font-size:12px;border-bottom:1px solid #F0E8D8'
  const th = `padding:7px 10px;font-size:11px;background:${INK};color:${GOLD};text-align:right`
  const sumRow = (label, value, strong) =>
    `<tr><td colspan="3" style="${td};text-align:left;${strong ? 'font-weight:900;font-size:13px' : 'color:#6B5A40'}">${label}</td>
     <td style="${td};${strong ? 'font-weight:900;font-size:13px' : ''}">${money(value)}</td></tr>`

  const invoicePage = page(
    `<div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:6px">
      <div>
        <div style="font-size:24px;font-weight:900">فاتورة</div>
        <div style="font-size:12px;color:#8A7A60;direction:ltr;text-align:right">Invoice</div>
      </div>
      <div style="font-size:12px;line-height:1.8;text-align:left">
        رقم الفاتورة: ${bdi(payment?.invoice_no || '—')}<br>
        التاريخ: ${bdi(payment?.date || date)}<br>
        ${COMPANY.vatNumber ? `الرقم الضريبي: ${bdi(COMPANY.vatNumber)}` : ''}
      </div>
    </div>
    ${pending ? `<div style="background:#FFF4DB;border:1px solid #E8C877;padding:6px 12px;border-radius:6px;font-size:12px;font-weight:700;text-align:center">الدفعة بانتظار تأكيد استلام المبلغ من الإدارة المالية</div>` : ''}

    ${heading('بيانات المشارك')}
    <div style="display:grid;grid-template-columns:1fr 1fr;column-gap:28px">
      ${cell('الاسم الكامل', escapeHtml(e.manager || '—'))}
      ${cell('الرقم المدني', bdi(e.civil_id || '—'))}
      ${cell('اسم المشروع', escapeHtml(e.brand || '—'))}
      ${cell('رقم التواصل (واتساب)', bdi(e.phone || '—'))}
      ${cell('القطاع', escapeHtml(e.category || '—'))}
      ${cell('نوع المنتجات', escapeHtml(e.products || '—'))}
    </div>

    ${heading('المعرض والموقع')}
    <div style="display:grid;grid-template-columns:1fr 1fr;column-gap:28px">
      ${cell('المعرض', exName)}
      ${cell('المكان والتاريخ', ex ? `${escapeHtml(ex.mall || '')} · من ${bdi(ex.date_from)} إلى ${bdi(ex.date_to)}` : '—')}
      ${cell('نظام البوث', `${escapeHtml(e.booth_type || '—')}${pkg ? `<div style="font-size:10px;font-weight:400;color:#6B5A40">${escapeHtml(pkg.includes)}</div>` : ''}`)}
      ${cell('رقم الموقع', bdi(e.booth || '—'))}
    </div>
    <div style="font-size:10px;color:#8A7A60;margin-top:4px">${BOOTH_NOTE}</div>

    ${heading('تفاصيل الفاتورة')}
    <table style="width:100%;border-collapse:collapse">
      <thead><tr><th style="${th}">البند</th><th style="${th}">الكمية</th><th style="${th}">سعر الوحدة</th><th style="${th}">المبلغ</th></tr></thead>
      <tbody>
        ${items.map(([name, qty, price]) => `<tr><td style="${td}">${name}</td><td style="${td}">${bdi(qty)}</td><td style="${td}">${money(price)}</td><td style="${td}">${money(qty * price)}</td></tr>`).join('')}
        ${c.discount ? sumRow('الخصم', -c.discount) : ''}
        ${vatEnabled()
          ? `${sumRow('المجموع قبل الضريبة', c.subtotal)}${sumRow('ضريبة القيمة المضافة 5%', c.vat)}${sumRow('الإجمالي شامل الضريبة', c.total, true)}`
          : sumRow('الإجمالي', c.total, true)}
      </tbody>
    </table>

    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-top:12px">
      <div style="background:${GOLD};padding:10px;border-radius:8px;text-align:center">
        <div style="font-size:11px">المدفوع${pending ? ' (بانتظار التأكيد)' : ''}</div>
        <div style="font-size:17px;font-weight:900">${money(paidGross)}</div>
      </div>
      <div style="background:${remaining > 0.0005 ? '#FDEAEA' : '#E7F6EC'};padding:10px;border-radius:8px;text-align:center">
        <div style="font-size:11px">المتبقي</div>
        <div style="font-size:17px;font-weight:900">${money(remaining)}</div>
      </div>
      <div style="background:#FDFAF5;padding:10px;border-radius:8px;text-align:center;font-size:11px;line-height:1.6">
        طريقة السداد: <strong>${escapeHtml(payment ? (payment.method === 'نقد' ? 'كاش' : payment.method) : '—')}</strong>
        ${payment?.transfer_ref ? `<br>رقم الحساب / المحوَّل إليه: ${bdi(payment.transfer_ref)}` : ''}
      </div>
    </div>
    ${deadlineLine(ex, remaining)}
    <div style="font-size:10px;color:#6B5A40;margin-top:6px">المبالغ بالريال العُماني. الحجز لا يُعدّ مؤكداً إلا بعد سداد قيمة الاشتراك كاملة.</div>

    <div style="margin-top:12px;border:1.5px solid ${INK};padding:8px 12px;font-size:12px;font-weight:700">
      ${e.terms_accepted ? '☑' : '☐'} أوافق على الشروط والأحكام الواردة في الصفحة الثانية
    </div>
    <div style="display:flex;justify-content:space-between;margin-top:26px;font-size:11px">
      <div style="width:44%;border-top:1.5px solid ${INK};padding-top:4px">اسم المشارك وتوقيعه</div>
      <div style="width:44%;border-top:1.5px solid ${INK};padding-top:4px">عن الإدارة — ${COMPANY.legalName}</div>
    </div>`,
    { fixedHeight: true },
  )

  const termsPage = page(
    `${title_('الشروط والأحكام', 'Terms &amp; Conditions')}
    <div style="font-size:11px;color:#6B5A40;text-align:center;margin-top:-8px;margin-bottom:10px">
      تُعدّ هذه الشروط جزءاً لا يتجزأ من استمارة التسجيل، ويُقرّ المشارك بالاطلاع عليها والموافقة عليها بتوقيعه في الصفحة الأولى.
    </div>
    ${PARTICIPATION_TERMS.map(
      (t, i) => `<div style="display:flex;gap:14px;padding:9px 0;border-bottom:1px solid #EFE7D6">
        <div style="color:#EC3013;font-weight:900;font-size:14px;width:18px">${bdi(i + 1)}</div>
        <div><div style="font-weight:800;font-size:13px">${t.title}</div><div style="font-size:12px;line-height:1.7">${t.text}</div></div>
      </div>`,
    ).join('')}
    <div style="margin-top:16px;font-size:12px;font-weight:700">الملاحظات</div>
    <div style="border:1.5px solid ${INK};min-height:90px;padding:8px;font-size:12px" dir="auto">${escapeHtml(e.notes || '')}</div>
    <div style="display:flex;justify-content:space-between;margin-top:40px;font-size:11px">
      <div style="width:44%;border-top:1.5px solid ${INK};padding-top:4px">اسم المشارك وتوقيعه: ${escapeHtml(e.manager || '')}</div>
      <div style="width:44%;border-top:1.5px solid ${INK};padding-top:4px">عن الإدارة — ${COMPANY.legalName}</div>
    </div>`,
    { fixedHeight: true },
  )

  return `<div>${invoicePage}${termsPage}</div>`
}

export function downloadRegistrationInvoice(data) {
  const ref = data.payment?.invoice_no || safeName(data.exhibitor.brand)
  return renderPdf(inArabic(() => registrationInvoiceHtml(data)), `AIB-Invoice-${safeName(ref)}.pdf`, { fitPages: true })
}
