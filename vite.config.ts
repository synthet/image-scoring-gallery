import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { createProxyMiddleware } from 'http-proxy-middleware'

/**
 * Browser dev: proxy `/gallery-api/*` and `/media/*` to the gallery Express server
 * (`npm run server`, default port 3001). Do not point this at the Python WebUI port.
 */
const galleryServerUrl =
  process.env.VITE_GALLERY_SERVER_URL || 'http://127.0.0.1:3001'

function galleryBrowserProxy(target: string): Plugin {
  return {
    name: 'gallery-browser-proxy',
    enforce: 'pre',
    configureServer(server) {
      const proxy = createProxyMiddleware({
        target,
        changeOrigin: true,
        pathFilter: (pathname: string) =>
          pathname.startsWith('/gallery-api') ||
          pathname.startsWith('/media'),
      })
      server.middlewares.use(proxy)
    },
  }
}

console.log(`[Vite] Proxying /gallery-api and /media to: ${galleryServerUrl}`)

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [galleryBrowserProxy(galleryServerUrl), react()],
  // Dev: `/` avoids baseMiddleware 404 for absolute paths (e.g. /gallery-api/ping) that
  // would otherwise fall through if proxy order fails. Build keeps `./` for Electron/file://.
  base: command === 'serve' ? '/' : './',
  server: {
    port: 5173,
    strictPort: true,
  },
}))
