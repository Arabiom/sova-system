import { Fragment, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { loadAnalytics } from '../lib/analytics.js'
import { COMPANY } from '../lib/constants.js'
import { askText, SERVICES, SHOW_EVENTS, waLink } from '../lib/contact.js'
import { isEnglish, setLang } from '../lib/i18n.js'
import './home.css'

const FROM_SITE = 'موقعكم'
const PHONES = [COMPANY.phone, COMPANY.phone2].filter(Boolean)
const IG = COMPANY.instagram.replace('@', '')
const IMG = `${import.meta.env.BASE_URL}site/`

/** The page in Arabic, or in English when the visitor chose it (the same switch as the system). */
const t = (ar, en) => (isEnglish() ? en : ar)

/** Every button press as an analytics event once Google Analytics is set (nothing otherwise). */
const track = (name) => window.gtag?.('event', name, { page: 'home' })

/** The brand's small eight-point star. */
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
  whole: 'M4 12l5 5L20 6',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  seal: 'M12 3l2.5 2 3.2-.3.7 3.1 2.6 1.9-1.3 2.9 1.3 2.9-2.6 1.9-.7 3.1-3.2-.3L12 21l-2.5-2-3.2.3-.7-3.1L3 14.3l1.3-2.9L3 8.5l2.6-1.9.7-3.1 3.2.3z',
  arrow: 'M19 12H5M11 6l-6 6 6 6',
}

function Glyph({ d }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}

const WA_ICON =
  'M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.2.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.2c.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3z'

function WaIcon() {
  return (
    <svg className="h-wa-ico" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d={WA_ICON} />
    </svg>
  )
}

/** What sets us apart — only what is true of how we work. */
const WHY = [
  {
    icon: 'whole',
    title: ['خدمة متكاملة تحت سقف واحد', 'Everything under one roof'],
    text: ['من تنظيم المعرض وتصميم جناحك إلى تجهيزاته — جهة واحدة تتابع معك كل شيء.', 'From organising the exhibition and designing your booth to its equipment — one team follows everything with you.'],
  },
  {
    icon: 'eye',
    title: ['ترى جناحك قبل تنفيذه', 'See your booth before it is built'],
    text: ['تصميم ثلاثي الأبعاد تعتمده أولاً، فلا مفاجآت يوم التركيب.', 'A 3D design you approve first — no surprises on installation day.'],
  },
  {
    icon: 'seal',
    title: ['شركة عُمانية مسجّلة', 'A registered Omani company'],
    text: [`مقرنا مسقط، وسجلنا التجاري ${COMPANY.cr.replace('CR# ', '')}.`, `Based in Muscat, commercial register ${COMPANY.cr.replace('CR# ', '')}.`],
  },
]

const STEPS = [
  [
    ['نسمع فكرتك', 'We listen'],
    ['تواصل معنا على الواتساب أو أرسل استفسارك، ونتفق على ما تحتاجه.', 'Message us on WhatsApp or send your enquiry, and we agree on what you need.'],
  ],
  [
    ['نخطط ونصمّم', 'We plan and design'],
    ['نضع الخطة، ونصمّم الجناح تصميماً ثلاثي الأبعاد تراه وتعتمده قبل التنفيذ.', 'We set the plan and design the booth in 3D for you to see and approve before it is built.'],
  ],
  [
    ['ننفّذ ونجهّز', 'We build and equip'],
    ['نجهّز المكان والتجهيزات ونركّب الجناح في موقعه.', 'We prepare the venue and equipment and install the booth on site.'],
  ],
  [
    ['نفتتح معك', 'We open with you'],
    ['نتابع معك كل التفاصيل حتى يوم الافتتاح.', 'We follow every detail with you until opening day.'],
  ],
]

/** Recent work: real photos from the sites we built. */
const WORK = [
  {
    img: 'icar-booths.webp',
    tag: 'ICAR 2026',
    title: ['أجنحة مؤتمر ICAR 2026', 'ICAR 2026 conference booths'],
    text: ['أجنحة بجدران منحنية وخلفيات مطبوعة بهوية المؤتمر، جاهزة قبل الافتتاح.', 'Curved-wall booths with printed backdrops in the conference identity, ready before opening.'],
    wide: true,
  },
  {
    img: 'nasa-booth.webp',
    tag: 'NASA Space Apps 2026',
    title: ['١٠ أجنحة لتحدّي ناسا', '10 booths for NASA Space Apps'],
    text: ['منطقة العرض لتحدّي ناسا لتطبيقات الفضاء — إبراء.', 'The exhibition area for the NASA Space Apps Challenge — Ibra.'],
  },
  {
    img: 'build.webp',
    tag: ['خلف الكواليس', 'Behind the scenes'],
    title: ['من جدار أبيض إلى جناح جاهز', 'From a white wall to a ready booth'],
    text: ['فريقنا يركّب ويجهّز في الموقع، من التركيب إلى الفك.', 'Our team installs and equips on site — from build-up to take-down.'],
  },
  {
    img: 'nasa-booth-2.webp',
    tag: 'NASA Space Apps 2026',
    title: ['هوية لكل جهة مشاركة', 'An identity for every participant'],
    text: ['خلفية مطبوعة لكل جناح، وطاولات وكراسي مجهّزة.', 'A printed backdrop for each booth, with tables and chairs set.'],
  },
]

const MARQUEE = [
  ['تنظيم المعارض', 'Exhibition organising'],
  ['تصميم الأجنحة وتنفيذها', 'Booth design & build'],
  ['تأجير الخيام والتجهيزات', 'Tents & equipment rental'],
  ['رحلات الأعمال', 'Business trips'],
  ['حيث تلتقي التجارة', 'Where trade meets'],
]

const FAQ = [
  [
    ['كيف أحجز مساحة في أحد معارضكم؟', 'How do I book a space at one of your exhibitions?'],
    ['أرسل طلب الحجز من صفحة «أرسل استفسارك»، أو تواصل معنا على الواتساب، ويتواصل معك فريقنا لتأكيد الموقع والباقة.', 'Send a booking request from the “Send an enquiry” page, or message us on WhatsApp, and our team will contact you to confirm the spot and the package.'],
  ],
  [
    ['ما مساحة الموقع في المعرض، وماذا يشمل؟', 'What size is a spot, and what does it include?'],
    ['المواقع في معارض SOVA بمساحة 2 × 3 أمتار عادةً، وتشمل نقطة كهرباء وتنظيفاً يومياً، وتختلف الباقات بحسب موقعها في المعرض وتجهيزاتها.', 'Spots at SOVA exhibitions are usually 2 × 3 metres, with a power point and daily cleaning; packages differ by their place in the exhibition and their equipment.'],
  ],
  [
    ['كم الأسعار؟', 'What are the prices?'],
    ['تختلف بحسب المعرض والباقة والخدمة. تواصل معنا على الواتساب لتصلك الأسعار الحالية والتفاصيل.', 'They depend on the exhibition, the package and the service. Message us on WhatsApp for current prices and details.'],
  ],
  [
    ['هل تصممون جناحاً خاصاً لجهتنا؟', 'Can you design a booth for our organisation?'],
    ['نعم، نصمّم الجناح تصميماً ثلاثي الأبعاد تعتمده أولاً، ثم ننفّذه ونركّبه في موقعه.', 'Yes — we design it in 3D for your approval, then build it and install it on site.'],
  ],
  [
    ['إلى أين رحلات الأعمال، ومن يشارك فيها؟', 'Where do the business trips go, and who takes part?'],
    ['إلى تركيا ومصر والهند، من 13 إلى 18 تاجراً في كل رحلة. تواصل معنا لمعرفة المواعيد القادمة.', 'To Turkey, Egypt and India, with 13 to 18 merchants on each trip. Contact us for the coming dates.'],
  ],
]

/**
 * The page's motion: elements marked `data-reveal` rise in as they scroll into view, the top
 * bar turns solid once the page moves, a thin bar shows how far the visitor has read, and the
 * hero photo drifts with the pointer. Everything stays still under «reduce motion».
 */
function useMotion(root) {
  useEffect(() => {
    const el = root.current
    if (!el) return undefined
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const items = [...el.querySelectorAll('[data-reveal]')]
    let io
    if (still || !('IntersectionObserver' in window)) items.forEach((n) => n.classList.add('is-in'))
    else {
      io = new IntersectionObserver(
        (entries) =>
          entries.forEach((e) => {
            if (e.isIntersecting) {
              e.target.classList.add('is-in')
              io.unobserve(e.target)
            }
          }),
        { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
      )
      items.forEach((n) => io.observe(n))
    }
    let raf = 0
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const y = window.scrollY
        const max = document.documentElement.scrollHeight - window.innerHeight
        el.style.setProperty('--progress', max > 0 ? (y / max).toFixed(4) : 0)
        el.classList.toggle('is-scrolled', y > 24)
        if (!still) el.style.setProperty('--hero-y', `${Math.min(y, 900) * 0.18}px`)
      })
    }
    const onMove = (e) => {
      if (still) return
      el.style.setProperty('--mx', (e.clientX / window.innerWidth - 0.5).toFixed(3))
      el.style.setProperty('--my', (e.clientY / window.innerHeight - 0.5).toFixed(3))
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => {
      io?.disconnect()
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('pointermove', onMove)
    }
  }, [root])
}

/** A headline whose words rise one after another. */
function Words({ text, from = 0 }) {
  return text.split(' ').map((w, i) => (
    <Fragment key={i}>
      <span className="h-word">
        <span style={{ '--d': `${from + i * 90}ms` }}>{w}</span>
      </span>{' '}
    </Fragment>
  ))
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
  const day = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString(t('ar-OM', 'en-GB'), { day: 'numeric', month: 'long', year: 'numeric' })
  return (
    <section className="h-section h-events" id="events" aria-labelledby="events-title">
      <div className="h-wrap">
        <header className="h-head">
          <p className="h-kicker">Upcoming</p>
          <h2 id="events-title">{t('المعارض القادمة', 'Upcoming exhibitions')}</h2>
        </header>
        <div className="h-event-list">
          {list.map((ex) => {
            const title = ex.name?.trim() || `${COMPANY.brand} ${ex.city || ''}`.trim()
            return (
              <article key={ex.id} className="h-event is-in">
                <h3>{title}</h3>
                <p>{[ex.mall || ex.city, ex.date_from && `${day(ex.date_from)}${ex.date_to && ex.date_to !== ex.date_from ? ` – ${day(ex.date_to)}` : ''}`].filter(Boolean).join(' · ')}</p>
                <Link to="/book" className="h-btn h-btn-line" onClick={() => track('event_book')}>
                  {t('احجز مساحتك', 'Book your space')}
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
 * The company's official site (the main link): who we are, the four services, recent work, why
 * us, how we work, common questions and how to reach us — in Arabic or English. The internal
 * system stays behind «دخول الموظفين».
 */
export default function Home() {
  const { session } = useAuth()
  const [menu, setMenu] = useState(false)
  const root = useRef(null)
  useMotion(root)
  useEffect(() => {
    document.title = t(`${COMPANY.name} — تنظيم المعارض وتصميم الأجنحة ورحلات الأعمال`, `${COMPANY.nameEn} — Exhibitions, booth design and business trips in Oman`)
    loadAnalytics('home')
  }, [])
  const year = new Date().getFullYear()
  const en = isEnglish()
  const wa = waLink(askText(FROM_SITE))
  const staff = session ? t('لوحة التحكم', 'Dashboard') : t('دخول الموظفين', 'Staff login')
  const sections = [
    ['#services', t('خدماتنا', 'Services')],
    ['#work', t('أعمالنا', 'Our work')],
    ['#how', t('كيف نعمل', 'How we work')],
    ...(SHOW_EVENTS ? [['#events', t('المعارض القادمة', 'Exhibitions')]] : []),
    ['#faq', t('أسئلة شائعة', 'FAQ')],
    ['#contact', t('تواصل معنا', 'Contact')],
  ]
  const switchLang = () => setLang(en ? 'ar' : 'en')
  const marquee = MARQUEE.map((m) => t(...m))

  return (
    <div ref={root} className={`home ${en ? 'home-en' : ''} ${menu ? 'menu-open' : ''}`} dir={en ? 'ltr' : 'rtl'} lang={en ? 'en' : 'ar'}>
      <a className="h-skip" href="#main">
        {t('انتقل إلى المحتوى', 'Skip to content')}
      </a>
      <div className="h-progress" aria-hidden="true" />
      <header className="h-bar">
        <div className="h-wrap h-bar-in">
          <a href="#top" className="h-brand" aria-label={COMPANY.name}>
            <img src={COMPANY.logoLight} alt={`${COMPANY.name} — ${COMPANY.nameEn}`} width="150" height="28" />
          </a>
          <nav className={`h-nav ${menu ? 'open' : ''}`} id="h-nav" aria-label={t('أقسام الموقع', 'Site sections')}>
            {sections.map(([href, label], i) => (
              <a key={href} href={href} onClick={() => setMenu(false)} style={{ '--i': i }}>
                {label}
              </a>
            ))}
            <Link to="/dashboard" className="h-nav-staff" onClick={() => setMenu(false)} style={{ '--i': sections.length }}>
              {staff}
            </Link>
          </nav>
          <div className="h-bar-actions">
            <button type="button" className="h-lang" onClick={switchLang} lang={en ? 'ar' : 'en'}>
              {en ? 'العربية' : 'English'}
            </button>
            <Link to="/dashboard" className="h-staff">
              {staff}
            </Link>
            <a className="h-btn h-btn-main h-btn-sm" href={wa} target="_blank" rel="noopener noreferrer" onClick={() => track('whatsapp_top')}>
              {t('واتساب', 'WhatsApp')}
            </a>
            <button type="button" className="h-menu" aria-expanded={menu} aria-controls="h-nav" aria-label={t('القائمة', 'Menu')} onClick={() => setMenu((m) => !m)}>
              <span />
              <span />
              <span />
            </button>
          </div>
        </div>
      </header>

      <main id="main">
        <section className="h-hero" id="top">
          <div className="h-hero-bg" aria-hidden="true">
            <div className="h-grid" />
            <div className="h-orb h-orb-1" />
            <div className="h-orb h-orb-2" />
            <Star className="h-float-star s1" />
            <Star className="h-float-star s2" />
            <Star className="h-float-star s3" />
          </div>
          <div className="h-wrap h-hero-in">
            <div className="h-hero-copy">
              <p className="h-kicker h-rise" style={{ '--d': '0ms' }}>
                <Star className="h-kicker-star" /> Axis Integrated Business · Muscat, Oman
              </p>
              <h1>
                <span className="h-line">
                  <Words text={t('ما نبيع جناحاً،', 'We don’t sell booths,')} from={120} />
                </span>
                <span className="h-line h-accent">
                  <Words text={t('نبني حضوراً', 'we build presence')} from={420} />
                </span>
              </h1>
              <p className="h-lead h-rise" style={{ '--d': '800ms' }}>
                {t(
                  `${COMPANY.name} شركة عُمانية مقرها مسقط، متخصصة في تنظيم المعارض التجارية، وتصميم الأجنحة وتنفيذها، وتأجير الخيام والتجهيزات، ورحلات الأعمال إلى تركيا ومصر والهند.`,
                  `${COMPANY.nameEn} is an Omani company based in Muscat, specialised in organising trade exhibitions, designing and building booths, renting tents and equipment, and business trips to Turkey, Egypt and India.`,
                )}
              </p>
              <div className="h-hero-actions h-rise" style={{ '--d': '950ms' }}>
                <a className="h-btn h-btn-main h-btn-shine" href={wa} target="_blank" rel="noopener noreferrer" onClick={() => track('whatsapp_hero')}>
                  <WaIcon />
                  {t('تواصل معنا على الواتساب', 'Message us on WhatsApp')}
                </a>
                <Link className="h-btn h-btn-ghost" to="/book" onClick={() => track('inquiry_hero')}>
                  {t('أرسل استفسارك', 'Send an enquiry')}
                </Link>
              </div>
              <ul className="h-facts h-rise" style={{ '--d': '1100ms' }}>
                <li>{t('شركة عُمانية مسجّلة', 'Registered Omani company')}</li>
                <li dir="ltr">{COMPANY.cr}</li>
                <li>{t('مسقط، سلطنة عُمان', 'Muscat, Sultanate of Oman')}</li>
              </ul>
            </div>
            <figure className="h-hero-media" aria-hidden="true">
              <div className="h-hero-frame">
                <img src={`${IMG}icar-booths.webp`} alt="" width="1800" height="1013" fetchPriority="high" />
              </div>
              <figcaption className="h-hero-badge">
                <Star />
                <span>
                  <b>{t('حيث تلتقي التجارة', 'Where trade meets')}</b>
                  <i>{t('Where trade meets', 'حيث تلتقي التجارة')}</i>
                </span>
              </figcaption>
            </figure>
          </div>
          <a href="#services" className="h-scroll" aria-label={t('انزل إلى خدماتنا', 'Scroll to services')}>
            <span />
          </a>
        </section>

        <div className="h-marquee" aria-hidden="true" dir="ltr">
          <div className="h-marquee-track">
            {[0, 1].map((k) => (
              <div key={k} className="h-marquee-row">
                {[...marquee, ...marquee].map((m, i) => (
                  <span key={i}>
                    {m}
                    <Star />
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>

        <section className="h-section" id="services" aria-labelledby="services-title">
          <div className="h-wrap">
            <header className="h-head" data-reveal>
              <p className="h-kicker">Our services</p>
              <h2 id="services-title">{t('خدماتنا', 'Our services')}</h2>
              <p className="h-sub">{t('أربع خدمات تكمّل بعضها، لتبدأ مشروعك معنا وتنهيه معنا.', 'Four services that complete each other — start your project with us and finish it with us.')}</p>
            </header>
            <div className="h-services">
              {SERVICES.map((x, i) => (
                <article key={x.id} className="h-service" data-reveal style={{ '--d': `${i * 110}ms` }}>
                  <span className="h-service-num" aria-hidden="true">
                    0{i + 1}
                  </span>
                  <span className="h-service-icon">
                    <Glyph d={ICONS[x.id]} />
                  </span>
                  <h3>{en ? x.en : x.title}</h3>
                  {!en && <p className="h-en">{x.en}</p>}
                  <p>{en ? x.enText : x.text}</p>
                  <a className="h-link" href={waLink(askText(FROM_SITE, x.topic))} target="_blank" rel="noopener noreferrer" onClick={() => track(`service_${x.id}`)}>
                    {t('اسأل عن هذه الخدمة', 'Ask about this service')}
                    <Glyph d={ICONS.arrow} />
                  </a>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="h-section h-work" id="work" aria-labelledby="work-title">
          <div className="h-wrap">
            <header className="h-head h-head-row" data-reveal>
              <div>
                <p className="h-kicker">Selected work</p>
                <h2 id="work-title">{t('من أعمالنا', 'From our work')}</h2>
              </div>
              <p className="h-sub">{t('صور حقيقية من مواقع نفّذناها — من التركيب إلى يوم الافتتاح.', 'Real photos from sites we delivered — from build-up to opening day.')}</p>
            </header>
            <div className="h-work-grid">
              {WORK.map((w, i) => (
                <figure key={w.img} className={`h-shot ${w.wide ? 'h-shot-wide' : ''}`} data-reveal style={{ '--d': `${i * 120}ms` }}>
                  <div className="h-shot-img">
                    <img src={`${IMG}${w.img}`} alt={t(...w.title)} loading="lazy" decoding="async" />
                  </div>
                  <figcaption>
                    <span className="h-shot-tag" dir="auto">
                      {Array.isArray(w.tag) ? t(...w.tag) : w.tag}
                    </span>
                    <b>{t(...w.title)}</b>
                    <span>{t(...w.text)}</span>
                  </figcaption>
                </figure>
              ))}
            </div>
            <div className="h-work-more" data-reveal>
              <a className="h-btn h-btn-line" href={`https://www.instagram.com/${IG}/`} target="_blank" rel="noopener noreferrer" onClick={() => track('instagram_work')}>
                {t(`المزيد على إنستغرام ${COMPANY.instagram}`, `More on Instagram ${COMPANY.instagram}`)}
              </a>
            </div>
          </div>
        </section>

        <section className="h-section h-why" id="why" aria-labelledby="why-title">
          <Star className="h-why-star" />
          <div className="h-wrap">
            <header className="h-head" data-reveal>
              <p className="h-kicker">Why us</p>
              <h2 id="why-title">{t('ما يميّزنا', 'Why work with us')}</h2>
            </header>
            <div className="h-why-list">
              {WHY.map((w, i) => (
                <article key={w.icon} className="h-why-item" data-reveal style={{ '--d': `${i * 120}ms` }}>
                  <span className="h-service-icon">
                    <Glyph d={ICONS[w.icon]} />
                  </span>
                  <div>
                    <h3>{t(...w.title)}</h3>
                    <p>{t(...w.text)}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="h-section h-how" id="how" aria-labelledby="how-title">
          <div className="h-wrap">
            <header className="h-head" data-reveal>
              <p className="h-kicker">How we work</p>
              <h2 id="how-title">{t('كيف نعمل', 'How we work')}</h2>
            </header>
            <ol className="h-steps" data-reveal>
              {STEPS.map(([title, text], i) => (
                <li key={title[1]} style={{ '--d': `${200 + i * 180}ms` }}>
                  <span className="h-step-dot" aria-hidden="true">
                    {i + 1}
                  </span>
                  <h3>{t(...title)}</h3>
                  <p>{t(...text)}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {SHOW_EVENTS && <Events />}

        <section className="h-section h-faq" id="faq" aria-labelledby="faq-title">
          <div className="h-wrap h-faq-in">
            <header className="h-head" data-reveal>
              <p className="h-kicker">FAQ</p>
              <h2 id="faq-title">{t('أسئلة شائعة', 'Common questions')}</h2>
              <p className="h-sub">{t('لم تجد جوابك؟ اسألنا على الواتساب.', 'Didn’t find your answer? Ask us on WhatsApp.')}</p>
            </header>
            <div className="h-faq-list">
              {FAQ.map(([q, a], i) => (
                <details key={q[1]} className="h-faq-item" open={i === 0} data-reveal style={{ '--d': `${i * 70}ms` }}>
                  <summary>{t(...q)}</summary>
                  <p>{t(...a)}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="h-section h-contact" id="contact" aria-labelledby="contact-title">
          <div className="h-contact-glow" aria-hidden="true" />
          <div className="h-wrap h-contact-in">
            <div data-reveal>
              <p className="h-kicker">Get in touch</p>
              <h2 id="contact-title">{t('لنبدأ مشروعك', 'Let’s start your project')}</h2>
              <p className="h-sub">{t('للأسعار والتفاصيل تواصل معنا مباشرة، أو أرسل بياناتك ونتصل بك.', 'For prices and details contact us directly, or leave your details and we will call you.')}</p>
              <div className="h-hero-actions">
                <a className="h-btn h-btn-main h-btn-shine" href={wa} target="_blank" rel="noopener noreferrer" onClick={() => track('whatsapp_contact')}>
                  <WaIcon />
                  {t('تواصل معنا على الواتساب', 'Message us on WhatsApp')}
                </a>
                <Link className="h-btn h-btn-ghost" to="/book" onClick={() => track('inquiry_contact')}>
                  {t('أرسل استفسارك', 'Send an enquiry')}
                </Link>
              </div>
            </div>
            <ul className="h-cards" data-reveal style={{ '--d': '150ms' }}>
              {PHONES.map((p) => (
                <li key={p}>
                  <span>{t('اتصال', 'Call')}</span>
                  <a href={`tel:+968${p}`} dir="ltr" onClick={() => track('call')}>
                    +968 {p}
                  </a>
                </li>
              ))}
              <li>
                <span>{t('البريد', 'Email')}</span>
                <a className="h-card-email" href={`mailto:${COMPANY.email}`} dir="ltr" onClick={() => track('email')}>
                  {COMPANY.email}
                </a>
              </li>
              <li>
                <span>{t('إنستغرام', 'Instagram')}</span>
                <a href={`https://www.instagram.com/${IG}/`} target="_blank" rel="noopener noreferrer" dir="ltr" onClick={() => track('instagram')}>
                  {COMPANY.instagram}
                </a>
              </li>
              <li>
                <span>{t('الموقع', 'Location')}</span>
                <span className="h-card-v">{t('مسقط، سلطنة عُمان', 'Muscat, Sultanate of Oman')}</span>
              </li>
            </ul>
          </div>
        </section>
      </main>

      <footer className="h-foot">
        <div className="h-wrap">
          <p className="h-foot-big" aria-hidden="true">
            {t('حيث تلتقي التجارة', 'Where trade meets')}
          </p>
          <div className="h-foot-in">
            <div>
              <img className="h-foot-logo" src={COMPANY.logoLight} alt="" width="150" height="28" />
              <p>{en ? COMPANY.nameEn : COMPANY.legalName}</p>
              <p className="h-foot-muted" dir="ltr">
                {en ? COMPANY.name : COMPANY.nameEn} · {COMPANY.cr}
              </p>
            </div>
            <div className="h-foot-links">
              <Link to="/book">{t('الحجز والاستفسار', 'Booking & enquiries')}</Link>
              <a href={`https://www.instagram.com/${IG}/`} target="_blank" rel="noopener noreferrer">
                {t('إنستغرام', 'Instagram')}
              </a>
              <button type="button" className="h-foot-lang" onClick={switchLang}>
                {en ? 'العربية' : 'English'}
              </button>
              <Link to="/dashboard">{staff}</Link>
            </div>
            <p className="h-foot-muted">
              © {year} {en ? COMPANY.nameEn : COMPANY.name}
            </p>
          </div>
        </div>
      </footer>

      <a className="h-float" href={wa} target="_blank" rel="noopener noreferrer" aria-label={t('تواصل معنا على الواتساب', 'Message us on WhatsApp')} onClick={() => track('whatsapp_float')}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path fill="currentColor" d={WA_ICON} />
        </svg>
      </a>
    </div>
  )
}
