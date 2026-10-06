import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Which update the site is running: shown in the footer (Netlify passes the commit).
const stamp = `${new Date().toISOString().slice(0, 10)} • ${(process.env.COMMIT_REF || 'local').slice(0, 7)}`

export default defineConfig({
  plugins: [react()],
  define: { __BUILD__: JSON.stringify(stamp) },
  build: {
    // jsPDF + html2canvas form one large chunk, but it is only downloaded when a PDF is printed.
    chunkSizeWarningLimit: 700,
  },
  test: {
    environment: 'node',
  },
})
