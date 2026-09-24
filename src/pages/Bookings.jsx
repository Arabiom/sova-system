import { useState } from 'react'
import { acceptBooking, listBookings, rejectBooking } from '../api/bookings.js'
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

const load = async () => {
  const [bookings, exhibitions] = await Promise.all([listBookings(), listExhibitions()])
  return { bookings, exhibitions }
}

const TONES = { 'معلق': 'var(--wrn)', 'مقبول': 'var(--suc)', 'مرفوض': 'var(--dng)' }
const ALL = 'الكل'

function BookingDetails({ booking, exhibition, onClose, onAccept, onReject, busy }) {
  const toast = useToast()
  const rows = [
    ['👤 المسؤول', booking.manager],
    ['📱 الجوال', booking.phone],
    ['📧 البريد', booking.email || '—'],
    ['🏷️ التصنيف', booking.category || '—'],
    ['🏛️ المعرض', exhibitionLabel(exhibition)],
    ['📐 حجم البوث', booking.booth_size || '—'],
    ['💬 الرسالة', booking.message || '—'],
  ]
  return (
    <Overlay onClose={onClose}>
      <div className="modal slide-in" style={{ width: 500 }} role="dialog" aria-modal="true" aria-label={booking.brand}>
        <div className="modal-header modal-header-dark">
          <div>
            <div className="modal-title">{booking.brand}</div>
            <div className="modal-subtitle">طلب حجز • {formatDate(booking.created_at)}</div>
          </div>
          <div className="row-actions">
            <StatusBadge status={booking.status} />
            <button className="icon-btn icon-btn-dark" onClick={onClose} aria-label="إغلاق">
              ✕
            </button>
          </div>
        </div>
        <div className="modal-body">
          {rows.map(([label, value]) => (
            <div key={label} className="detail-row">
              <span className="detail-label">{label}</span>
              <strong className="detail-value">{value}</strong>
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
                toast('📱 فُتح واتساب')
              }}
            >
              📱 تواصل واتساب
            </Button>
          )}
          {booking.status === 'معلق' && (
            <>
              <Button variant="success" onClick={onAccept} disabled={busy}>
                ✅ قبول
              </Button>
              <Button variant="danger" onClick={onReject} disabled={busy}>
                ✗ رفض
              </Button>
            </>
          )}
          <Button variant="outline" onClick={onClose}>
            إغلاق
          </Button>
        </div>
      </div>
    </Overlay>
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

  return (
    <>
      <PageHeader title="طلبات الحجز" subtitle={`${countOf('معلق')} طلب معلق يحتاج مراجعة`}>
        <div className="tabs">
          {[...BOOKING_STATUSES, ALL].map((s) => (
            <button key={s} className={`tab ${filter === s ? 'active' : ''}`} onClick={() => setFilter(s)}>
              {s}
            </button>
          ))}
        </div>
      </PageHeader>

      <div className="grid-3 mb-20">
        {BOOKING_STATUSES.map((s) => (
          <button key={s} className="count-card" style={{ '--accent': TONES[s] }} onClick={() => setFilter(s)}>
            <div className="muted small">{s}</div>
            <div className="count-card-value">{countOf(s)}</div>
          </button>
        ))}
      </div>

      <div className="panel">
        {visible.map((b) => (
          <div key={b.id} className="booking-row" onClick={() => setSelected(b)}>
            <div className="booking-icon">🏪</div>
            <div className="flex-1">
              <div className="booking-brand">{b.brand}</div>
              <div className="muted small">
                {[b.manager, b.phone, b.category, exhibitionLabel(exhibitionOf(b.exhibition_id))].filter(Boolean).join(' • ')}
              </div>
            </div>
            <div className="muted tiny hide-mobile">{formatDate(b.created_at)}</div>
            <StatusBadge status={b.status} />
            <span className="muted small hide-mobile">اضغط للتفاصيل ↗</span>
          </div>
        ))}
        {!visible.length && <EmptyState icon="📬" text="لا توجد طلبات في هذا القسم" />}
      </div>

      {selected && (
        <BookingDetails
          booking={selected}
          exhibition={exhibitionOf(selected.exhibition_id)}
          busy={busy}
          onClose={() => setSelected(null)}
          onAccept={() => accept(selected)}
          onReject={() => reject(selected)}
        />
      )}
    </>
  )
}
