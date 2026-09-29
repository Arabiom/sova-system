import { planHealth, THIN_MARGIN_PCT } from '../lib/finance.js'
import { formatOMR } from '../lib/format.js'
import { tr } from '../lib/i18n.js'

const LEVEL = {
  good: { cls: 'health-good', icon: '✅', title: 'الخطة سليمة' },
  watch: { cls: 'health-watch', icon: '⚠️', title: 'الخطة تحتاج انتباه' },
  risk: { cls: 'health-risk', icon: '⛔', title: 'الخطة خاسرة' },
  missing: { cls: 'health-missing', icon: 'ℹ️', title: 'لا يمكن التقييم بعد' },
}

/** One-line verdict (for tables). */
export function HealthBadge({ f }) {
  const h = planHealth(f)
  const l = LEVEL[h.level]
  return (
    <span className={`health-badge ${l.cls}`} title={verdictText(h, f)}>
      {l.icon} {tr(l.title)}
    </span>
  )
}

/** The sentence explaining the verdict. */
function verdictText(h, f) {
  if (h.level === 'missing') return !f.capacity ? tr('أضف المواقع وأسعارها ليُحسب الدخل الممكن.') : tr('أضف المصروفات المتوقعة ليُعرف هل الخطة رابحة.')
  if (h.level === 'risk') return tr('حتى لو بيعت كل المواقع، المصروفات ({0}) أكبر من الدخل الممكن ({1}) بـ {2}. قلّل المصروفات أو ارفع الأسعار أو أضف رعاة.', [formatOMR(h.expenses), formatOMR(h.potential), formatOMR(-h.netFull)])
  if (h.coveredNow && h.margin < THIN_MARGIN_PCT) return tr('العقود الحالية تغطي المصروفات، لكن هامش الربح عند البيع الكامل {0}% فقط — ضعيف.', [h.margin])
  if (h.coveredNow) return tr('العقود الموقعة تغطي المصروفات الآن، والربح الحالي {0}. ولو بيعت كل المواقع يصل الربح إلى {1} (هامش {2}%).', [formatOMR(h.netNow), formatOMR(h.netFull), h.margin])
  return tr('الخطة رابحة لو بيعت المواقع ({0} عند البيع الكامل)، لكن العقود الحالية لا تغطي المصروفات بعد: تحتاج بيع {1} موقع إضافي للوصول لنقطة التعادل.', [formatOMR(h.netFull), h.toSell])
}

/**
 * The plan at a glance: verdict, then «if every site sells» / «signed contracts now» /
 * «break-even» side by side. `f` = exhibitionFinancials() (or the same figures for a period).
 */
export default function PlanHealth({ f, title = 'تقييم الخطة' }) {
  const h = planHealth(f)
  const l = LEVEL[h.level]
  const tone = (v) => (v >= 0 ? 'text-suc' : 'text-dng')
  return (
    <div className={`health-card ${l.cls}`}>
      <div className="health-head">
        <span className="health-icon">{l.icon}</span>
        <div>
          <div className="health-title">
            {tr(title)} — {tr(l.title)}
          </div>
          <div className="health-text">{verdictText(h, f)}</div>
        </div>
      </div>
      <div className="health-cols">
        <div className="health-col">
          <div className="health-col-title">🎯 {tr('لو بيعت كل المواقع')}</div>
          <div className="kv-row"><span>{tr('الدخل الممكن')}</span><strong>{formatOMR(h.potential)}</strong></div>
          <div className="kv-row"><span>{tr('المصروفات')}</span><strong>{formatOMR(h.expenses)}</strong></div>
          <div className="kv-row kv-total"><span>{tr('الصافي')}</span><strong className={tone(h.netFull)}>{formatOMR(h.netFull)}</strong></div>
          <div className="muted tiny">{h.netFull >= 0 ? tr('هامش الربح {0}%', [h.margin]) : tr('خسارة حتى مع البيع الكامل')}</div>
        </div>
        <div className="health-col">
          <div className="health-col-title">📋 {tr('حسب العقود الموقعة الآن')}</div>
          <div className="kv-row"><span>{tr('العقود والرعايات')}</span><strong>{formatOMR(h.current)}</strong></div>
          <div className="kv-row"><span>{tr('المصروفات')}</span><strong>{formatOMR(h.expenses)}</strong></div>
          <div className="kv-row kv-total"><span>{tr('الصافي')}</span><strong className={tone(h.netNow)}>{formatOMR(h.netNow)}</strong></div>
          {f.collected !== undefined && <div className="muted tiny">{tr('المحصّل منها {0}', [formatOMR(f.collected)])}</div>}
        </div>
        <div className="health-col">
          <div className="health-col-title">⚖️ {tr('نقطة التعادل')}</div>
          {h.level === 'missing' ? (
            <div className="muted small">{tr('تُحسب بعد إضافة المواقع والمصروفات')}</div>
          ) : f.breakEven > f.capacity ? (
            <>
              <div className="kv-row"><span>{tr('تحتاج بيع')}</span><strong className="text-dng">{tr('{0} موقع', [f.breakEven])}</strong></div>
              <div className="kv-row"><span>{tr('والمتاح كله')}</span><strong>{tr('{0} موقع', [f.capacity])}</strong></div>
              <div className="tiny text-dng mt-4">{tr('لا يمكن التعادل ببيع المواقع وحده — المصروفات أكبر من طاقة المعرض')}</div>
            </>
          ) : (
            <>
              <div className="kv-row"><span>{tr('تحتاج بيع')}</span><strong>{tr('{0} من {1} موقع', [f.breakEven, f.capacity])}</strong></div>
              <div className="kv-row"><span>{tr('المحجوز الآن')}</span><strong>{tr('{0} موقع', [f.booked])}</strong></div>
              <div className="kv-row kv-total">
                <span>{h.toSell ? tr('باقي') : tr('الوضع')}</span>
                <strong className={h.toSell ? 'text-wrn' : 'text-suc'}>{h.toSell ? tr('{0} موقع', [h.toSell]) : tr('✓ تجاوزناها')}</strong>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
