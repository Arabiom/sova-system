// «الموظفون الرقميون» — the parts that need no database: choosing a campaign's recipients from
// the client base, and the campaign statuses (the database enforces the same rules, migration 034).
import { phoneKey } from './format.js'
import { isOpen } from './advisor.js'
import { clientSectors } from './matching.js'
import { researchHealth, researchSwitch } from './prospects.js'

export const CAMPAIGN_STATUSES = ['مسودة', 'بانتظار الاعتماد', 'معتمدة', 'أُرسلت', 'ملغاة']
export const CAMPAIGN_BADGE = {
  مسودة: 'badge-neutral',
  'بانتظار الاعتماد': 'badge-warning',
  معتمدة: 'badge-success',
  'أُرسلت': 'badge-info',
  ملغاة: 'badge-neutral',
}
export const RECIPIENT_STATUSES = ['بانتظار', 'أُرسلت', 'قُرئت', 'رد', 'طلب الإيقاف', 'فشل']

/** A number good enough to message: 8 to 15 digits once normalised. */
export const validPhone = (phone) => /^\d{8,15}$/.test(phoneKey(phone))

/** Days since a date (ISO), or null. */
const daysSince = (iso, today) => (iso ? Math.floor((Date.parse(today) - Date.parse(String(iso).slice(0, 10))) / 864e5) : null)

/**
 * The clients a campaign goes to: those matching the filter, each number once, never one on the
 * stop list. Returns the recipients and how many were left out and why.
 * filter: { sources: [], sectors: [], cities: [], statuses: [], notContactedDays, exhibition, forSectors }
 * — with an exhibition chosen, only clients of its target sectors (forSectors) not marked «غير مناسب».
 */
export function segmentClients(clients, filter = {}, optOutKeys = new Set(), today = new Date().toISOString().slice(0, 10)) {
  const has = (list, v) => !list?.length || list.includes(v || '')
  const matching = clients.filter(
    (c) =>
      has(filter.sources, c.contact_source) &&
      has(filter.sectors, c.sector) &&
      has(filter.cities, c.city) &&
      has(filter.statuses, c.status) &&
      (!filter.exhibition || c.outreach !== 'غير مناسب') &&
      (!filter.forSectors?.length || clientSectors(c).some((x) => filter.forSectors.includes(x))) &&
      (!filter.notContactedDays || (daysSince(c.last_contact_at, today) ?? Infinity) >= Number(filter.notContactedDays)),
  )
  const seen = new Set()
  const recipients = []
  const left = { noPhone: 0, optedOut: 0, duplicate: 0 }
  for (const c of matching) {
    const phone = c.whatsapp || c.phone
    const key = phoneKey(phone)
    if (!validPhone(phone)) left.noPhone++
    else if (optOutKeys.has(key)) left.optedOut++
    else if (seen.has(key)) left.duplicate++
    else {
      seen.add(key)
      recipients.push({ client_id: c.id, name: c.contact_name || c.name, phone })
    }
  }
  return { matching: matching.length, recipients, left }
}

/** What the person in front of the screen may do with a campaign. */
export function campaignActions(campaign, { role, canWrite }) {
  const s = campaign.status
  return {
    submit: canWrite && s === 'مسودة',
    approve: role === 'admin' && s === 'بانتظار الاعتماد',
    backToDraft: canWrite && (s === 'بانتظار الاعتماد' || s === 'معتمدة'),
    cancel: canWrite && s !== 'أُرسلت' && s !== 'ملغاة',
    remove: (role === 'admin' && s !== 'أُرسلت') || (canWrite && (s === 'مسودة' || s === 'بانتظار الاعتماد')),
  }
}

/** Days between two ISO dates (b − a). */
const daysBetween = (a, b) => Math.floor((Date.parse(String(b).slice(0, 10)) - Date.parse(String(a).slice(0, 10))) / 864e5)

/**
 * The digital employees and, for each, its numbers and what it needs from the team now.
 * Every number is counted from the records themselves; nothing is estimated.
 * needs: [{ text, args, tab, tone }] — tone 'action' (someone must act) or 'setup' (not set up yet).
 */
export function digitalEmployees({ campaigns = [], recipients = [], followups = [], optOuts = [], prospects = [], prospectsReady = true, feedSince = null, runs = [], plan = null, advisorItems = [], advisorReady = true, review = [], role, today, now = new Date() }) {
  const admin = role === 'admin'
  const pending = campaigns.filter((c) => c.status === 'بانتظار الاعتماد').length
  const approved = campaigns.filter((c) => c.status === 'معتمدة').length
  const open = followups.filter((f) => f.status === 'مفتوحة')
  const overdue = open.filter((f) => f.due_date && f.due_date < today).length
  const doneWeek = followups.filter((f) => f.status === 'تمت' && f.done_at && daysBetween(f.done_at, today) <= 6).length
  const unassigned = open.filter((f) => !f.assigned_to).length
  const toReview = prospects.filter((p) => p.status === 'جديد').length
  const addedWeek = prospects.filter((p) => p.created_at && daysBetween(p.created_at, today) <= 6).length
  const converted = prospects.filter((p) => p.status === 'أصبح عميلاً').length
  const daily = prospects.filter((p) => p.origin === 'البحث اليومي').length
  const health = researchHealth(runs, feedSince, now)
  const sw = researchSwitch(plan, runs)

  const need = (cond, text, args, tab, tone = 'action') => (cond ? [{ text, args, tab, tone }] : [])
  const openItems = advisorItems.filter(isOpen)
  const urgent = openItems.filter((i) => i.priority === 'عاجلة').length
  const late = openItems.filter((i) => i.due_date && i.due_date < today).length
  const problems = review.filter((r) => r.tone === 'danger').length
  const waiting = review.filter((r) => r.tone === 'warning').length
  // the owner's follow-up employee: their list, and the live review of the site (admin only)
  const advisor = {
    id: 'advisor',
    icon: '🧠',
    name: 'موظف المتابعة والاقتراحات والحلول',
    role: 'يراجع الموقع كل يوم مع Claude، ويكتب مهامك واقتراحاته وحلول المشاكل حتى لا يُنسى شيء',
    state: !advisorReady ? 'يحتاج تحديث قاعدة البيانات' : problems ? 'وجد مشاكل تحتاج حلاً' : 'يعمل — يراجع الموقع يومياً',
    tone: !advisorReady || problems ? 'danger' : 'success',
    tabs: ['tasks', 'review'],
    kpis: [
      { label: 'مهام مفتوحة', value: openItems.length },
      { label: 'عاجلة', value: urgent },
      { label: 'ملاحظات المراجعة', value: review.length },
    ],
    needs: [
      ...need(!advisorReady, 'تشغيل تحديث قاعدة البيانات 040', [], 'tasks', 'setup'),
      ...need(problems > 0, '{0} مشكلة في الموقع تحتاج حلاً', [problems], 'review'),
      ...need(urgent > 0, '{0} مهمة عاجلة', [urgent], 'tasks'),
      ...need(late > 0, '{0} مهمة تجاوزت موعدها', [late], 'tasks'),
      ...need(waiting > 0, '{0} أمر ينتظر رداً أو متابعة', [waiting], 'review'),
    ],
  }
  return [
    {
      id: 'marketing',
      icon: '📣',
      name: 'موظف التسويق',
      role: 'يجهّز حملات واتساب من قاعدة العملاء، ولا يُرسل إلا ما يعتمده المدير، ويحفظ قائمة الإيقاف',
      state: 'يعمل — بدون إرسال فعلي',
      tone: 'warning',
      tabs: ['campaigns', 'optouts'],
      kpis: [
        { label: 'الحملات', value: campaigns.length },
        { label: 'بانتظار الاعتماد', value: pending },
        { label: 'أرقام في الحملات', value: recipients.length },
      ],
      needs: [
        ...need(pending > 0 && admin, 'اعتماد {0} حملة', [pending], 'campaigns'),
        ...need(pending > 0 && !admin, '{0} حملة بانتظار اعتماد المدير', [pending], 'campaigns'),
        ...need(approved > 0, '{0} حملة معتمدة تنتظر تفعيل الإرسال', [approved], 'campaigns', 'setup'),
        ...need(!campaigns.length, 'إنشاء أول حملة', [], 'campaigns'),
        { text: 'ربط الإرسال عبر LetsBot (المرحلة الثانية)', args: [], tab: 'campaigns', tone: 'setup' },
      ],
      extra: [{ label: 'في قائمة الإيقاف', value: optOuts.length }],
    },
    {
      id: 'sales',
      icon: '📞',
      name: 'موظف المبيعات والمتابعة',
      role: 'يذكّر الفريق بمن يجب الاتصال به ومتى، حتى لا يضيع أي عميل',
      state: 'يعمل',
      tone: 'success',
      tabs: ['followups'],
      kpis: [
        { label: 'متابعات مفتوحة', value: open.length },
        { label: 'متأخرة', value: overdue },
        { label: 'تمت هذا الأسبوع', value: doneWeek },
      ],
      needs: [
        ...need(overdue > 0, '{0} متابعة متأخرة', [overdue], 'followups'),
        ...need(unassigned > 0, '{0} متابعة بلا مكلَّف', [unassigned], 'followups'),
        ...need(!followups.length, 'إضافة أول متابعة', [], 'followups'),
      ],
    },
    {
      id: 'research',
      icon: '🔎',
      name: 'موظف البحث',
      role: 'يبحث في المصادر العامة عن عارضين ورعاة ومواقع جديدة، ويضيفها لتراجعها',
      state: !prospectsReady
        ? 'يحتاج تحديث قاعدة البيانات'
        : !sw.on
          ? 'متوقف — أوقفه المدير'
          : sw.requested
            ? 'طُلب بحث — يبدأ خلال ساعة'
            : health.state === 'late'
              ? 'متوقف — لم يصل تقريره'
              : feedSince
                ? 'يعمل يومياً'
                : 'يدوي — البحث اليومي غير مفعّل',
      tone: !prospectsReady || (sw.on && health.state === 'late') ? 'danger' : !sw.on ? 'neutral' : sw.requested ? 'info' : feedSince ? 'success' : 'warning',
      tabs: ['research', 'plan'],
      kpis: [
        { label: 'كل الفرص', value: prospects.length },
        { label: 'بانتظار المراجعة', value: toReview },
        { label: 'أصبحت عملاء', value: converted },
      ],
      needs: [
        ...need(!prospectsReady, 'تشغيل تحديث قاعدة البيانات 035', [], 'research', 'setup'),
        ...need(toReview > 0, 'مراجعة {0} فرصة جديدة', [toReview], 'research'),
        ...need(prospectsReady && !feedSince && admin, 'تفعيل البحث اليومي', [], 'plan', 'setup'),
        ...need(sw.on && health.state === 'late', 'البحث اليومي لم يرسل تقريراً منذ {0} يوم', [Math.max(health.days || 0, 1)], 'plan'),
        ...need(!sw.on && admin, 'تشغيل موظف البحث', [], 'research', 'setup'),
      ],
      extra: [
        { label: 'أُضيفت هذا الأسبوع', value: addedWeek },
        { label: 'من البحث اليومي', value: daily },
      ],
    },
    ...(admin ? [advisor] : []),
  ]
}
