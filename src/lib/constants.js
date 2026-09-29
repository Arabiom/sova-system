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
  vatNumber: '', // الرقم الضريبي — printed on tax invoices once provided
  version: 'v4.0',
}

export const VAT_RATE = 0.05

export const CITIES = ['مسقط', 'نزوى', 'صحار', 'صلالة', 'البريمي', 'مطرح', 'السيب', 'بهلاء', 'عبري', 'إبراء']

export const EXHIBITION_STATUSES = ['تخطيط', 'قادم', 'جاري', 'منتهي', 'ملغى']
export const EXHIBITOR_STATUSES = ['مبدئي', 'قيد التوقيع', 'مؤكد']
export const BOOKING_STATUSES = ['معلق', 'مقبول', 'مرفوض']

export const CATEGORIES = ['أزياء', 'عطور وبخور', 'إكسسوار', 'جمال', 'خدمات أعمال', 'أخرى']
export const BOOTH_SIZES = ['2×2 متر', '3×2 متر', '4×2 متر', 'مخصص']

export const PAYMENT_METHODS = ['نقد', 'تحويل بنكي', 'تحويل عبر رقم الهاتف', 'فيزا / ماستركارد', 'شيك']
export const PAYMENT_TYPES = ['كامل', 'مقدمة', 'جزئية', 'أخيرة', 'إرجاع']

/** A payment of this type returns money to the exhibitor; it is stored as a negative amount. */
export const REFUND_TYPE = 'إرجاع'

/**
 * Payment status. A payment recorded by marketing waits for finance to confirm the money
 * arrived; until then it is not counted as collected. Older payments have no status (= confirmed).
 */
export const PAYMENT_CONFIRMED = 'مؤكد'
export const PAYMENT_PENDING = 'بانتظار التأكيد'

// ── Participant registration form (استمارة تسجيل المشاركين) ─────────────────
/** Sectors as printed on the form — one choice. */
export const FORM_SECTORS = ['أزياء', 'أقمشة', 'عطور وبخور', 'تجميل', 'قاعات أفراح وضيافة', 'زهور وهدايا', 'تصوير وطباعة', 'حلويات', 'سياحة وسفر']

/** Booth packages; prices before VAT (5% is added on top). */
export const BOOTH_PACKAGES = [
  { name: 'ركن مدخل', price: 200, includes: 'طاولتان + مفرشان + كرسيان + علاقان أو رفّان + لوحة خلفية بهوية المعرض' },
  { name: 'كورنر هاير', price: 150, includes: 'طاولة + مفرش + كرسيان + علاقة واحدة أو ستاند واحد + بوستر ترويجي' },
  { name: 'وسط المعرض', price: 125, includes: 'طاولة + مفرش + كرسيان + بوستر ترويجي' },
  { name: 'صف داخلي', price: 100, includes: 'طاولة + مفرش + كرسيان + بوستر ترويجي' },
]
export const BOOTH_NOTE = 'جميع المواقع بمساحة 2 × 3 أمتار، وتشمل نقطة كهرباء وتنظيفاً يومياً.'
export const BOOTH_AREA = '3×2 متر'

/** Optional extras, each at an additional fee (before VAT). */
export const BOOTH_EXTRAS = [
  { name: 'علاقة', price: 10 },
  { name: 'طاولة إضافية', price: 5 },
  { name: 'ستاند للأغراض', price: 10 },
  { name: 'لوحة خلفية مطبوعة', price: 15 },
]

/** Payment methods offered on the form. */
export const FORM_PAYMENT_METHODS = [
  { value: 'تحويل بنكي', label: 'تحويل بنكي' },
  { value: 'تحويل عبر رقم الهاتف', label: 'تحويل عبر رقم الهاتف' },
  { value: 'نقد', label: 'كاش' },
]

/** Terms and conditions — page 2 of the registration form. */
export const PARTICIPATION_TERMS = [
  { title: 'تأكيد الحجز والسداد', text: 'لا يُعدّ الحجز مؤكداً إلا بعد سداد قيمة الاشتراك كاملة وإرفاق إيصال التحويل. تُوزَّع المواقع وفق أسبقية السداد، أو اختيار الموقع عند الحجز.' },
  { title: 'الإلغاء والاسترداد', text: 'قيمة الاشتراك غير قابلة للاسترداد بعد تأكيد الحجز، ولا تُحوَّل إلى معرض آخر إلا بموافقة من الإدارة.' },
  { title: 'حدود الموقع', text: 'مساحة الموقع {المساحة}، ولا يجوز تجاوز حدوده أو العرض في الممرات، ولا تغيير الموقع أو التنازل عنه لطرف آخر.' },
  { title: 'المنتجات المعروضة', text: 'يُلتزم بعرض المنتجات المذكورة في الاستمارة فقط، وتكون نظامية ومطابقة للأنظمة المعمول بها في سلطنة عُمان.' },
  { title: 'الالتزام بأوقات العمل', text: 'يتواجد المشارك أو من ينوب عنه في الموقع خلال كامل ساعات العمل المعلنة، ولا يُسمح بإخلاء الموقع قبل انتهاء المعرض.' },
  { title: 'التركيب والتفكيك', text: 'يتم التجهيز والإخلاء في المواعيد التي تحدّدها الإدارة، ويتحمّل المشارك تكلفة أي تلف يُلحقه بالديكور أو بمرافق الموقع.' },
  { title: 'المسؤولية والتأمين', text: 'المشارك مسؤول عن بضاعته ومقتنياته الشخصية، والإدارة غير مسؤولة عن الفقدان أو التلف أو السرقة.' },
  { title: 'الحقوق الترويجية', text: 'توافق على استخدام اسم المشروع وصور الموقع في المواد الترويجية للمعرض، وتحتفظ الإدارة بحق إلغاء المشاركة عند الإخلال بأي شرط دون استرداد.' },
]

/** The terms for one participant: the site area is the one of their package (each exhibition sets its own). */
export const participationTerms = (area) =>
  PARTICIPATION_TERMS.map((t) => ({ ...t, text: t.text.replace('{المساحة}', String(area || '').trim() && String(area).trim() !== '—' ? String(area).trim() : 'حسب الباقة المختارة في الاستمارة') }))

export const PAYMENT_METHOD_META = {
  'نقد': { icon: '💵', color: 'var(--suc)' },
  'تحويل بنكي': { icon: '🏦', color: 'var(--ink)' },
  'تحويل عبر رقم الهاتف': { icon: '📲', color: '#0E7490' },
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
  'بانتظار المراجعة': 'warning',
  'بانتظار التأكيد': 'warning',
  'معتمد': 'info',
  'تم التعويض': 'success',
}
