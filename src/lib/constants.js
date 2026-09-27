// Company details — from the company's business reference sheet.
export const COMPANY = {
  name: 'محور الأعمال المتكاملة',
  legalName: 'محور الأعمال المتكاملة لتنظيم المعارض',
  nameEn: 'Axis Integrated Business',
  brand: 'SOVA',
  brandFull: 'SOVA Exhibition',
  cr: 'CR# 1636161',
  location: 'مسقط، سلطنة عُمان',
  phone: '96955525',
  whatsapp: '96895594980', // 95594980 with the Oman country code, for wa.me links
  email: 'axis.integrated.business@gmail.com',
  instagram: '@exhibitions.om',
  bank: 'بنك مسقط — INTEGRATED BUSINESS AXIS',
  signatory: 'عربي بن هلال',
  logo: '/brand/axis-logo.svg', // for light backgrounds
  logoLight: '/brand/axis-logo-light.svg', // for dark backgrounds
  mark: '/brand/axis-mark.svg',
  markLight: '/brand/axis-mark-light.svg',
  systemName: 'نظام إدارة المعارض',
  version: 'v4.0',
}

export const VAT_RATE = 0.05

export const CITIES = ['مسقط', 'نزوى', 'صحار', 'صلالة', 'البريمي', 'مطرح', 'السيب', 'بهلاء', 'عبري', 'إبراء']

export const EXHIBITION_STATUSES = ['تخطيط', 'قادم', 'جاري', 'منتهي', 'ملغى']
export const EXHIBITOR_STATUSES = ['مبدئي', 'قيد التوقيع', 'مؤكد']
export const BOOKING_STATUSES = ['معلق', 'مقبول', 'مرفوض']

export const CATEGORIES = ['أزياء', 'عطور وبخور', 'إكسسوار', 'جمال', 'خدمات أعمال', 'أخرى']
export const BOOTH_SIZES = ['2×2 متر', '3×2 متر', '4×2 متر', 'مخصص']

export const PAYMENT_METHODS = ['نقد', 'تحويل بنكي', 'فيزا / ماستركارد', 'شيك']
export const PAYMENT_TYPES = ['كامل', 'مقدمة', 'جزئية', 'أخيرة', 'إرجاع']

/** A payment of this type returns money to the exhibitor; it is stored as a negative amount. */
export const REFUND_TYPE = 'إرجاع'

export const PAYMENT_METHOD_META = {
  'نقد': { icon: '💵', color: 'var(--suc)' },
  'تحويل بنكي': { icon: '🏦', color: 'var(--ink)' },
  'فيزا / ماستركارد': { icon: '💳', color: 'var(--wrn)' },
  'شيك': { icon: '📝', color: '#7C3AED' },
  'غير محدد': { icon: '❔', color: 'var(--muted)' },
}

export const CLIENT_STATUSES = ['نشط', 'محتمل', 'متوقف']
export const CLIENT_SOURCES = ['إنستقرام', 'واتساب', 'توصية', 'معرض سابق', 'زيارة مباشرة', 'أخرى']

/** Suggestions for the free-text sector field (the business uses its own wording too). */
export const SECTOR_SUGGESTIONS = [
  'أزياء نسائية',
  'أزياء رجالية',
  'أقمشة',
  'عطور وبخور',
  'مستحضرات تجميل',
  'إكسسوار',
  'قاعات أفراح وضيافة',
  'زهور وهدايا',
  'تصوير وطباعة',
  'حلويات وكيك',
  'منتجات غذائية',
  'سياحة وسفر',
  'خدمات أعمال',
]

export const EXPENSE_CATEGORIES = [
  'إيجار / شيك حجز المساحة',
  'تشغيل',
  'تجهيزات وديكور',
  'تسويق وإعلانات',
  'طباعة',
  'رسوم وتراخيص',
  'أخرى',
]

export const SPONSOR_STATUSES = ['متفق عليه', 'مدفوع']

/** Default booth tiers for a new exhibition. */
export const DEFAULT_TIERS = [
  { name: 'أمامي', price: 600, count: 10 },
  { name: 'وسط', price: 450, count: 15 },
  { name: 'خلفي', price: 300, count: 11 },
]

/** Colour tone of every status label shown in a badge. */
export const STATUS_TONES = {
  'مؤكد': 'success',
  'منتهي': 'success',
  'مدفوع': 'success',
  'مقبول': 'success',
  'كامل': 'success',
  'قادم': 'gold',
  'جاري': 'info',
  'أخيرة': 'info',
  'تخطيط': 'neutral',
  'مبدئي': 'neutral',
  'قيد التوقيع': 'warning',
  'معلق': 'warning',
  'مقدمة': 'warning',
  'جزئية': 'warning',
  'لم يُدفع': 'danger',
  'مرفوض': 'danger',
  'ملغى': 'danger',
  'إرجاع': 'danger',
  'نشط': 'success',
  'محتمل': 'gold',
  'متوقف': 'neutral',
  'متفق عليه': 'warning',
  'متاح': 'neutral',
  'محجوز': 'warning',
  'مدفوع جزئياً': 'info',
}
