import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

// Helper to resolve backend URL from lock file
function getBackendUrl() {
  const defaultUrl = 'http://localhost:3001'
  try {
    const locks = [
      path.resolve(__dirname, '../image-scoring-backend/webui.lock'),
      path.resolve(__dirname, '../image-scoring-backend/webui-debug.lock'),
      path.resolve(__dirname, './webui.lock'),
    ]
    for (const lock of locks) {
      if (fs.existsSync(lock)) {
        const data = JSON.parse(fs.readFileSync(lock, 'utf-8'))
        if (data.port) return `http://localhost:${data.port}`
      }
    }
  } catch (e) {
    console.warn('[Vite] Failed to resolve backend from lock file:', e)
  }
  return defaultUrl
}

const backendUrl = getBackendUrl()
console.log(`[Vite] Proxying to backend: ${backendUrl}`)

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/gallery-api': {
        target: backendUrl,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/gallery-api/, '')
      },
      '/media': {
        target: backendUrl,
        changeOrigin: true
      },
    },
  },
})
