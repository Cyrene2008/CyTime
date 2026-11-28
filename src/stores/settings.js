import { reactive, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { persistDesktopValue } from '../services/desktop.js'
import { createBatchedPersist } from '../services/persistence.js'
import { defaultQuoteApiEndpoint, migrateQuoteSettings, normalizeQuoteEndpoint, quoteApiRevision } from '../services/quoteEndpoints.js'

const STORAGE_KEY = 'cytime.settings.v2'

export const defaultSettings = {
  theme: 'dark-peach',
  accentColor: '',
  swarmEffects: true,
  swarmSound: false,
  startupMode: 'time',
  startupWindowMode: 'normal',
  idleReturnTime: false,
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
  showBlackboard: true,
  blackboardPosition: 'auto',
  blackboardFontScale: 100,
  immersiveMode: false,
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
  quoteApiCategories: [],
  quoteApiEndpoint: defaultQuoteApiEndpoint,
  quoteApiRevision,
  quoteApiCategoryWeightsEnabled: false,
  quoteApiCategoryWeights: {},
  quoteLocalSources: {
    daily: { enabled: true, weight: 3 },
    flameJourney: { enabled: true, weight: 2 },
    university: { enabled: true, weight: 2 }
  },
  quoteAnimation: 'typewriter',
  quoteTypeSpeed: 'standard',
  weatherCityName: '北京',
  weatherCityNum: '101010100',
  weatherAutoLocated: false,
  fontFamily: 'wengfaluosi',
  background: 'mica',
  displayLayout: 'auto',
  clockFontScale: 11,
  dateFontSize: 15,
  quoteFontSize: 14,
  scheduleFontSize: 14,
  clockDetailScale: 100,
  quoteScale: 100,
  taskCardScale: 100,
  statusDockScale: 100,
  statusDockOffsetY: 0,
  homeworkWidth: 300,
  blackboardWidth: 290,
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
  clockTextColor: '',
  clockDetailColor: '',
  scheduleTextColor: '',
  statusTextColor: '',
  homeworkTextColor: '',
  blackboardTextColor: '',
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
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem('cytime.settings.v1')
    const parsed = JSON.parse(raw || '{}')
    const saved = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
    const base = cloneSettings(defaultSettings)
    const merged = { ...base, ...migrateQuoteSettings(saved), quoteLocalSources: { ...base.quoteLocalSources, ...(saved.quoteLocalSources || {}) } }
    if (typeof merged.swarmEffects !== 'boolean') merged.swarmEffects = base.swarmEffects
    if (typeof merged.swarmSound !== 'boolean') merged.swarmSound = base.swarmSound
    if (merged.startupMode === 'clock') merged.startupMode = 'time'
    if (!['time', 'countdown', 'timer'].includes(merged.startupMode)) merged.startupMode = 'time'
    if (!['auto', 'desktop', 'classroom'].includes(merged.displayLayout)) merged.displayLayout = 'auto'
    const migrated = Boolean(raw && (saved.quoteApiRevision !== quoteApiRevision || saved.quoteApiEndpoint !== merged.quoteApiEndpoint || 'quoteSources' in saved || 'quoteCloudSource' in saved))
    return { settings: merged, migrated }
  } catch {
    return { settings: cloneSettings(defaultSettings), migrated: false }
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
  root.dataset.immersive = settings.immersiveMode ? 'on' : 'off'

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
  for (const [name, value] of Object.entries({
    '--clock-detail-scale': settings.clockDetailScale,
    '--quote-scale': settings.quoteScale,
    '--task-card-scale': settings.taskCardScale
  })) root.style.setProperty(name, String(Math.max(70, Math.min(170, Number(value) || 100)) / 100))
  root.style.setProperty('--schedule-font-size', `${Math.max(10, Math.min(30, Number(settings.scheduleFontSize) || 14))}px`)
  root.style.setProperty('--status-dock-scale', String(Math.max(60, Math.min(150, Number(settings.statusDockScale) || 100)) / 100))
  root.style.setProperty('--status-dock-offset-y', `${Math.max(-16, Math.min(240, Number(settings.statusDockOffsetY) || 0))}px`)
  root.style.setProperty('--homework-width', `${Math.max(200, Math.min(520, Number(settings.homeworkWidth) || 300))}px`)
  root.style.setProperty('--blackboard-width', `${Math.max(200, Math.min(520, Number(settings.blackboardWidth) || 290))}px`)
  root.style.setProperty('--homework-offset-x', `${Math.max(0, Math.min(240, Number(settings.homeworkOffsetX) || 0))}px`)
  root.style.setProperty('--blackboard-font-scale', String(Math.max(70, Math.min(160, Number(settings.blackboardFontScale) || 100)) / 100))
  root.style.setProperty('--ui-scale', String(Math.max(50, Math.min(200, settings.uiScale)) / 100))
  root.style.setProperty('--widget-font-size', `${Math.max(10, Math.min(32, Number(settings.widgetFontSize) || 17))}px`)
  root.style.setProperty('--widget-label-font-size', `${Math.max(8, Math.min(20, Number(settings.widgetLabelFontSize) || 11))}px`)
  root.style.setProperty('--status-weather-font-size', `${Math.max(10, Math.min(28, Number(settings.statusWeatherFontSize) || 15))}px`)
  root.style.setProperty('--countdown-font-size', `${Math.max(12, Math.min(40, Number(settings.countdownFontSize) || 22))}px`)
  for (const [name, value] of Object.entries({
    '--clock-text-color': settings.clockTextColor,
    '--clock-detail-color': settings.clockDetailColor,
    '--schedule-text-color': settings.scheduleTextColor,
    '--status-text-color': settings.statusTextColor,
    '--homework-text-color': settings.homeworkTextColor,
    '--blackboard-text-color': settings.blackboardTextColor
  })) {
    if (typeof value === 'string' && globalThis.CSS?.supports('color', value)) root.style.setProperty(name, value)
    else root.style.removeProperty(name)
  }
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
  const stored = readStoredSettings()
  const settings = reactive(stored.settings)
  const examModeActive = ref(false)

  const persist = createBatchedPersist(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    persistDesktopValue(STORAGE_KEY, settings).catch(() => {})
  })

  function update(patch) {
    Object.assign(settings, migrateQuoteSettings({ ...patch, quoteApiEndpoint: normalizeQuoteEndpoint(patch.quoteApiEndpoint ?? settings.quoteApiEndpoint), quoteApiRevision }))
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
  if (stored.migrated) persist()

  return { settings, examModeActive, setExamMode, update, reset, exportSettings }
})
