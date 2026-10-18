import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { loadAnalytics } from '../lib/analytics.js'
import { COMPANY } from '../lib/constants.js'
import { askText, SERVICES, SHOW_EVENTS, waLink } from '../lib/contact.js'
import './home.css'

const FROM_SITE = 'موقعكم'
const PHONES = [COMPANY.phone, COMPANY.phone2].filter(Boolean)
const IG = COMPANY.instagram.replace('@', '')

/** Every button press as an analytics event once Google Analytics is set (nothing otherwise). */
const track = (name) => window.gtag?.('event', name, { page: 'home' })

function Star({ className = '' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5" y="5" width="14" height="14" />
      <rect x="5" y="5" width="14" height="14" transform="rotate(45 12 12)" />
    </svg>
  )
}

const ICONS = {
  exhibition: 'M3 21h18M5 21V10l7-5 7 5v11M9 21v-6h6v6',
  booth: 'M4 20V8l8-4 8 4v12M4 8l8 4 8-4M12 12v8',
  rental: 'M3 20 12 4l9 16H3zM12 4v16M8 20l4-6 4 6',
  trips: 'M2 16l20-8-6 12-3-5-5 3 1-5z',
}

/** Upcoming exhibitions from the public list (only when SHOW_EVENTS is on). */
function Events() {
  const [list, setList] = useState([])
  useEffect(() => {
    import('../api/publicBooking.js')
      .then((m) => m.listPublicExhibitions())
      .then(setList)
      .catch(() => setList([]))
  }, [])
  if (!list.length) return null
  const day = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('ar-OM', { day: 'numeric', month: 'long', year: 'numeric' })
  return (
    <section className="h-section h-events" id="events" aria-labelledby="events-title">
      <div className="h-wrap">
        <header className="h-head">
          <p className="h-kicker">Upcoming</p>
          <h2 id="events-title">المعارض القادمة</h2>
        </header>
        <div className="h-event-list">
          {list.map((ex) => {
            const title = ex.name?.trim() || `${COMPANY.brand} ${ex.city || ''}`.trim()
            return (
              <article key={ex.id} className="h-event">
                <h3>{title}</h3>
                <p>{[ex.mall || ex.city, ex.date_from && `${day(ex.date_from)}${ex.date_to && ex.date_to !== ex.date_from ? ` – ${day(ex.date_to)}` : ''}`].filter(Boolean).join(' · ')}</p>
                <Link to="/book" className="h-btn h-btn-line" onClick={() => track('event_book')}>
                  احجز مساحتك
                </Link>
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}

/**
 * The company's official site (the main link): who we are, the four services, how we work and
 * how to reach us. The internal system stays behind «دخول الموظفين».
 */
export default function Home() {
  const { session } = useAuth()
  useEffect(() => {
    document.title = `${COMPANY.name} — تنظيم المعارض وتصميم الأجنحة ورحلات الأعمال`
    loadAnalytics('home')
  }, [])
  const year = new Date().getFullYear()

  return (
    <div className="home" dir="rtl" lang="ar">
      <a className="h-skip" href="#main">
        انتقل إلى المحتوى
      </a>
      <header className="h-bar">
        <div className="h-wrap h-bar-in">
          <a href="#top" className="h-brand" aria-label={COMPANY.name}>
            <img src={COMPANY.logoLight} alt={`${COMPANY.name} — ${COMPANY.nameEn}`} width="150" height="28" />
          </a>
          <nav className="h-nav" aria-label="أقسام الموقع">
            <a href="#services">خدماتنا</a>
            <a href="#how">كيف نعمل</a>
            {SHOW_EVENTS && <a href="#events">المعارض القادمة</a>}
            <a href="#contact">تواصل معنا</a>
          </nav>
          <div className="h-bar-actions">
            <Link to="/dashboard" className="h-staff">
              {session ? 'لوحة التحكم' : 'دخول الموظفين'}
            </Link>
            <a className="h-btn h-btn-main h-btn-sm" href={waLink(askText(FROM_SITE))} target="_blank" rel="noopener noreferrer" onClick={() => track('whatsapp_top')}>
              واتساب
            </a>
          </div>
        </div>
      </header>

      <main id="main">
        <section className="h-hero" id="top">
          <Star className="h-hero-star" />
          <div className="h-wrap h-hero-in">
            <p className="h-kicker">Axis Integrated Business · Muscat, Oman</p>
            <h1>
              من الفكرة
              <br />
              <span>إلى الافتتاح</span>
            </h1>
            <p className="h-lead">
              {COMPANY.name} شركة عُمانية مقرها مسقط، متخصصة في تنظيم المعارض التجارية، وتصميم الأجنحة وتنفيذها، وتأجير الخيام والتجهيزات، ورحلات الأعمال إلى تركيا ومصر والهند.
            </p>
            <div className="h-hero-actions">
              <a className="h-btn h-btn-main" href={waLink(askText(FROM_SITE))} target="_blank" rel="noopener noreferrer" onClick={() => track('whatsapp_hero')}>
                تواصل معنا على الواتساب
              </a>
              <Link className="h-btn h-btn-ghost" to="/book" onClick={() => track('inquiry_hero')}>
                أرسل استفسارك
              </Link>
            </div>
          </div>
        </section>

        <section className="h-section" id="services" aria-labelledby="services-title">
          <div className="h-wrap">
            <header className="h-head">
              <p className="h-kicker">Our services</p>
              <h2 id="services-title">خدماتنا</h2>
              <p className="h-sub">أربع خدمات تكمّل بعضها، لتبدأ مشروعك معنا وتنهيه معنا.</p>
            </header>
            <div className="h-services">
              {SERVICES.map((x) => (
                <article key={x.id} className="h-service">
                  <span className="h-service-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <path d={ICONS[x.id]} />
                    </svg>
                  </span>
                  <h3>{x.title}</h3>
                  <p className="h-en">{x.en}</p>
                  <p>{x.text}</p>
                  <a className="h-link" href={waLink(askText(FROM_SITE, x.topic))} target="_blank" rel="noopener noreferrer" onClick={() => track(`service_${x.id}`)}>
                    اسأل عن هذه الخدمة ←
                  </a>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="h-section h-how" id="how" aria-labelledby="how-title">
          <div className="h-wrap">
            <header className="h-head">
              <p className="h-kicker">How we work</p>
              <h2 id="how-title">كيف نعمل</h2>
            </header>
            <ol className="h-steps">
              <li>
                <h3>نسمع فكرتك</h3>
                <p>تواصل معنا على الواتساب أو أرسل استفسارك، ونتفق على ما تحتاجه.</p>
              </li>
              <li>
                <h3>نخطط ونصمّم</h3>
                <p>نضع الخطة، ونصمّم الجناح تصميماً ثلاثي الأبعاد تراه وتعتمده قبل التنفيذ.</p>
              </li>
              <li>
                <h3>ننفّذ ونجهّز</h3>
                <p>نجهّز المكان والتجهيزات ونركّب الجناح في موقعه.</p>
              </li>
              <li>
                <h3>نفتتح معك</h3>
                <p>نتابع معك كل التفاصيل حتى يوم الافتتاح.</p>
              </li>
            </ol>
          </div>
        </section>

        {SHOW_EVENTS && <Events />}

        <section className="h-section h-contact" id="contact" aria-labelledby="contact-title">
          <div className="h-wrap h-contact-in">
            <div>
              <p className="h-kicker">Get in touch</p>
              <h2 id="contact-title">لنبدأ مشروعك</h2>
              <p className="h-sub">للأسعار والتفاصيل تواصل معنا مباشرة، أو أرسل بياناتك ونتصل بك.</p>
              <div className="h-hero-actions">
                <a className="h-btn h-btn-main" href={waLink(askText(FROM_SITE))} target="_blank" rel="noopener noreferrer" onClick={() => track('whatsapp_contact')}>
                  تواصل معنا على الواتساب
                </a>
                <Link className="h-btn h-btn-line" to="/book" onClick={() => track('inquiry_contact')}>
                  أرسل استفسارك
                </Link>
              </div>
            </div>
            <ul className="h-cards">
              {PHONES.map((p) => (
                <li key={p}>
                  <span>اتصال</span>
                  <a href={`tel:+968${p}`} dir="ltr" onClick={() => track('call')}>
                    +968 {p}
                  </a>
                </li>
              ))}
              <li>
                <span>البريد</span>
                <a href={`mailto:${COMPANY.email}`} dir="ltr" onClick={() => track('email')}>
                  {COMPANY.email}
                </a>
              </li>
              <li>
                <span>إنستغرام</span>
                <a href={`https://www.instagram.com/${IG}/`} target="_blank" rel="noopener noreferrer" dir="ltr" onClick={() => track('instagram')}>
                  {COMPANY.instagram}
                </a>
              </li>
              <li>
                <span>الموقع</span>
                <span className="h-card-v">مسقط، سلطنة عُمان</span>
              </li>
            </ul>
          </div>
        </section>
      </main>

      <footer className="h-foot">
        <div className="h-wrap h-foot-in">
          <div>
            <Star className="h-foot-star" />
            <p>{COMPANY.legalName}</p>
            <p className="h-foot-muted" dir="ltr">
              {COMPANY.nameEn} · {COMPANY.cr}
            </p>
          </div>
          <div className="h-foot-links">
            <Link to="/book">الحجز والاستفسار</Link>
            <a href={`https://www.instagram.com/${IG}/`} target="_blank" rel="noopener noreferrer">
              إنستغرام
            </a>
            <Link to="/dashboard">{session ? 'لوحة التحكم' : 'دخول الموظفين'}</Link>
          </div>
          <p className="h-foot-muted">© {year} {COMPANY.name}</p>
        </div>
      </footer>
    </div>
  )
}
