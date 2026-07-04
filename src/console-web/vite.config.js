import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/console/',
  build: {
    outDir: process.env.VITE_OUT_DIR || '../../public/console',
    emptyOutDir: true
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001'
    }
  }
})
