// The public booking link (/book, migration 026). Visitors have no account: they only see the
// upcoming exhibitions' public details and send a booking request or an inquiry, which lands in
// «طلبات الحجز» as pending.
import { supabase } from './client.js'
import { tr } from '../lib/i18n.js'

export const KIND_BOOKING = 'حجز'
export const KIND_INQUIRY = 'استفسار'

/** The public page's own path — shared on Instagram and WhatsApp. */
export const PUBLIC_BOOKING_PATH = '/book'
export const publicBookingUrl = () => `${window.location.origin}${PUBLIC_BOOKING_PATH}`

const MESSAGES = {
  invalid_kind: 'اختر نوع الطلب',
  invalid_name: 'اكتب اسمك',
  invalid_phone: 'رقم الجوال غير صحيح — 8 أرقام على الأقل',
  invalid_brand: 'اكتب اسم المشروع أو البراند',
  invalid_exhibition: 'اختر المعرض من القائمة',
  invalid_email: 'البريد الإلكتروني غير صحيح',
  empty_message: 'اكتب استفسارك',
  too_long: 'أحد الحقول أطول من المسموح',
  too_many: 'استلمنا عدة طلبات من هذا الرقم خلال ساعة — سنتواصل معك قريباً',
}

function publicError(error) {
  const key = Object.keys(MESSAGES).find((k) => (error?.message || '').includes(k))
  if (key) return tr(MESSAGES[key])
  if (/failed to fetch|networkerror|load failed/i.test(error?.message || '')) return tr('تعذّر الاتصال. تحقق من الإنترنت ثم أعد المحاولة.')
  return tr('تعذّر إرسال الطلب حالياً. تواصل معنا عبر واتساب.')
}

/** Upcoming and running exhibitions: name, city, mall, dates, hours and their packages. */
export async function listPublicExhibitions() {
  const { data, error } = await supabase.rpc('public_exhibitions')
  if (error) throw new Error(publicError(error), { cause: error })
  return data || []
}

/** Send one request. Returns its id. */
export async function submitPublicBooking(form) {
  const { data, error } = await supabase.rpc('submit_booking', {
    p_kind: form.kind,
    p_brand: form.brand || '',
    p_manager: form.manager || '',
    p_phone: form.phone || '',
    p_email: (form.email || '').trim().toLowerCase(),
    p_category: form.category || '',
    p_exhibition_id: form.exhibition_id || null,
    p_package: form.package || '',
    p_message: form.message || '',
  })
  if (error) throw new Error(publicError(error), { cause: error })
  return data
}
