// After the build: the public pages get real files, so opening them directly answers «200 OK»
// (search engines index them, and WhatsApp/Instagram show their own preview), and every other
// path falls back to the app (404.html). Run by the deploy workflow: node scripts/public-pages.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const SITE = 'https://arabiom.github.io/sova-system/'
const dist = new URL('../dist/', import.meta.url)
const index = readFileSync(new URL('index.html', dist), 'utf8')

/** index.html with this page's own title, description, preview image and address. */
function withMeta(html, { title, description, image, url }) {
  const set = (re, value) => {
    if (!re.test(html)) throw new Error(`public-pages: ${re} not found in index.html`)
    html = html.replace(re, value)
  }
  set(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
  set(/(<meta name="description" content=")[^"]*/, `$1${description}`)
  set(/(<meta property="og:title" content=")[^"]*/, `$1${title}`)
  set(/(<meta property="og:description" content=")[^"]*/, `$1${description}`)
  set(/(<meta property="og:image" content=")[^"]*/, `$1${image}`)
  set(/(<meta property="og:url" content=")[^"]*/, `$1${url}`)
  return html.replace('</head>', `    <link rel="canonical" href="${url}" />\n  </head>`)
}

mkdirSync(new URL('book/', dist), { recursive: true })
writeFileSync(
  new URL('book/index.html', dist),
  withMeta(index, {
    title: 'احجز مساحتك في معارض SOVA — محور الأعمال المتكاملة',
    description: 'أرسل طلب حجز مساحة في معارض SOVA أو استفسارك، ويتواصل معك فريقنا في أقرب وقت.',
    image: `${SITE}og-book.png`,
    url: `${SITE}book/`,
  }),
)
writeFileSync(new URL('index.html', dist), index.replace('</head>', `    <link rel="canonical" href="${SITE}" />\n  </head>`))
writeFileSync(new URL('404.html', dist), index)
console.log('public pages: book/index.html, 404.html')
