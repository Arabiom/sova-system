export const COMPANY = {
  name: 'محور الأعمال المتكاملة',
  brand: 'SOVA',
  brandFull: 'SOVA Exhibition',
  cr: 'CR# 1636161',
  location: 'مسقط، سلطنة عُمان',
  whatsapp: '96879450062',
  version: 'v3.0',
}

export const VAT_RATE = 0.05

export const CITIES = ['مسقط', 'نزوى', 'صحار', 'صلالة', 'البريمي', 'مطرح', 'السيب', 'بهلاء', 'عبري', 'إبراء']

export const EXHIBITION_STATUSES = ['تخطيط', 'قادم', 'جاري', 'منتهي']
export const EXHIBITOR_STATUSES = ['مبدئي', 'قيد التوقيع', 'مؤكد']
export const BOOKING_STATUSES = ['معلق', 'مقبول', 'مرفوض']

export const CATEGORIES = ['أزياء', 'عطور وبخور', 'إكسسوار', 'جمال', 'خدمات أعمال', 'أخرى']
export const BOOTH_SIZES = ['2×2 متر', '3×2 متر', '4×2 متر', 'مخصص']

export const PAYMENT_METHODS = ['نقد', 'تحويل بنكي', 'فيزا / ماستركارد', 'شيك']
export const PAYMENT_TYPES = ['كامل', 'مقدمة', 'جزئية', 'أخيرة']

export const PAYMENT_METHOD_META = {
  'نقد': { icon: '💵', color: 'var(--suc)' },
  'تحويل بنكي': { icon: '🏦', color: 'var(--ink)' },
  'فيزا / ماستركارد': { icon: '💳', color: 'var(--wrn)' },
  'شيك': { icon: '📝', color: '#7C3AED' },
}

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
}
