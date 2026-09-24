import { reactive, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { persistDesktopValue } from '../services/desktop'

const STORAGE_KEY = 'cytime.settings.v2'

export const defaultSettings = {
  theme: 'dark-peach',
  accentColor: '',
  startupMode: 'clock',
  startupWindowMode: 'normal',
  uriRegistration: true,
  showClockSeconds: true,
  showDate: true,
  showLunar: true,
  showAlmanac: true,
  showWeather: true,
  showQuote: true,
  showImportantDays: true,
  showDayProgress: true,
  showHomework: false,
  showSchedule: true,
  homeworkPosition: 'left',
  homeworkFontSize: 13,
  autostart: false,
  autostartHidden: true,
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
  quoteApiCategories: [],
  quoteApiEndpoint: 'cf',
  quoteApiCategoryWeightsEnabled: false,
  quoteApiCategoryWeights: {},
  quoteLocalSources: {
    daily: { enabled: true, weight: 3 },
    flameJourney: { enabled: true, weight: 2 },
    university: { enabled: true, weight: 2 }
  },
  quoteSources: {
    cytime: { enabled: true, weight: 20 },
    hitokoto: { enabled: false, weight: 3 },
    jinrishici: { enabled: false, weight: 2 },
    poetry: { enabled: false, weight: 1 },
    vvhan: { enabled: false, weight: 1 },
    xygeng: { enabled: false, weight: 1 },
    adviceSlip: { enabled: false, weight: 1 }
  },
  quoteAnimation: 'typewriter',
  quoteTypeSpeed: 'standard',
  weatherCityName: '北京',
  weatherCityNum: '101010100',
  weatherAutoLocated: false,
  fontFamily: 'wengfaluosi',
  background: 'mica',
  clockFontScale: 11,
  dateFontSize: 15,
  quoteFontSize: 14,
  statusDockScale: 100,
  statusDockOffsetY: 0,
  homeworkWidth: 300,
  homeworkOffsetX: 0,
  homeworkPageInterval: 10,
  uiScale: 100,
  timeSyncEnabled: true,
  timeSyncSource: 'system',
  timeSyncInterval: 60,
  widgetFontSize: 17,
  widgetLabelFontSize: 11,
  statusWeatherFontSize: 15,
  countdownFontSize: 22,
  quoteTextColor: '',
  quoteAuthorColor: '',
  statusWeatherColor: '',
  taskWidgetColor: '',
  taskWidgetAccentColor: '',
  homeworkStatusOngoingColor: '#1a8a1a',
  homeworkStatusUpcomingColor: '#c87a00',
  homeworkStatusEndedColor: '',
  homeworkTimeColor: '',
  homeworkTimeFontSize: 10
}

const cloneSettings = value => JSON.parse(JSON.stringify(value))

function readStoredSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || localStorage.getItem('cytime.settings.v1') || '{}')
    const base = cloneSettings(defaultSettings)
    const merged = { ...base, ...(saved && typeof saved === 'object' ? saved : {}), quoteLocalSources: { ...base.quoteLocalSources, ...(saved?.quoteLocalSources || {}) }, quoteSources: saved?.quoteSources?.cytime ? { ...base.quoteSources, ...saved.quoteSources } : base.quoteSources }
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

  // One accent → full Fluent ramp (same idea as VueFluentWidgets accentColor).
  const accent = (settings.accentColor || '').trim()
  if (accent) {
    root.style.setProperty('--accent', accent)
    root.style.setProperty('--fluent-accent', accent)
    root.style.setProperty('--accent-light', `color-mix(in srgb, ${accent}, white 34%)`)
    root.style.setProperty('--accent-dark', `color-mix(in srgb, ${accent}, black 18%)`)
    root.style.setProperty('--accent-hover', `color-mix(in srgb, ${accent}, black 12%)`)
    root.style.setProperty('--accent-200', `color-mix(in srgb, ${accent}, white 72%)`)
    root.style.setProperty('--accent-50', `color-mix(in srgb, ${accent}, white 92%)`)
  } else {
    for (const name of ['--accent', '--fluent-accent', '--accent-light', '--accent-dark', '--accent-hover', '--accent-200', '--accent-50']) root.style.removeProperty(name)
  }

  root.style.setProperty('--clock-font-scale', settings.clockFontScale)
  root.style.setProperty('--date-font-size', `${settings.dateFontSize}px`)
  root.style.setProperty('--quote-font-size', `${settings.quoteFontSize}px`)
  root.style.setProperty('--status-dock-scale', String(Math.max(60, Math.min(150, Number(settings.statusDockScale) || 100)) / 100))
  root.style.setProperty('--status-dock-offset-y', `${Math.max(-16, Math.min(240, Number(settings.statusDockOffsetY) || 0))}px`)
  root.style.setProperty('--homework-width', `${Math.max(200, Math.min(520, Number(settings.homeworkWidth) || 300))}px`)
  root.style.setProperty('--homework-offset-x', `${Math.max(0, Math.min(240, Number(settings.homeworkOffsetX) || 0))}px`)
  root.style.setProperty('--ui-scale', String(Math.max(50, Math.min(200, settings.uiScale)) / 100))
  root.style.setProperty('--widget-font-size', `${Math.max(10, Math.min(32, Number(settings.widgetFontSize) || 17))}px`)
  root.style.setProperty('--widget-label-font-size', `${Math.max(8, Math.min(20, Number(settings.widgetLabelFontSize) || 11))}px`)
  root.style.setProperty('--status-weather-font-size', `${Math.max(10, Math.min(28, Number(settings.statusWeatherFontSize) || 15))}px`)
  root.style.setProperty('--countdown-font-size', `${Math.max(12, Math.min(40, Number(settings.countdownFontSize) || 22))}px`)
  if (settings.quoteTextColor) root.style.setProperty('--quote-text-color', settings.quoteTextColor)
  else root.style.removeProperty('--quote-text-color')
  if (settings.quoteAuthorColor) root.style.setProperty('--quote-author-color', settings.quoteAuthorColor)
  else root.style.removeProperty('--quote-author-color')
  if (settings.statusWeatherColor) root.style.setProperty('--status-weather-color', settings.statusWeatherColor)
  else root.style.removeProperty('--status-weather-color')
  if (settings.taskWidgetColor) root.style.setProperty('--task-widget-color', settings.taskWidgetColor)
  else root.style.removeProperty('--task-widget-color')
  if (settings.taskWidgetAccentColor) root.style.setProperty('--task-widget-accent-color', settings.taskWidgetAccentColor)
  else root.style.removeProperty('--task-widget-accent-color')
  root.style.setProperty('--homework-status-ongoing-color', settings.homeworkStatusOngoingColor || '#1a8a1a')
  root.style.setProperty('--homework-status-upcoming-color', settings.homeworkStatusUpcomingColor || '#c87a00')
  if (settings.homeworkStatusEndedColor) root.style.setProperty('--homework-status-ended-color', settings.homeworkStatusEndedColor)
  else root.style.removeProperty('--homework-status-ended-color')
  if (settings.homeworkTimeColor) root.style.setProperty('--homework-time-color', settings.homeworkTimeColor)
  else root.style.removeProperty('--homework-time-color')
  root.style.setProperty('--homework-time-font-size', `${Math.max(8, Math.min(24, Number(settings.homeworkTimeFontSize) || 10))}px`)
}

export const useSettingsStore = defineStore('settings', () => {
  const settings = reactive(readStoredSettings())
  const examModeActive = ref(false)

  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    persistDesktopValue(STORAGE_KEY, settings).catch(() => {})
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
