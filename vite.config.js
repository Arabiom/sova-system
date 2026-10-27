import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The site's public address. Changing it (a domain of the company's own) is this one line in
// the deploy workflow: the base path, link previews, search data, sitemap and CNAME follow it.
const SITE_URL = process.env.SITE_URL || 'https://arabiom.github.io/sova-system/'
process.env.VITE_SITE_URL = SITE_URL // %VITE_SITE_URL% in index.html and links/index.html

// Which update the site is running: shown in the footer (Netlify passes the commit).
const stamp = `${new Date().toISOString().slice(0, 10)} • ${(process.env.COMMIT_REF || 'local').slice(0, 7)}`

export default defineConfig({
  // under the address's path (GitHub Pages: /sova-system/; a domain of its own: /); BASE_PATH wins if set
  base: process.env.BASE_PATH || (process.env.SITE_URL ? new URL(SITE_URL).pathname : '/'),
  plugins: [
    react(),
    // version.json next to the site: open pages compare it with their own build and offer a reload.
    { name: 'version-file', generateBundle() { this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: stamp }) }) } },
  ],
  define: { __BUILD__: JSON.stringify(stamp) },
  build: {
    // Two pages: the app, and the Instagram bio link page (/links/) — a light page of its own.
    rollupOptions: { input: { main: 'index.html', links: 'links/index.html' } },
    // jsPDF + html2canvas form one large chunk, but it is only downloaded when a PDF is printed.
    chunkSizeWarningLimit: 700,
  },
  test: {
    environment: 'node',
  },
})
