import { useState } from 'react'
import { isPdfPath, mapUrl } from '../api/maps.js'
import { useData } from '../lib/useData.js'
import { Overlay } from './Modal.jsx'

/** The exhibition's map: thumbnail that opens full size (images), or a link (PDF). */
export default function ExhibitionMap({ path, compact = false }) {
  const { data: url, loading } = useData(() => (path ? mapUrl(path).catch(() => '') : Promise.resolve('')), '')
  const [open, setOpen] = useState(false)
  if (!path) return null
  if (loading) return <div className="map-box muted small">جاري تحميل الخارطة...</div>
  if (!url) return <div className="map-box muted small">تعذّر عرض الخارطة</div>

  if (isPdfPath(path)) {
    return (
      <a className="btn btn-outline btn-sm" href={url} target="_blank" rel="noreferrer">
        🗺️ فتح خارطة المعرض (PDF)
      </a>
    )
  }
  return (
    <>
      <button type="button" className={`map-box ${compact ? 'map-box-compact' : ''}`} onClick={() => setOpen(true)} title="عرض الخارطة بالحجم الكامل">
        <img src={url} alt="خارطة المعرض" className="map-img" />
        <span className="map-zoom">🔍 تكبير</span>
      </button>
      {open && (
        <Overlay onClose={() => setOpen(false)}>
          <div className="map-full" onClick={() => setOpen(false)}>
            <img src={url} alt="خارطة المعرض" />
            <a className="btn btn-outline btn-sm" href={url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
              فتح في صفحة جديدة
            </a>
          </div>
        </Overlay>
      )}
    </>
  )
}
