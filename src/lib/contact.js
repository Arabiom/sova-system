// The company's services and ready WhatsApp messages, shared by the public pages (the official
// site at «/» and the Instagram page «/links/»). No prices here: every price question goes to
// WhatsApp.
import { COMPANY } from './constants.js'

/**
 * «المعارض القادمة» on the public pages: hidden until the official approvals are in. Set to
 * true to list the upcoming exhibitions (names, places, dates) from the booking page's list.
 */
export const SHOW_EVENTS = false

export const SERVICES = [
  {
    id: 'exhibition',
    title: 'تنظيم المعارض',
    en: 'Exhibition organising',
    text: 'نتولّى تنظيم معرض جهتك من التخطيط وتوزيع المواقع إلى أيام الافتتاح.',
    enText: 'We organise your exhibition — from planning and the floor plan to the opening days.',
    topic: 'تنظيم معرض لجهتنا',
  },
  {
    id: 'booth',
    title: 'تصميم الأجنحة وتنفيذها',
    en: 'Booth design & build',
    text: 'تصميم ثلاثي الأبعاد تراه قبل التنفيذ، ثم ننفّذ جناحك ونركّبه في موقعه.',
    enText: 'A 3D design you see and approve first, then we build your booth and install it on site.',
    topic: 'تصميم جناح وتنفيذه',
  },
  {
    id: 'rental',
    title: 'تأجير الخيام والتجهيزات',
    en: 'Tents & equipment rental',
    text: 'خيام وطاولات ومفارش وكراسي وأرفف للمعارض والفعاليات.',
    enText: 'Tents, tables, table covers, chairs and shelving for exhibitions and events.',
    topic: 'تأجير الخيام والتجهيزات',
  },
  {
    id: 'trips',
    title: 'رحلات الأعمال',
    en: 'Business trips',
    text: 'رحلات تجارية إلى تركيا ومصر والهند، من ١٣ إلى ١٨ تاجراً في كل رحلة.',
    enText: 'Trade trips to Turkey, Egypt and India, with 13 to 18 merchants on each trip.',
    topic: 'رحلات الأعمال',
  },
]

/** «السلام عليكم، أتواصل معكم من {where} وأرغب بالاستفسار عن {topic}». */
export const askText = (where, topic = 'خدماتكم') => `السلام عليكم، أتواصل معكم من ${where} وأرغب بالاستفسار عن ${topic}`

export const waLink = (text) => `https://wa.me/${COMPANY.whatsapp}?text=${encodeURIComponent(text)}`
