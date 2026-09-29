import { useState } from 'react'
import { useCan } from '../context/AuthContext.jsx'
import { acceptBooking, isInquiry, listBookings, markInquiryAnswered, rejectBooking } from '../api/bookings.js'
import { publicBookingUrl } from '../api/publicBooking.js'
import Panel from '../components/Panel.jsx'
import { COMPANY } from '../lib/constants.js'
import { listExhibitions } from '../api/exhibitions.js'
import Button from '../components/Button.jsx'
import { EmptyState, Loading } from '../components/Feedback.jsx'
import { Overlay } from '../components/Modal.jsx'
import PageHeader from '../components/PageHeader.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { BOOKING_STATUSES } from '../lib/constants.js'
import { exhibitionLabel, formatDate } from '../lib/format.js'
import { useData } from '../lib/useData.js'
import { openWhatsApp, welcomeMessage, whatsappUrl } from '../lib/whatsapp.js'
import { tr } from '../lib/i18n.js'

const load = async () => {
  const [bookings, exhibitions] = await Promise.all([listBookings(), listExhibitions()])
  return { bookings, exhibitions }
}

const TONES = { 'معلق': 'var(--wrn)', 'مقبول': 'var(--suc)', 'مرفوض': 'var(--dng)' }
const ALL = 'الكل'

function BookingDetails({ booking, exhibition, onClose, onAccept, onReject, onAnswered, busy }) {
  const toast = useToast()
  const canWrite = useCan('data.write') // the viewer only looks
  const inquiry = isInquiry(booking)
  const rows = [
    ['👤 المسؤول', booking.manager],
    ['📱 الجوال', booking.phone],
    ['📧 البريد', booking.email || '—'],
    ['🏷️ التصنيف', booking.category || '—'],
    ['🏛️ المعرض', exhibitionLabel(exhibition)],
    [inquiry ? '📐 الباقة' : '📐 حجم البوث / الباقة', booking.booth_size || '—'],
    ['💬 الرسالة', booking.message || '—'],
  ]
  return (
    <Overlay onClose={onClose}>
      <div className="modal slide-in" style={{ width: 500 }} role="dialog" aria-modal="true" aria-label={booking.brand}>
        <div className="modal-header modal-header-dark">
          <div>
            <div className="modal-title">{tr(booking.brand)}</div>
            <div className="modal-subtitle">{inquiry ? tr('استفسار •') : tr('طلب حجز •')}{' '}{formatDate(booking.created_at)}</div>
          </div>
          <div className="row-actions">
            <StatusBadge status={booking.status} />
            <button className="icon-btn icon-btn-dark" onClick={onClose} aria-label={tr('إغلاق')}>
              ✕
            </button>
          </div>
        </div>
        <div className="modal-body">
          {rows.map(([label, value]) => (
            <div key={label} className="detail-row">
              <span className="detail-label">{tr(label)}</span>
              <strong className="detail-value">{tr(value)}</strong>
            </div>
          ))}
        </div>
        <div className="modal-footer">
          {booking.phone && (
            <Button
              variant="whatsapp"
              className="flex-1"
              onClick={() => {
                openWhatsApp(booking.phone, welcomeMessage(booking, exhibition))
                toast(tr('📱 فُتح واتساب'))
              }}
            >
              {tr('📱 تواصل واتساب')}
            </Button>
          )}
          {canWrite && booking.status === 'معلق' && inquiry && (
            <Button variant="success" onClick={onAnswered} disabled={busy}>
              {tr('✅ تم الرد')}
            </Button>
          )}
          {canWrite && booking.status === 'معلق' && !inquiry && (
            <>
              <Button variant="success" onClick={onAccept} disabled={busy}>
                {tr('✅ قبول')}
              </Button>
              <Button variant="danger" onClick={onReject} disabled={busy}>
                {tr('✗ رفض')}
              </Button>
            </>
          )}
          <Button variant="outline" onClick={onClose}>
            {tr('إغلاق')}
          </Button>
        </div>
      </div>
    </Overlay>
  )
}

/** The public link (/book) to share: requests sent from it land here as pending. */
function PublicLinkPanel() {
  const toast = useToast()
  const url = publicBookingUrl()
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      toast(tr('🔗 تم نسخ الرابط'))
    } catch {
      toast(tr('تعذّر النسخ — انسخ الرابط يدوياً'), 'error')
    }
  }
  const share = tr('للحجز في معارض {0} أو التواصل معنا: {1}', [COMPANY.brand, url])
  return (
    <Panel icon="link" title={tr('رابط الحجز العام')} subtitle={tr('انشره في إنستقرام وواتساب: أي شخص يرسل منه طلب حجز أو استفسار بدون حساب، ويظهر هنا مباشرة.')} className="mb-20" bodyClass="panel-pad">
      <div className="share-link">
        <code dir="ltr">{url}</code>
        <Button variant="outline" onClick={copy}>
          {tr('📋 نسخ الرابط')}
        </Button>
        <Button variant="whatsapp" onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(share)}`, '_blank', 'noopener')}>
          {tr('📱 مشاركة واتساب')}
        </Button>
        <Button variant="outline" onClick={() => window.open(url, '_blank', 'noopener')}>
          {tr('↗ فتح الصفحة')}
        </Button>
      </div>
    </Panel>
  )
}

export default function Bookings() {
  const toast = useToast()
  const { data, loading, reload } = useData(load, null)
  const [filter, setFilter] = useState('معلق')
  const [selected, setSelected] = useState(null)
  const [busy, setBusy] = useState(false)

  if (loading || !data) return <Loading />
  const { bookings, exhibitions } = data
  const exhibitionOf = (id) => exhibitions.find((ex) => ex.id === id)
  const countOf = (status) => bookings.filter((b) => b.status === status).length
  const visible = filter === ALL ? bookings : bookings.filter((b) => b.status === filter)

  const run = async (action, message) => {
    setBusy(true)
    try {
      await action()
      toast(message)
      setSelected(null)
      reload()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const accept = (booking) => {
    // Open the WhatsApp tab now, while we are still inside the click, so popup blockers allow it;
    // it is pointed at the welcome message once the booking has been accepted.
    const tab = booking.phone ? window.open('', '_blank') : null
    return run(async () => {
      try {
        await acceptBooking(booking)
      } catch (err) {
        tab?.close()
        throw err
      }
      if (tab) tab.location.href = whatsappUrl(booking.phone, welcomeMessage(booking, exhibitionOf(booking.exhibition_id)))
    }, '✅ تم القبول وإضافة العارض')
  }

  const reject = (booking) => run(() => rejectBooking(booking.id), '✗ تم الرفض')
  const answered = (booking) => run(() => markInquiryAnswered(booking.id), '✅ تم تسجيل الرد على الاستفسار')

  return (
    <>
      <PageHeader title={tr('طلبات الحجز')} subtitle={tr('{0} طلب معلق يحتاج مراجعة', [countOf('معلق')])}>
        <div className="tabs">
          {[...BOOKING_STATUSES, ALL].map((s) => (
            <button key={s} className={`tab ${filter === s ? 'active' : ''}`} onClick={() => setFilter(s)}>
              {tr(s)}
            </button>
          ))}
        </div>
      </PageHeader>

      <PublicLinkPanel />

      <div className="grid-3 mb-20">
        {BOOKING_STATUSES.map((s) => (
          <button key={s} className="count-card" style={{ '--accent': TONES[s] }} onClick={() => setFilter(s)}>
            <div className="muted small">{tr(s)}</div>
            <div className="count-card-value">{countOf(s)}</div>
          </button>
        ))}
      </div>

      <div className="panel">
        {visible.map((b) => (
          <div key={b.id} className="booking-row" onClick={() => setSelected(b)}>
            <div className="booking-icon">{isInquiry(b) ? '💬' : '🏪'}</div>
            <div className="flex-1">
              <div className="booking-brand">
                {tr(b.brand)} {isInquiry(b) && <span className="badge badge-info">{tr('استفسار')}</span>}
              </div>
              <div className="muted small">
                {[b.manager, b.phone, b.category, b.exhibition_id && exhibitionLabel(exhibitionOf(b.exhibition_id))].filter(Boolean).join(' • ')}
              </div>
            </div>
            <div className="muted tiny hide-mobile">{formatDate(b.created_at)}</div>
            <StatusBadge status={b.status} />
            <span className="muted small hide-mobile">{tr('اضغط للتفاصيل ↗')}</span>
          </div>
        ))}
        {!visible.length && <EmptyState icon="📬" text={tr('لا توجد طلبات في هذا القسم')} />}
      </div>

      {selected && (
        <BookingDetails
          booking={selected}
          exhibition={exhibitionOf(selected.exhibition_id)}
          busy={busy}
          onClose={() => setSelected(null)}
          onAccept={() => accept(selected)}
          onReject={() => reject(selected)}
          onAnswered={() => answered(selected)}
        />
      )}
    </>
  )
}
