import { fileURLToPath, URL } from 'node:url'
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import { parseJsonc } from './api/data/jsonc.js'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))
const buildId = (() => {
  try { return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() } catch { return '' }
})()

function jsoncPlugin() {
  const suffix = '.jsonc'
  return {
    name: 'cytime-jsonc',
    async resolveId(source, importer) {
      if (!source.endsWith(suffix)) return null
      return this.resolve(source, importer, { skipSelf: true })
    },
    load(id) {
      if (!id.endsWith(suffix)) return null
      const raw = readFileSync(id.replace(/\?.*$/, ''), 'utf8')
      return `export default ${JSON.stringify(parseJsonc(raw))}`
    }
  }
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_ID__: JSON.stringify(buildId)
  },
  server: {
    proxy: {
      '/api/xiaomi-weather': {
        target: 'https://weatherapi.market.xiaomi.com',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/api\/xiaomi-weather/, '')
      }
    }
  },
  plugins: [
    jsoncPlugin(),
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: null,
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'CyTime 昔时时钟|班级大屏时钟|电子时钟|倒计时|计时器',
        short_name: 'CyTime',
        lang: 'zh-CN',
        dir: 'ltr',
        description: '昔光涟涟，时不我待。',
        theme_color: '#0f6cbd',
        background_color: '#f5f5f5',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icon-192.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'any maskable' },
          { src: '/icon-512.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any maskable' }
        ],
      },
      workbox: {
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/weatherapi\.market\.xiaomi\.com\//,
            handler: 'NetworkFirst',
            options: { cacheName: 'cytime-weather', networkTimeoutSeconds: 8, expiration: { maxEntries: 12, maxAgeSeconds: 60 * 60 } }
          },
          {
            urlPattern: /^https:\/\/v1\.hitokoto\.cn\//,
            handler: 'NetworkFirst',
            options: { cacheName: 'cytime-quotes', networkTimeoutSeconds: 6, expiration: { maxEntries: 10, maxAgeSeconds: 24 * 60 * 60 } }
          }
        ]
      }
    })
  ],
  resolve: {
    alias: [
      { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) }
    ]
  }
})
