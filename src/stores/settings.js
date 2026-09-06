import { reactive, ref, watch } from 'vue'
import { defineStore } from 'pinia'

const STORAGE_KEY = 'cytime.settings.v2'

export const defaultSettings = {
  theme: 'dark-peach',
  startupMode: 'clock',
  startupWindowMode: 'normal',
  uriRegistration: true,
  showClockSeconds: true,
  showDate: true,
  showWeather: true,
  showQuote: true,
  showImportantDays: true,
  showDayProgress: true,
  showHomework: false,
  showSchedule: true,
  weatherAlertEnabled: true,
  weatherForecastEnabled: true,
  homeworkPosition: 'left',
  homeworkFontSize: 13,
  autostart: false,
  examMode: false,
  preventSleep: false,
  notificationEnabled: true,
  soundEnabled: true,
  quoteRotation: true,
  quoteInterval: 600,
  quoteCloudEnabled: true,
  quoteLocalWeight: 3,
  quoteCloudWeight: 1,
  quoteCloudSource: 'hitokoto',
  quoteLocalSources: {
    daily: { enabled: true, weight: 3 },
    flameJourney: { enabled: true, weight: 2 },
    university: { enabled: true, weight: 2 }
  },
  quoteSources: {
    hitokoto: { enabled: true, weight: 3 },
    jinrishici: { enabled: true, weight: 2 },
    poetry: { enabled: true, weight: 1 },
    vvhan: { enabled: true, weight: 1 },
    xygeng: { enabled: true, weight: 1 },
    adviceSlip: { enabled: false, weight: 1 }
  },
  quoteAnimation: 'typewriter',
  quoteTypeSpeed: 'standard',
  weatherCityName: '北京',
  weatherCityNum: '101010100',
  fontFamily: 'wengfaluosi',
  background: 'mica',
  clockFontScale: 11,
  dateFontSize: 15,
  quoteFontSize: 14,
  uiScale: 100,
  timeSyncEnabled: false,
  timeSyncInterval: 60
}

const cloneSettings = value => JSON.parse(JSON.stringify(value))

function readStoredSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || localStorage.getItem('cytime.settings.v1') || '{}')
    const base = cloneSettings(defaultSettings)
    const merged = { ...base, ...(saved && typeof saved === 'object' ? saved : {}), quoteLocalSources: { ...base.quoteLocalSources, ...(saved?.quoteLocalSources || {}) }, quoteSources: { ...base.quoteSources, ...(saved?.quoteSources || {}) } }
    if (!['clock', 'countdown', 'timer'].includes(merged.startupMode)) merged.startupMode = 'clock'
    return merged
  } catch {
    return cloneSettings(defaultSettings)
  }
}

export function applyTheme(settings) {
  const root = document.documentElement
  const dark = settings.theme.startsWith('dark')
  root.classList.toggle('dark', dark)
  root.classList.toggle('light', !dark)
  root.classList.toggle('theme-light', !dark)
  root.classList.toggle('theme-peach', settings.theme.includes('peach'))
  root.style.colorScheme = dark ? 'dark' : 'light'
  root.dataset.font = settings.fontFamily
  root.dataset.background = settings.background
  root.style.setProperty('--clock-font-scale', settings.clockFontScale)
  root.style.setProperty('--date-font-size', `${settings.dateFontSize}px`)
  root.style.setProperty('--quote-font-size', `${settings.quoteFontSize}px`)
  root.style.setProperty('--ui-scale', String(Math.max(50, Math.min(200, settings.uiScale)) / 100))
}

export const useSettingsStore = defineStore('settings', () => {
  const settings = reactive(readStoredSettings())
  const examModeActive = ref(false)

  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  }

  function update(patch) {
    Object.assign(settings, patch)
    applyTheme(settings)
    persist()
  }

  function reset() {
    Object.assign(settings, cloneSettings(defaultSettings))
    applyTheme(settings)
    persist()
  }

  function setExamMode(active) {
    examModeActive.value = Boolean(active)
  }

  function exportSettings() {
    return JSON.stringify({ version: 2, settings }, null, 2)
  }

  watch(settings, persist, { deep: true })
  applyTheme(settings)

  return { settings, examModeActive, setExamMode, update, reset, exportSettings }
})
