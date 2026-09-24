import { COMPANY } from './constants.js'
import { fixed3, num } from './format.js'

/** Local Omani numbers get the 968 country code; "+968…", "00968…" and "968…" are kept as is. */
export function normalizePhone(phone) {
  const digits = String(phone || '').replace(/[^\d]/g, '').replace(/^00/, '')
  if (!digits) return ''
  return digits.startsWith('968') ? digits : `968${digits}`
}

export const whatsappUrl = (phone, text) =>
  `https://wa.me/${normalizePhone(phone)}?text=${encodeURIComponent(text)}`

export function openWhatsApp(phone, text) {
  window.open(whatsappUrl(phone, text), '_blank', 'noopener')
}

const contactLine = `wa.me/${COMPANY.whatsapp}`

export function confirmationMessage(exhibitor, exhibition) {
  const ex = exhibition || {}
  return `السلام عليكم ورحمة الله وبركاته 🌟

*SOVA Exhibition — محور الأعمال المتكاملة*

نرحب بكم في عائلة SOVA! 🎉

✅ *تم قبول طلب حجزكم بنجاح*

📋 *تفاصيل الحجز:*
• العلامة التجارية: *${exhibitor.brand}*
• المعرض: *SOVA ${ex.city || ''}*
• التاريخ: *${ex.date_from || ''} – ${ex.date_to || ''}*
• الموقع: *${ex.mall || ''}*
• رقم البوث: *${exhibitor.booth && exhibitor.booth !== '—' ? exhibitor.booth : 'سيُحدد قريباً'}*
• حجم البوث: *${exhibitor.booth_size || '—'}*

💰 *المالية:*
• قيمة العقد: *${fixed3(exhibitor.contract)} ر.ع*
• المدفوع: *${fixed3(exhibitor.paid)} ر.ع*
• المتبقي: *${fixed3(num(exhibitor.contract) - num(exhibitor.paid))} ر.ع*

📞 للاستفسار: ${contactLine}

نتطلع لرؤيتكم في المعرض 🏛️
*فريق SOVA*`
}

export function paymentReminderMessage(exhibitor, exhibition) {
  const ex = exhibition || {}
  return `السلام عليكم ورحمة الله وبركاته

*SOVA Exhibition — تذكير بالدفع*

عزيزنا / ${exhibitor.manager}

نود تذكيركم بأن هناك مبلغاً متبقياً لاستكمال حجزكم في:

🏛️ *معرض SOVA ${ex.city || ''}*
📅 ${ex.date_from || ''} – ${ex.date_to || ''}

💰 *المبلغ المتبقي: ${fixed3(num(exhibitor.contract) - num(exhibitor.paid))} ر.ع*

الرجاء إتمام الدفع قبل موعد المعرض لضمان مكانكم.

طرق الدفع:
• نقداً
• تحويل بنكي
• فيزا / ماستركارد

📞 للتواصل: ${contactLine}

شكراً لتعاونكم 🙏
*فريق SOVA*`
}

export function daysUntil(date, now = new Date()) {
  return Math.ceil((new Date(date) - now) / 86_400_000)
}

export function exhibitionReminderMessage(exhibitor, exhibition, now = new Date()) {
  const ex = exhibition || {}
  const days = daysUntil(ex.date_from, now)
  return `السلام عليكم ورحمة الله وبركاته 🌟

*SOVA Exhibition — تذكير بموعد المعرض*

عزيزنا / ${exhibitor.manager}

⏰ *تبقى ${days > 0 ? `${days} يوم` : 'أقل من يوم'} على انطلاق المعرض!*

🏛️ *SOVA ${ex.city || ''}*
📅 التاريخ: *${ex.date_from || ''} – ${ex.date_to || ''}*
📍 الموقع: *${ex.mall || ''}*
🔢 رقم البوثكم: *${exhibitor.booth && exhibitor.booth !== '—' ? exhibitor.booth : 'سيُبلَّغ قريباً'}*

📌 *تعليمات مهمة:*
• يرجى الحضور قبل ساعة من الافتتاح لترتيب البوث
• يُمنع التصوير داخل البوثات الأخرى
• يجب الحفاظ على نظافة المنطقة المحيطة

نتمنى لكم تجربة ناجحة ومميزة 🎊
*فريق SOVA — محور الأعمال المتكاملة*`
}

export function welcomeMessage(_person, exhibition) {
  const ex = exhibition || {}
  return `السلام عليكم ورحمة الله وبركاته

*أهلاً بكم في SOVA Exhibition* 🌟

شكراً على تواصلكم معنا!

نحن سعداء باهتمامكم بالمشاركة في:
🏛️ *معرض SOVA ${ex.city || ''}*
📅 ${ex.date_from || ''} – ${ex.date_to || ''}
📍 ${ex.mall || ''}

سيتواصل معكم فريقنا خلال 24 ساعة لإتمام إجراءات التسجيل.

📞 للاستفسار الفوري: ${contactLine}

*فريق SOVA — محور الأعمال المتكاملة*
${COMPANY.cr}`
}

export const MESSAGE_TYPES = [
  { id: 'reminder', label: '⏰ تذكير بموعد المعرض', color: 'var(--gold)', build: exhibitionReminderMessage },
  { id: 'confirmed', label: '✅ تأكيد الحجز', color: 'var(--suc)', build: confirmationMessage },
  { id: 'payment', label: '💰 تذكير بالدفع', color: 'var(--wrn)', build: paymentReminderMessage },
  { id: 'welcome', label: '🌟 رسالة ترحيب', color: '#7C3AED', build: welcomeMessage },
  { id: 'custom', label: '✏️ رسالة مخصصة', color: 'var(--ink)', build: null },
]
