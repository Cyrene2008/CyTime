import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import VueFluentWidgets from 'vue-fluent-widgets'
import 'vue-fluent-widgets/style.css'
import { useSettingsStore } from './stores/settings'
import App from './App.vue'
import ClockView from './views/ClockView.vue'
import CountdownView from './views/CountdownView.vue'
import TimerView from './views/TimerView.vue'
import SettingsView from './views/SettingsView.vue'
import './styles/app.css'

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
