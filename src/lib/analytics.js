// Visitor statistics for the public pages (/links/ and /book) with Google Analytics, once its
// measurement id (G-XXXXXXX) is set as VITE_GA_ID in .env. Without it nothing is loaded.
const GA_ID = import.meta.env.VITE_GA_ID || ''

export function loadAnalytics(page) {
  if (!GA_ID || window.gtag) return
  window.dataLayer = window.dataLayer || []
  window.gtag = function gtag() {
    window.dataLayer.push(arguments)
  }
  window.gtag('js', new Date())
  window.gtag('config', GA_ID, { page_title: page })
  const s = document.createElement('script')
  s.async = true
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID)}`
  document.head.append(s)
}
