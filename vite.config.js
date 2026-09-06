import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
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
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
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
      { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
      { find: 'vue-fluent-widgets/style.css', replacement: fileURLToPath(new URL('../VueFluentWidgets/packages/vue-fluent-widgets/src/styles/global.css', import.meta.url)) },
      // Use the adjacent library source while its public dist is being developed.
      { find: 'vue-fluent-widgets', replacement: fileURLToPath(new URL('../VueFluentWidgets/packages/vue-fluent-widgets/src/index.js', import.meta.url)) }
    ]
  }
})
