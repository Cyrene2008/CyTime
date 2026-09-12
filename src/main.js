import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import VueFluentWidgets from 'vue-fluent-widgets'
import 'vue-fluent-widgets/style.css'
import { invoke } from '@tauri-apps/api/core'
import { useSettingsStore } from './stores/settings'
import App from './App.vue'
import ClockView from './views/ClockView.vue'
import CountdownView from './views/CountdownView.vue'
import TimerView from './views/TimerView.vue'
import SettingsView from './views/SettingsView.vue'
import './styles/app.css'

const isTauriRuntime = () => typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__ || window.__TAURI__ || window.location?.hostname === 'tauri.localhost' || window.location?.protocol === 'tauri:')
let desktopRuntime = isTauriRuntime()

async function detectDesktopRuntime() {
  if (desktopRuntime) return true
  try { desktopRuntime = (await invoke('application_platform')) === 'tauri' } catch {}
  return desktopRuntime
}

async function hydrateDesktopStorage() {
  if (!desktopRuntime) return
  try {
    const values = await invoke('storage_read_all')
    const keys = ['cytime.settings.v2', 'cytime.settings.v1', 'cytime.content.v1', 'cytime.time-state.v1']
    const stored = values && typeof values === 'object' ? values : {}
    for (const key of keys) {
      if (stored[key] !== undefined) localStorage.setItem(key, JSON.stringify(stored[key]))
      else {
        const legacy = localStorage.getItem(key)
        if (legacy) {
          try { await invoke('storage_write', { key, value: JSON.parse(legacy) }) } catch {}
        }
      }
    }
  } catch {}
}

async function syncServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
  if (desktopRuntime) {
    // 桌面端不使用 Service Worker：注销历史注册并清理缓存，避免 WebView 命中旧资源。
    try {
      const registrations = await navigator.serviceWorker.getRegistrations()
      await Promise.all(registrations.map(registration => registration.unregister()))
      if (window.caches) {
        const keys = await window.caches.keys()
        await Promise.all(keys.map(key => window.caches.delete(key)))
      }
    } catch {}
    return
  }
  const hadController = Boolean(navigator.serviceWorker.controller)
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || window.__cytimeReloading) return
    window.__cytimeReloading = true
    window.location.reload()
  })
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then(registration => {
      const check = () => registration.update().catch(() => {})
      window.setInterval(check, 30 * 60 * 1000)
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check() })
    }).catch(() => {})
  }, { once: true })
}

async function bootstrap() {
  await detectDesktopRuntime()
  await hydrateDesktopStorage()
  await syncServiceWorker()
  const pinia = createPinia()
  const settingsStore = useSettingsStore(pinia)
  const startupPath = `/${['clock', 'countdown', 'timer'].includes(settingsStore.settings.startupMode) ? settingsStore.settings.startupMode : 'clock'}`

  const router = createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),
    routes: [
      { path: '/', redirect: startupPath },
      { path: '/clock', component: ClockView },
      { path: '/countdown', component: CountdownView },
      { path: '/timer', component: TimerView },
      { path: '/settings', redirect: '/clock' }
    ]
  })

  createApp(App)
    .use(pinia)
    .use(router)
    .use(VueFluentWidgets)
    .mount('#app')
}

bootstrap()
