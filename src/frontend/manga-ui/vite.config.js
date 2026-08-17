import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

const IMAGE_DIR = process.env.MANGA_VISUAL_IMAGE_DIR || ''

function serveLocalImages() {
  return {
    name: 'serve-local-images',
    configureServer(server) {
      server.middlewares.use('/local-images', (req, res) => {
        if (!IMAGE_DIR) {
          res.statusCode = 404
          res.end('Visual image directory is not configured')
          return
        }
        const filePath = path.join(IMAGE_DIR, decodeURIComponent(req.url || '/'))
        if (!fs.existsSync(filePath)) {
          res.statusCode = 404
          res.end('Not found')
          return
        }
        const ext = path.extname(filePath).toLowerCase()
        const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
                       '.webp': 'image/webp', '.gif': 'image/gif', '.bmp': 'image/bmp',
                       '.avif': 'image/avif' }[ext] || 'image/png'
        res.setHeader('Content-Type', mime)
        res.setHeader('Cache-Control', 'public, max-age=3600')
        fs.createReadStream(filePath).pipe(res)
      })

      // API to list available images
      server.middlewares.use('/api/local-images', (_req, res) => {
        try {
          if (!IMAGE_DIR) {
            res.statusCode = 404
            res.end(JSON.stringify({ error: 'Visual image directory is not configured' }))
            return
          }
          const files = fs.readdirSync(IMAGE_DIR)
            .filter(f => /\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(f))
            .sort()
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(files))
        } catch (e) {
          res.statusCode = 500
          res.end(JSON.stringify({ error: e.message }))
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), serveLocalImages()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5208',
        changeOrigin: false,
        bypass: (req) => {
          // Don't proxy our local image API
          if (req.url?.startsWith('/api/local-images')) return false
        }
      }
    }
  }
})
