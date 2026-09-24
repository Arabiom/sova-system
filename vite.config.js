import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    // jsPDF + html2canvas form one large chunk, but it is only downloaded when a PDF is printed.
    chunkSizeWarningLimit: 700,
  },
  test: {
    environment: 'node',
  },
})
