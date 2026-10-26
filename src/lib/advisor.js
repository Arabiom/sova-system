// «موظف المتابعة والاقتراحات والحلول»: the owner's list (migration 040), and a live review of the
// site counted from the records themselves — what is late, missing or waiting, and what to do.
import { daysUntil, docState } from './documents.js'
import { exhibitionLabel } from './format.js'
import { researchHealth, researchSwitch } from './prospects.js'

export const ADVISOR_KINDS = ['مهمة', 'اقتراح', 'مشكلة']
export const ADVISOR_PRIORITIES = ['عاجلة', 'مهمة', 'عادية']
export const ADVISOR_STATUSES = ['مفتوحة', 'قيد التنفيذ', 'تمت', 'مؤجلة']
export const KIND_ICON = { مهمة: '📋', اقتراح: '💡', مشكلة: '🛠️' }
export const PRIORITY_BADGE = { عاجلة: 'badge-danger', مهمة: 'badge-warning', عادية: 'badge-neutral' }
export const STATUS_BADGE = { مفتوحة: 'badge-info', 'قيد التنفيذ': 'badge-warning', تمت: 'badge-success', مؤجلة: 'badge-neutral' }

/** Still to do (open or under way). */
export const isOpen = (item) => item.status === 'مفتوحة' || item.status === 'قيد التنفيذ'

/** Open first — urgent, then the nearest due date, then the newest; postponed and done last. */
export function sortAdvisorItems(items) {
  const rank = { مفتوحة: 0, 'قيد التنفيذ': 0, مؤجلة: 1, تمت: 2 }
  const prio = { عاجلة: 0, مهمة: 1, عادية: 2 }
  return [...items].sort(
    (a, b) =>
      rank[a.status] - rank[b.status] ||
      prio[a.priority] - prio[b.priority] ||
      String(a.due_date || '9999').localeCompare(String(b.due_date || '9999')) ||
      String(b.created_at).localeCompare(String(a.created_at)),
  )
}

const MONEY_ROLES = ['admin', 'finance']
const TONE_RANK = { danger: 0, warning: 1, info: 2 }

/**
 * What the site needs now, each with its solution: [{ ref, tone, text, args, fix, link }].
 * tone: danger (broken or overdue) · warning (waiting on someone) · info (worth doing).
 * Pass only what was loaded; a part not passed (undefined) is not checked.
 */
export function siteReview({
  role,
  today,
  now = new Date(),
  advisorReady = true,
  exhibitions = [],
  exhibitors = [],
  clients = [],
  bookingsPending = 0,
  documents,
  companyExpenses = [],
  followups = [],
  campaigns = [],
  prospects = [],
  prospectsReady = true,
  plan = null,
  runs = [],
  feedSince = null,
}) {
  const out = []
  const add = (ref, tone, text, args, fix, link) => out.push({ ref, tone, text, args, fix, link })
  const admin = role === 'admin'
  const money = MONEY_ROLES.includes(role)

  // database updates not run yet
  if (!advisorReady) add('db-040', 'danger', 'تحديث قاعدة البيانات 040 لم يُشغَّل', [], 'شغّل ملف التحديث في Supabase ← SQL Editor، ثم حدّث الصفحة', '')
  if (!prospectsReady) add('db-035', 'danger', 'تحديث قاعدة البيانات 035 لم يُشغَّل', [], 'شغّل ملف التحديث في Supabase — بدونه لا يعمل موظف البحث', '/digital/research')
  else if (plan && !researchSwitch(plan, runs).supported) add('db-038', 'danger', 'تحديث قاعدة البيانات 038 لم يُشغَّل', [], 'شغّل ملف التحديث — بدونه يتوقف البحث اليومي ولا يظهر زر التشغيل', '/digital/research')
  if (money && documents === null) add('db-039', 'danger', 'تحديث قاعدة البيانات 039 لم يُشغَّل', [], 'شغّل ملف التحديث — بدونه لا يظهر قسم وثائق الشركة وخانة التواصل', '/documents')

  // company documents
  if (money && Array.isArray(documents)) {
    const states = documents.map((d) => docState(d, today).state)
    const expired = states.filter((s) => s === 'expired').length
    const soon = states.filter((s) => s === 'soon').length
    if (expired) add('docs-expired', 'danger', '{0} وثيقة منتهية', [expired], 'جدّدها وارفع الملف الجديد من «تعديل»', '/documents')
    if (soon) add('docs-soon', 'warning', '{0} وثيقة تنتهي خلال 30 يوماً', [soon], 'ابدأ التجديد الآن حتى لا تتوقف معاملة', '/documents')
    if (admin && !documents.length) add('docs-none', 'info', 'لم تُرفع وثائق الشركة بعد', [], 'ارفع السجل التجاري والشهادة الضريبية وشهادة الانتساب مع تواريخ انتهائها', '/documents')
  }

  // company expenses past their due date and not paid
  if (money) {
    const late = companyExpenses.filter((x) => !x.paid && x.due_date && x.due_date < today)
    if (late.length) add('expenses-late', 'danger', '{0} مصروف تجاوز موعد سداده', [late.length], 'ادفعه أو سجّل الجزء المدفوع، أو غيّر موعده إن اتُّفق على تأجيله', '/finance?tab=commitments')
  }

  // bookings waiting for an answer
  if (bookingsPending > 0) add('bookings', 'warning', '{0} طلب حجز بانتظار الرد', [bookingsPending], 'اقبل الطلب أو ارفضه — من ينتظر طويلاً قد يحجز عند غيرنا', '/bookings')

  // the coming exhibitions
  const upcoming = exhibitions.filter((e) => e.date_to >= today && e.status !== 'ملغى')
  for (const ex of upcoming) {
    const days = daysUntil(ex.date_from, today)
    const label = exhibitionLabel(ex)
    const its = exhibitors.filter((x) => x.exhibition_id === ex.id)
    if (days !== null && days >= 0 && days <= 30) {
      const owing = its.filter((x) => Number(x.contract || 0) > Number(x.paid || 0)).length
      if (money && owing) add(`owing-${ex.id}`, 'warning', '{0} يبدأ بعد {1} يوم و{2} عارض لم يكمل الدفع', [label, days, owing], 'تواصل معهم الآن وسجّل الدفعات قبل الافتتاح', `/exhibitions/${ex.id}`)
      const free = Number(ex.booths || 0) - its.length
      if (free > 0) add(`free-${ex.id}`, 'warning', 'بقي {0} موقع شاغر في {1} ويبدأ بعد {2} يوم', [free, label, days], 'افتح العملاء ← «يناسبه معرض» واختره، ثم أرسل الدعوة لمن يناسبه', '/clients')
    }
    if ('sectors' in ex && !ex.sectors?.length) add(`sectors-${ex.id}`, 'info', '{0} بلا قطاعات مستهدفة', [label], 'حدّدها من «تعديل المعرض» ليُعرض على من يناسبه فقط', `/exhibitions/${ex.id}`)
  }

  // the client base
  const noSector = clients.filter((c) => !c.sector?.trim() && !c.products?.trim()).length
  if (noSector) add('clients-sector', 'info', '{0} عميل بلا قطاع ولا منتجات', [noSector], 'لا يظهرون في فرز المعارض — افتح العملاء ← «بلا قطاع» وأكمل بياناتهم', '/clients')

  // the other digital employees
  const overdue = followups.filter((f) => f.status === 'مفتوحة' && f.due_date && f.due_date < today).length
  if (overdue) add('followups', 'warning', '{0} متابعة متأخرة', [overdue], 'اتصل بهم اليوم، أو غيّر الموعد إن تأجل', '/digital/sales')
  const pending = campaigns.filter((c) => c.status === 'بانتظار الاعتماد').length
  if (admin && pending) add('campaigns', 'warning', '{0} حملة بانتظار اعتمادك', [pending], 'راجع النص والمستلمين ثم اعتمدها أو أعدها مسودة', '/digital/marketing')
  // an Excel customer list sitting in «الفرص» belongs with the clients
  const imported = prospects.filter((p) => p.origin === 'استيراد' && ['جديد', 'تم التحقق'].includes(p.status) && !p.client_id).length
  if (admin && imported) add('imported-prospects', 'warning', '{0} سجلاً من ملف Excel ما زالت في «الفرص» لا في «العملاء»', [imported], 'افتح «الفرص» واضغط «نقلها كلها إلى العملاء» — فتدخل فرز المعارض والحملات', '/digital/research')
  const toReview = prospects.filter((p) => p.status === 'جديد' && p.origin !== 'استيراد').length
  if (toReview) add('prospects', 'info', '{0} فرصة جديدة من البحث لم تُراجع', [toReview], 'راجعها: المناسب يتحول عميلاً بزر واحد، وغير المناسب يُعلَّم', '/digital/research')
  if (prospectsReady && plan) {
    const sw = researchSwitch(plan, runs)
    if (sw.supported && !sw.on) add('research-off', 'info', 'موظف البحث متوقف', [], 'شغّله من صفحة موظف البحث ليبحث كل يوم', '/digital/research')
    else if (feedSince && researchHealth(runs, feedSince, now).state === 'late') add('research-late', 'warning', 'البحث اليومي لم يرسل تقريره', [], 'تأكد أن رمز البحث ما زال صالحاً وأن المهمة المجدولة تعمل', '/digital/research?tab=plan')
  }

  return out.sort((a, b) => TONE_RANK[a.tone] - TONE_RANK[b.tone])
}
