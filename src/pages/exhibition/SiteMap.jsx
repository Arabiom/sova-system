import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { placeSite, setSiteTier } from '../../api/exhibitionFile.js'
import { mapUrl } from '../../api/maps.js'
import Button from '../../components/Button.jsx'
import Panel from '../../components/Panel.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { COMPANY } from '../../lib/constants.js'
import { formatOMR, num } from '../../lib/format.js'
import { tr } from '../../lib/i18n.js'
import { alignPositions, cellSize, siteStatus, tiersFromSites } from '../../lib/sites.js'
import { useData } from '../../lib/useData.js'
import { openWhatsApp } from '../../lib/whatsapp.js'

const STATUSES = ['متاح', 'محجوز', 'مدفوع جزئياً', 'مدفوع']
const FILTERS = [
  ['all', 'الكل'],
  ['free', 'المتاح فقط'],
  ['taken', 'المحجوز فقط'],
]
const ZOOMS = [1, 1.5, 2, 3]
const cls = (status) => `pin-${status.replace(/\s/g, '-')}`

/** What a pinned site shows on hover / tap: the site, and who booked it. */
function PinCard({ site, holder, status, money, canBook, tiers, onTier, onBook, onRegister, onClose }) {
  const flipX = site.map_x > 55
  const flipY = site.map_y > 62
  const remaining = holder ? Math.max(0, num(holder.contract) - num(holder.paid)) : 0
  // On a phone it opens as a bottom sheet, outside the page (whose animation would trap it).
  const sheet = window.matchMedia?.('(max-width: 600px)').matches
  const card = (
    <div className={`pin-card ${flipX ? 'flip-x' : ''} ${flipY ? 'flip-y' : ''}`} style={sheet ? undefined : { left: `${site.map_x}%`, top: `${site.map_y}%` }} onClick={(e) => e.stopPropagation()}>
      <div className="pin-card-head">
        <strong>{tr('الموقع {0}', [site.number])}</strong>
        <span className={`pin-chip ${cls(status)}`}>{tr(status)}</span>
        <button type="button" className="pin-card-x" onClick={onClose} aria-label={tr('إغلاق')}>
          ✕
        </button>
      </div>
      {onTier ? (
        <label className="pin-tier">
          <span className="muted small">{tr('فئة الموقع وسعره')}</span>
          <select className="input input-compact" value={`${site.tier}|${Number(site.price)}`} onChange={(e) => onTier(tiers.find((t) => `${t.name}|${t.price}` === e.target.value))}>
            {tiers.map((t) => (
              <option key={`${t.name}|${t.price}`} value={`${t.name}|${t.price}`}>
                {tr(t.name)} — {formatOMR(t.price)}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <div className="muted small">
          {tr(site.tier)} • {formatOMR(site.price)}
        </div>
      )}
      {holder ? (
        <div className="pin-card-rows">
          <div><span>{tr('المشارك')}</span><strong>{tr(holder.brand)}</strong></div>
          {holder.manager && <div><span>{tr('المسؤول')}</span><strong>{tr(holder.manager)}</strong></div>}
          {holder.phone && <div><span>{tr('الجوال')}</span><strong dir="ltr">{holder.phone}</strong></div>}
          {holder.category && <div><span>{tr('النشاط')}</span><strong>{tr(holder.category)}</strong></div>}
          <div><span>{tr('حالة العقد')}</span><strong>{tr(holder.status || '—')}</strong></div>
          {holder.booth && holder.booth !== '—' && <div><span>{tr('مواقعه')}</span><strong>{holder.booth}</strong></div>}
          {money && (
            <>
              <div><span>{tr('قيمة العقد')}</span><strong>{formatOMR(holder.contract)}</strong></div>
              <div><span>{tr('المدفوع')}</span><strong>{formatOMR(holder.paid)}</strong></div>
              <div><span>{tr('المتبقي')}</span><strong className={remaining > 0 ? 'text-dng' : ''}>{formatOMR(remaining)}</strong></div>
            </>
          )}
        </div>
      ) : (
        <div className="pin-card-free">{tr('هذا الموقع متاح للحجز')}</div>
      )}
      <div className="pin-card-actions">
        {canBook && !holder && (
          <Button size="sm" icon="✚" onClick={onRegister}>
            {tr('تسجيل مشارك جديد هنا')}
          </Button>
        )}
        {canBook && (
          <Button size="sm" variant={holder ? 'primary' : 'outline'} onClick={onBook}>
            {holder ? tr('✏️ تعديل الحجز') : tr('+ حجز لمشارك مسجّل')}
          </Button>
        )}
        {holder?.phone && (
          <Button size="sm" variant="whatsapp" onClick={() => openWhatsApp(holder.phone, '')}>
            {tr('📱 واتساب')}
          </Button>
        )}
      </div>
    </div>
  )
  return sheet ? createPortal(card, document.body) : card
}

/**
 * The exhibition's own map image with every site pinned on it, like seats in a cinema: the
 * colour says whether it is free or booked, and pointing at a site shows who booked it.
 * Managers pin the sites once ("تحديد المواقع على الخارطة"): pick a site, click its place.
 */
export default function SiteMap({ path, sites, exhibitors, canManage, canWrite, money, onBook, onChanged }) {
  const toast = useToast()
  const navigate = useNavigate()
  const { data: url, loading } = useData(() => mapUrl(path).catch(() => ''), '')
  const imgRef = useRef(null)
  const [moved, setMoved] = useState({}) // siteId → { x, y } | null, saved but not reloaded yet
  const [active, setActive] = useState(null) // { id, pinned }
  const [filter, setFilter] = useState('all')
  const [zoom, setZoom] = useState(1)
  const [placing, setPlacing] = useState(false)
  const [picked, setPicked] = useState(null)
  const [aligning, setAligning] = useState(false)

  const byId = new Map(exhibitors.map((e) => [e.id, e]))
  const all = sites.map((s) => {
    const pos = s.id in moved ? moved[s.id] : s.map_x != null && s.map_y != null ? { x: num(s.map_x), y: num(s.map_y) } : null
    const holder = byId.get(s.exhibitor_id) || null
    return { ...s, map_x: pos?.x ?? null, map_y: pos?.y ?? null, holder, status: siteStatus(s, holder) }
  })
  const placed = all.filter((s) => s.map_x != null)
  const unplaced = all.filter((s) => s.map_x == null)
  const counts = Object.fromEntries(STATUSES.map((st) => [st, all.filter((s) => s.status === st).length]))
  const free = counts['متاح']
  const shown = (s) => filter === 'all' || (filter === 'free' ? s.status === 'متاح' : s.status !== 'متاح')
  const current = active && all.find((s) => s.id === active.id && s.map_x != null)
  // Each site covers its cell on the map: sized from the spacing of the placed rows and columns.
  const cell = cellSize(placed.map((s) => ({ x: s.map_x, y: s.map_y })))

  const startPlacing = () => {
    setPlacing(true)
    setActive(null)
    setPicked(unplaced[0]?.id || all[0]?.id || null)
  }
  const stopPlacing = () => {
    setPlacing(false)
    setPicked(null)
    if (Object.keys(moved).length) onChanged()
  }

  const save = async (site, pos) => {
    setMoved((m) => ({ ...m, [site.id]: pos }))
    try {
      await placeSite(site.id, pos)
    } catch (err) {
      setMoved((m) => {
        const next = { ...m }
        delete next[site.id]
        return next
      })
      toast(err.message, 'error')
    }
  }

  const tiers = tiersFromSites(sites)
  /** Give one site another tier (its name and price), straight from its card on the map. */
  const changeTier = async (site, tier) => {
    if (!tier) return
    if (site.exhibitor_id && !confirm(tr('الموقع {0} محجوز. تغيير سعره لا يغيّر قيمة عقد صاحبه. متابعة؟', [site.number]))) return
    try {
      await setSiteTier(site.id, tier)
      toast(tr('✅ الموقع {0} أصبح «{1}» بسعر {2}', [site.number, tier.name, formatOMR(tier.price)]))
      onChanged()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  /** Snap every placed site to its row and column, so they sit in a neat grid. */
  const align = async () => {
    const moves = alignPositions(placed.map((s) => ({ id: s.id, x: s.map_x, y: s.map_y })))
    if (!moves.length) return toast(tr('المواقع مرتبة بالفعل ✔'))
    setAligning(true)
    setMoved((m) => ({ ...m, ...Object.fromEntries(moves.map((p) => [p.id, { x: p.x, y: p.y }])) }))
    try {
      await Promise.all(moves.map((p) => placeSite(p.id, { x: p.x, y: p.y })))
      toast(tr('✅ تمت محاذاة {0} موقع في صفوف وأعمدة', [moves.length]))
      if (!placing) onChanged()
    } catch (err) {
      toast(err.message, 'error')
      onChanged()
    } finally {
      setAligning(false)
    }
  }

  const clickMap = (e) => {
    if (!placing) return setActive(null)
    const site = all.find((s) => s.id === picked)
    if (!site) return toast(tr('اختر رقم الموقع أولاً من القائمة'), 'error')
    const box = imgRef.current.getBoundingClientRect()
    const x = Math.min(100, Math.max(0, ((e.clientX - box.left) / box.width) * 100))
    const y = Math.min(100, Math.max(0, ((e.clientY - box.top) / box.height) * 100))
    save(site, { x, y })
    // Next site without a place, in number order after this one.
    const after = all.filter((s) => s.map_x == null && s.id !== site.id)
    const next = after.find((s) => s.number > site.number) || after[0]
    setPicked(next?.id || null)
  }

  const clickPin = (e, site) => {
    e.stopPropagation()
    if (placing) return setPicked(site.id)
    setActive((a) => (a?.id === site.id && a.pinned ? null : { id: site.id, pinned: true }))
  }

  if (loading) return <Panel bodyClass="panel-pad"><div className="muted small">{tr('جاري تحميل الخارطة...')}</div></Panel>
  if (!url) return <Panel bodyClass="panel-pad"><div className="muted small">{tr('تعذّر عرض الخارطة')}</div></Panel>

  const pickedSite = all.find((s) => s.id === picked)

  return (
    <Panel
      icon="🗺️"
      title={tr('خارطة المعرض التفاعلية')}
      subtitle={
        placed.length
          ? tr('{0} متاح من {1} • مرّر المؤشر أو اضغط على أي موقع لعرض بيانات الحجز', [free, sites.length])
          : tr('لم تُحدَّد المواقع على الخارطة بعد')
      }
      className="mb-16"
      action={
        canManage &&
        (
          <div className="row-actions">
            {placed.length > 1 && (
              <Button size="sm" variant="outline" onClick={align} disabled={aligning}>
                {aligning ? tr('جاري...') : tr('⊞ محاذاة المواقع')}
              </Button>
            )}
            {placing ? (
              <Button size="sm" onClick={stopPlacing}>
                {tr('✅ تم')}
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={startPlacing}>
                {placed.length ? tr('📍 تعديل أماكن المواقع') : tr('📍 تحديد المواقع على الخارطة')}
              </Button>
            )}
          </div>
        )
      }
      bodyClass="panel-pad"
    >
      {placing ? (
        <div className="place-bar">
          <div className="small mb-8">
            {pickedSite
              ? tr('اضغط على مكان الموقع {0} في الخارطة. بعدها ينتقل تلقائياً للموقع التالي.', [pickedSite.number])
              : tr('كل المواقع محددة على الخارطة ✔ — اختر أي رقم لتعديل مكانه.')}{' '}
            <span className="muted">{tr('({0} محدد من {1})', [placed.length, sites.length])}</span>
          </div>
          <div className="place-chips">
            {all.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`place-chip ${s.map_x != null ? 'done' : ''} ${picked === s.id ? 'active' : ''}`}
                onClick={() => setPicked(s.id)}
              >
                {s.number}
              </button>
            ))}
          </div>
          {pickedSite?.map_x != null && (
            <Button size="sm" variant="outline" onClick={() => save(pickedSite, null)}>
              {tr('إزالة الموقع {0} من الخارطة', [pickedSite.number])}
            </Button>
          )}
        </div>
      ) : (
        <div className="sitemap-toolbar">
          <div className="sitemap-legend">
            {STATUSES.map((st) => (
              <span key={st} className="sitemap-legend-item">
                <i className={`pin-swatch ${cls(st)} ${st === 'متاح' ? '' : 'pin-swatch-logo'}`}>{st === 'متاح' ? null : <img src={COMPANY.mark} alt="" />}</i>
                {tr(st)} <strong>{counts[st]}</strong>
              </span>
            ))}
          </div>
          <div className="tabs tabs-sm">
            {FILTERS.map(([id, label]) => (
              <button key={id} type="button" className={`tab ${filter === id ? 'active' : ''}`} onClick={() => setFilter(id)}>
                {tr(label)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="sitemap-zoom">
        {ZOOMS.map((z) => (
          <button key={z} type="button" className={`tab ${zoom === z ? 'active' : ''}`} onClick={() => setZoom(z)}>
            {z === 1 ? tr('حجم الشاشة') : `×${z}`}
          </button>
        ))}
      </div>

      <div className="sitemap-scroll">
        <div className={`sitemap ${placing ? 'placing' : ''}`} onClick={clickMap}>
          {/* Fit the screen at ×1 (whole map visible); larger zooms scroll inside the frame. */}
          <img ref={imgRef} src={url} alt={tr('خارطة المعرض')} draggable={false} style={zoom === 1 ? undefined : { height: `${zoom * 72}vh`, maxWidth: 'none', maxHeight: 'none' }} />
          {placed.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`pin ${cls(s.status)} ${placing ? 'pin-num' : s.status === 'متاح' ? 'pin-free' : 'pin-logo'} ${shown(s) ? '' : 'dim'} ${picked === s.id ? 'picked' : ''} ${current?.id === s.id ? 'active' : ''}`}
              style={{ left: `${s.map_x}%`, top: `${s.map_y}%`, ...(cell && !placing ? { width: `${cell.w}%`, height: `${cell.h}%`, aspectRatio: 'auto' } : {}) }}
              onClick={(e) => clickPin(e, s)}
              onMouseEnter={() => !placing && setActive((a) => (a?.pinned ? a : { id: s.id, pinned: false }))}
              onMouseLeave={() => setActive((a) => (a && !a.pinned ? null : a))}
              aria-label={tr('الموقع {0} — {1}', [s.number, tr(s.status)])}
            >
              {/* Booked sites show the company logo over their cell; free ones leave the map's number visible. */}
              {placing ? s.number : s.status === 'متاح' ? null : <img src={COMPANY.mark} alt="" draggable={false} />}
            </button>
          ))}
          {!placing && current && (
            <PinCard
              site={current}
              holder={current.holder}
              status={current.status}
              money={money}
              canBook={canWrite}
              tiers={tiers}
              onTier={canManage && tiers.length > 1 ? (t) => changeTier(current, t) : null}
              onBook={() => {
                setActive(null)
                onBook(current)
              }}
              onRegister={() => navigate(`/register?exhibition=${current.exhibition_id}&site=${current.id}`)}
              onClose={() => setActive(null)}
            />
          )}
        </div>
      </div>

      {!placing && !placed.length && canManage && (
        <div className="alert alert-info mt-12">{tr('اضغط «تحديد المواقع على الخارطة»، ثم اضغط على مكان كل رقم في الصورة مرة واحدة فقط. بعدها يظهر كل موقع ملوّناً حسب حالته.')}</div>
      )}
    </Panel>
  )
}
