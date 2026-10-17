import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Which update the site is running: shown in the footer (Netlify passes the commit).
const stamp = `${new Date().toISOString().slice(0, 10)} • ${(process.env.COMMIT_REF || 'local').slice(0, 7)}`

export default defineConfig({
  // GitHub Pages serves the site under /sova-system/ (BASE_PATH set by its workflow); Netlify at /.
  base: process.env.BASE_PATH || '/',
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
