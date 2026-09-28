import { useEffect, useRef, useState } from 'react'
import { logMessage } from '../api/whatsapp.js'
import { normalizePhone, openChat } from '../lib/whatsapp.js'
import Button from './Button.jsx'
import Modal from './Modal.jsx'
import { WhatsAppText } from './WhatsAppText.jsx'

/**
 * Send a prepared list one chat at a time. Each chat opens straight from a click (or Enter),
 * so the browser never blocks it, and the queue moves on to the next number by itself.
 * `items`: [{ recipient, text }].
 */
export default function WhatsAppQueue({ items, mode, campaign, onClose }) {
  const [index, setIndex] = useState(0)
  const [status, setStatus] = useState(() => items.map(() => '')) // '' | 'sent' | 'skipped'
  const [logFailed, setLogFailed] = useState(false)
  const sendRef = useRef(null)

  const done = index >= items.length
  const current = items[index]
  const sent = status.filter((s) => s === 'sent').length
  const skipped = status.filter((s) => s === 'skipped').length

  const mark = (i, value) => setStatus((s) => s.map((x, j) => (j === i ? value : x)))
  const next = () => setIndex((i) => Math.min(items.length, i + 1))

  const send = () => {
    if (!current) return
    openChat(current.recipient.phone, current.text, mode)
    mark(index, 'sent')
    logMessage({
      campaignId: campaign.id,
      campaignName: campaign.name,
      source: current.recipient.source,
      recordId: current.recipient.id,
      name: current.recipient.brand || current.recipient.name,
      phone: normalizePhone(current.recipient.phone),
      body: current.text,
    }).then((ok) => !ok && setLogFailed(true))
    next()
  }
  useEffect(() => {
    sendRef.current = send
  })

  // Enter sends the current message, so a long list goes quickly from the keyboard.
  useEffect(() => {
    const onKey = (e) => {
      // Also when a queue button has focus: Enter always means "open the next chat".
      if (e.key === 'Enter' && !e.shiftKey && !e.target.closest?.('textarea,input,select')) {
        e.preventDefault()
        sendRef.current?.()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const pct = Math.round(((sent + skipped) / items.length) * 100)

  return (
    <Modal
      title="📱 إرسال الرسائل"
      subtitle={`${campaign.name} • ${items.length} رقم`}
      onClose={onClose}
      size="lg"
      footer={
        done ? (
          <Button onClick={onClose}>تم ✓</Button>
        ) : (
          <>
            <Button variant="outline" onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0}>
              → السابق
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                mark(index, status[index] || 'skipped')
                next()
              }}
            >
              تخطي ←
            </Button>
            <Button variant="whatsapp" size="lg" onClick={send}>
              📱 افتح المحادثة ({index + 1}/{items.length})
            </Button>
          </>
        )
      }
    >
      <div className="wa-progress">
        <div className="wa-progress-bar" style={{ width: `${pct}%` }} />
      </div>
      <div className="wa-progress-meta">
        <span>✅ أُرسل {sent}</span>
        {skipped > 0 && <span>⏭️ تُخطّي {skipped}</span>}
        <span>⏳ متبقٍ {items.length - sent - skipped}</span>
      </div>

      {done ? (
        <div className="wa-done">
          <div className="wa-done-icon">🎉</div>
          <div className="strong">انتهت القائمة</div>
          <div className="muted small">
            فُتحت {sent} محادثة{skipped ? `، وتُخطّي ${skipped}` : ''}. تأكد أنك ضغطت «إرسال» داخل واتساب في كل محادثة.
          </div>
        </div>
      ) : (
        <div className="wa-queue-current">
          <div className="wa-queue-who">
            <div>
              <div className="strong">{current.recipient.brand || current.recipient.name || 'بدون اسم'}</div>
              <div className="muted tiny" dir="ltr">
                +{normalizePhone(current.recipient.phone)}
              </div>
            </div>
            {status[index] === 'sent' && <span className="badge badge-success">فُتحت سابقاً</span>}
          </div>
          <div className="wa-chat">
            <div className="wa-bubble">
              <WhatsAppText text={current.text} />
            </div>
          </div>
        </div>
      )}

      <div className="wa-queue-list">
        {items.map((item, i) => (
          <button key={item.recipient.key} className={`wa-queue-item ${i === index ? 'active' : ''} ${status[i]}`} onClick={() => setIndex(i)}>
            <span>{status[i] === 'sent' ? '✅' : status[i] === 'skipped' ? '⏭️' : i + 1}</span>
            <span className="ellipsis">{item.recipient.brand || item.recipient.name || item.recipient.phone}</span>
          </button>
        ))}
      </div>

      <div className="muted tiny center mt-10">
        اضغط الزر (أو Enter) لفتح المحادثة والرسالة جاهزة، ثم اضغط «إرسال» في واتساب وارجع هنا — تنتقل القائمة للرقم التالي تلقائياً.
      </div>
      {logFailed && <div className="tiny text-dng center mt-10">لم يُحفظ السجل — شغّل تحديث 015 في Supabase. الرسائل نفسها تُفتح عادي.</div>}
    </Modal>
  )
}
