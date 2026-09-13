<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import SettingsView from './views/SettingsView.vue'
import { useTimeStore } from './stores/time'
import { useSettingsStore } from './stores/settings'
import { useContentStore } from './stores/content'
import { useWeatherStore } from './stores/weather'
import { useQuotesStore } from './stores/quotes'
import { dayProgress, formatDuration } from './utils/time'
import { parseCountdownTarget } from './utils/time'
import { FILING_NAME, FILING_URL } from './config/branding'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { desktopWindowAction, getDesktopStartupArgs, initDesktopBridge, isDesktop, probeDesktop, setDesktopUriRegistration, setDesktopWindowMode } from './services/desktop'
import { fetchNetworkTime } from './services/timeSync'
import { locateWeatherCity } from './services/weather'

const route = useRoute()
const router = useRouter()
const timeStore = useTimeStore()
const settingsStore = useSettingsStore()
const contentStore = useContentStore()
const weatherStore = useWeatherStore()
const quotesStore = useQuotesStore()
const controlsHidden = ref(false)
const settingsOpen = ref(false)
const appVersion = __APP_VERSION__
const buildId = __BUILD_ID__
const desktopAvailable = ref(false)
const desktopMini = ref(false)
const desktopWindowMode = ref('normal')
const desktopAutoStart = ref(false)
const fullscreenActive = ref(false)
const isSettings = computed(() => settingsOpen.value)
const purePromptOpen = ref(false)
const purePromptSeconds = ref(10)
const currentDate = computed(() => new Date(timeStore.now))
const progress = computed(() => dayProgress(currentDate.value))
const examRemaining = computed(() => Math.max(0, Math.ceil((new Date('2027-06-07T00:00:00').getTime() - timeStore.now) / 86400000)))
const upcomingDays = computed(() => contentStore.content.importantDays.filter(item => new Date(`${item.date}T23:59:59`).getTime() >= timeStore.now).sort((a, b) => a.date.localeCompare(b.date)))
const dayRotation = ref(0)
const featuredDay = computed(() => upcomingDays.value.length ? upcomingDays.value[dayRotation.value % upcomingDays.value.length] : null)
const featuredDayRemaining = computed(() => featuredDay.value ? Math.max(0, Math.ceil((new Date(`${featuredDay.value.date}T00:00:00`).getTime() - timeStore.now) / 86400000)) : examRemaining.value)
const weatherTemperature = computed(() => weatherStore.current?.temperature?.value || '--')
const weatherStatus = computed(() => weatherStore.current ? weatherStore.currentLabel : (weatherStore.error || '天气同步中'))
const taskNotice = ref('')
const taskDock = ref(null)
const taskOverflow = ref(false)
const shellRef = ref(null)
const statusDockRef = ref(null)
const navRef = ref(null)
let weatherTimer
let controlsTimer
let noticeTimer
let purePromptTimer
let purePromptCountdownTimer
let dayRotationTimer
let showControlsHandler
let taskResizeObserver
let safeAreaObserver
let syncAfterVisibilityChange
let stopTaskWatch
let stopSafeAreaWatch
let stopDesktopBridge
let timeSyncTimer
let stopRightClick
const navItems = [
  { path: '/clock', label: '时钟', icon: 'clock-20-regular' },
  { path: '/countdown', label: '倒计时', icon: 'timer-20-regular' },
  { path: '/timer', label: '计时器', icon: 'arrow-clockwise-20-regular' }
]
const activeTaskCount = computed(() => timeStore.activeCountdowns.length + timeStore.activeTimers.length)
const sideLayoutQuery = typeof window === 'undefined' ? null : window.matchMedia('(min-width: 621px)')
const homeworkVisible = computed(() => settingsStore.settings.showHomework && !settingsStore.examModeActive && !(desktopAvailable.value && ['normal', 'mini'].includes(desktopWindowMode.value)))
const taskSide = computed(() => homeworkVisible.value && settingsStore.settings.homeworkPosition === 'right' ? 'left' : 'right')

function updateTaskOverflow() {
  const element = taskDock.value
  if (!element) {
    taskOverflow.value = false
    return
  }
  if (sideLayoutQuery?.matches) {
    taskOverflow.value = false
    return
  }
  const cardWidth = window.matchMedia('(max-width: 620px)').matches ? 145 : 168
  const gap = 8
  taskOverflow.value = activeTaskCount.value * cardWidth + Math.max(0, activeTaskCount.value - 1) * gap > element.clientWidth
}

function syncContentSafeTop() {
  const shell = shellRef.value
  if (!shell) return
  const shellRect = shell.getBoundingClientRect()
  const scale = shell.offsetWidth ? shellRect.width / shell.offsetWidth : 1
  const bottomOf = element => {
    if (!element) return 0
    if (settingsStore.examModeActive && element === navRef.value) return 0
    return (element.getBoundingClientRect().bottom - shellRect.top) / scale
  }
  const safeTop = Math.max(bottomOf(statusDockRef.value), bottomOf(navRef.value))
  shell.style.setProperty('--content-safe-top', `${Math.max(0, Math.ceil(safeTop + 10))}px`)
  shell.style.setProperty('--nav-safe-top', `${Math.ceil(bottomOf(statusDockRef.value) + 12)}px`)
  if (statusDockRef.value) {
    const dockWidth = statusDockRef.value.offsetWidth
    const maxScale = dockWidth > 0 ? shell.offsetWidth / dockWidth : 1
    const userScale = (Number(settingsStore.settings.statusDockScale) || 100) / 100
    shell.style.setProperty('--status-dock-scale', String(Math.min(userScale, maxScale)))
  }
}

function observeSafeAreas() {
  safeAreaObserver?.disconnect()
  for (const element of [statusDockRef.value, navRef.value]) if (element) safeAreaObserver?.observe(element)
  syncContentSafeTop()
}
function countdownRemaining(task) {
  return task?.status === 'paused' ? Math.ceil(task.pausedRemaining / 1000) : Math.max(0, Math.ceil((task.targetAt - timeStore.now) / 1000))
}

async function toggleFullscreen() {
  if (isDesktop()) {
    desktopMini.value = false
    window.__cytimeMiniMode = false
    if (fullscreenActive.value) {
      await setDesktopWindowMode('normal')
      desktopWindowMode.value = 'normal'
      fullscreenActive.value = false
    } else {
      await setDesktopWindowMode('full')
      desktopWindowMode.value = 'full'
      fullscreenActive.value = true
    }
    return
  }
  if (document.fullscreenElement) await document.exitFullscreen()
  else await document.documentElement.requestFullscreen?.()
  fullscreenActive.value = Boolean(document.fullscreenElement)
}

function minimizeWindow() { desktopWindowAction('minimize') }
function closeWindow() { desktopWindowAction('close') }
function startDrag(event) {
  if (!isDesktop() || event.buttons !== 1) return
  event.preventDefault()
  getCurrentWindow().startDragging().catch(() => {})
}
function maximizeWindow() {
  if (desktopMini.value) {
    desktopMini.value = false
    window.__cytimeMiniMode = false
    setDesktopWindowMode('normal')
    desktopWindowMode.value = 'normal'
  } else { desktopWindowAction('maximize'); desktopWindowMode.value = 'max' }
}

function openSettings() {
  settingsOpen.value = true
  window.__cytimeShowControls?.()
}

function closeSettings() {
  settingsOpen.value = false
}

function handleDesktopUri(rawUri) {
  if (!settingsStore.settings.uriRegistration) return
  try {
    const uri = new URL(String(rawUri))
    const mode = uri.searchParams.get('mode')
    if (mode && ['mini', 'normal', 'max', 'full'].includes(mode)) {
      desktopMini.value = mode === 'mini'
      fullscreenActive.value = mode === 'full'
      desktopWindowMode.value = mode
      window.__cytimeMiniMode = desktopMini.value
      setDesktopWindowMode(mode)
    }
    if (isDesktop()) desktopWindowAction('show')
    const page = uri.hostname === 'page' ? uri.pathname.replace(/^\//, '') : ''
    if (page === 'time') router.push('/clock')
    else if (['countdown', 'timer'].includes(page)) router.push(`/${page}`)
    else if (uri.hostname === 'countdown') {
      const targetInput = uri.searchParams.get('target')
      const length = Number(uri.searchParams.get('length'))
      const targetAt = targetInput ? parseCountdownTarget(targetInput, new Date(timeStore.now)) : length > 0 ? timeStore.now + length * 1000 : null
      if (targetAt) timeStore.addCountdown('', targetAt)
      router.push('/countdown')
    } else if (uri.hostname === 'task' && uri.pathname.startsWith('/countdown')) {
      const task = timeStore.countdowns.find(item => item.id === timeStore.selectedCountdownId) || timeStore.activeCountdowns[0]
      if (task) {
        if (uri.pathname.endsWith('/pause')) timeStore.pauseCountdown(task)
        else if (uri.pathname.endsWith('/continue')) timeStore.resumeCountdown(task)
        else if (uri.pathname.endsWith('/stop')) timeStore.stopCountdown(task)
      }
    }
  } catch {}
}

const countdownHandlers = {
  warning: onCountdownWarning,
  complete: onCountdownComplete,
  stop() {
    window.removeEventListener('cytime:countdown-warning', countdownHandlers.warning)
    window.removeEventListener('cytime:countdown-complete', countdownHandlers.complete)
  }
}

let audioContext
function prepareAudio() {
  if (typeof AudioContext === 'undefined') return
  audioContext ||= new AudioContext()
  audioContext.resume?.()
}

// 《昔涟》简谱（1=♭B，4/4）：曾(3)1 许(1)0.5 下(5)1 心(6)0.5 愿(4)1 | 等待(2 3) | 你(4·) 的出现(3 2 3 –)
const JIANPU = { 1: 466.16, 2: 523.25, 3: 587.33, 4: 622.25, 5: 698.46, 6: 783.99, 7: 880.0 }
const COMPLETION_MELODY = [
  [3, 0.5], [1, 0.25], [5, 0.75], [6, 0.25], [4, 1.75],
  [2, 0.25], [3, 0.25],
  [4, 1.5],
  [3, 0.25], [2, 0.25], [3, 1.75]
]

function playCompletionMelody() {
  const beat = 0.74
  let at = 0
  COMPLETION_MELODY.forEach(([note, beats], index) => {
    const duration = beats * beat
    if (note) playBell(JIANPU[note], at, index % 2 ? 0.038 : 0.046, Math.max(0.16, Math.min(0.8, duration * 0.95)))
    at += duration
  })
}

function playBell(frequency, delay = 0, volume = 0.05, duration = 0.9) {
  try {
    prepareAudio()
    if (!audioContext) return
    const start = audioContext.currentTime + delay
    const master = audioContext.createGain()
    const filter = audioContext.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = Math.min(9000, frequency * 6)
    master.gain.setValueAtTime(0.0001, start)
    master.gain.exponentialRampToValueAtTime(volume, start + 0.012)
    master.gain.exponentialRampToValueAtTime(0.0001, start + duration)
    master.connect(filter).connect(audioContext.destination)
    for (const [ratio, level, decay] of [[1, 1, duration], [2.02, 0.26, duration * 0.58], [3.01, 0.07, duration * 0.36]]) {
      const oscillator = audioContext.createOscillator()
      const gain = audioContext.createGain()
      oscillator.type = 'sine'
      oscillator.frequency.value = frequency * ratio
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(level, start + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + decay)
      oscillator.connect(gain).connect(master)
      oscillator.start(start)
      oscillator.stop(start + decay + 0.05)
    }
  } catch {}
}

function showTaskNotice(message) {
  taskNotice.value = message
  window.clearTimeout(noticeTimer)
  noticeTimer = window.setTimeout(() => { taskNotice.value = '' }, 4500)
}

function onCountdownWarning(event) {
  const { task, seconds } = event.detail || {}
  if (settingsStore.settings.soundEnabled) playBell(1567.98, 0, 0.032, 0.22)
  navigator.vibrate?.(80)
  notifyTask('CyTime 倒计时提醒', `${task?.label || '倒计时'} 还剩 ${seconds} 秒`)
  showTaskNotice(`${task?.label || '倒计时'} · ${seconds} 秒`)
}

function onCountdownComplete(event) {
  const task = event.detail?.task
  if (settingsStore.settings.soundEnabled) playCompletionMelody()
  navigator.vibrate?.([120, 80, 180])
  notifyTask('CyTime 倒计时结束', `${task?.label || '倒计时'} 已结束`)
  showTaskNotice(`${task?.label || '倒计时'} 已结束`)
}

let wakeLock
async function syncWakeLock() {
  if (!settingsStore.settings.preventSleep || !navigator.wakeLock || document.visibilityState !== 'visible') {
    if (wakeLock) await wakeLock.release().catch(() => {})
    wakeLock = undefined
    return
  }
  try { wakeLock = await navigator.wakeLock.request('screen') } catch {}
}

function notifyTask(title, body) {
  if (!settingsStore.settings.notificationEnabled || typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  try { new Notification(title, { body, tag: 'cytime-countdown' }) } catch {}
}

function closePurePrompt() {
  purePromptOpen.value = false
  window.clearTimeout(purePromptTimer)
  window.clearInterval(purePromptCountdownTimer)
}

function schedulePurePrompt() {
  if (isSettings.value || settingsStore.examModeActive) return
  closePurePrompt()
  purePromptSeconds.value = 10
  purePromptOpen.value = true
  purePromptTimer = window.setTimeout(closePurePrompt, 10000)
  purePromptCountdownTimer = window.setInterval(() => {
    purePromptSeconds.value = Math.max(0, purePromptSeconds.value - 1)
  }, 1000)
}

function enterExamMode() {
  closePurePrompt()
  settingsStore.setExamMode(true)
}

function exitExamMode() {
  settingsStore.setExamMode(false)
}

async function syncNetworkTime() {
  if (!settingsStore.settings.timeSyncEnabled) return
  const source = settingsStore.settings.timeSyncSource || 'auto'
  if (source === 'system') {
    timeStore.setClockOffset(0)
    return
  }
  const startedAt = Date.now()
  try {
    const serverTime = await fetchNetworkTime(source)
    const midpoint = startedAt + (Date.now() - startedAt) / 2
    timeStore.setClockOffset(serverTime - midpoint)
  } catch {}
}

async function autoLocateWeather() {
  const { weatherAutoLocated, weatherCityNum, showWeather } = settingsStore.settings
  if (!showWeather || weatherAutoLocated) return
  if (weatherCityNum && weatherCityNum !== '101010100') return
  try {
    const located = await locateWeatherCity()
    settingsStore.update({ weatherCityName: located.name, weatherCityNum: located.num, weatherAutoLocated: true })
  } catch {}
}

async function initializeDesktopWindow() {
  if (!isDesktop()) return
  const args = await getDesktopStartupArgs()
  desktopAutoStart.value = args.includes('--cyrene-auto-start')
  const uriMode = settingsStore.settings.uriRegistration ? args.find(argument => argument.startsWith('cytime://'))?.match(/[?&]mode=(mini|normal|max|full)/)?.[1] : undefined
  const mode = uriMode || settingsStore.settings.startupWindowMode || 'normal'
  desktopMini.value = mode === 'mini'
  fullscreenActive.value = mode === 'full'
  desktopWindowMode.value = mode
  window.__cytimeMiniMode = desktopMini.value
  try { await setDesktopUriRegistration(settingsStore.settings.uriRegistration) } catch {}
  await setDesktopWindowMode(mode, !desktopAutoStart.value || Boolean(uriMode))
}

watch(() => [settingsStore.settings.weatherCityNum, settingsStore.settings.showWeather], ([cityNum, visible]) => {
  if (visible) weatherStore.refresh(cityNum, true)
})
watch(() => settingsStore.settings.preventSleep, syncWakeLock)
watch(() => [settingsStore.settings.timeSyncEnabled, settingsStore.settings.timeSyncSource, settingsStore.settings.timeSyncInterval], () => {
  window.clearInterval(timeSyncTimer)
  if (settingsStore.settings.timeSyncEnabled) {
    syncNetworkTime()
    timeSyncTimer = window.setInterval(syncNetworkTime, Math.max(5, Number(settingsStore.settings.timeSyncInterval) || 60) * 60 * 1000)
  }
})
watch(isSettings, open => { if (!open) window.setTimeout(schedulePurePrompt, 180) })

onMounted(async () => {
  desktopAvailable.value = await probeDesktop()
  settingsStore.setExamMode(false)
  if (settingsStore.settings.showWeather) weatherStore.refresh(settingsStore.settings.weatherCityNum)
  autoLocateWeather()
  dayRotationTimer = window.setInterval(() => { if (upcomingDays.value.length > 1) dayRotation.value = (dayRotation.value + 1) % upcomingDays.value.length }, 15000)
  weatherTimer = window.setInterval(() => { if (settingsStore.settings.showWeather) weatherStore.refresh(settingsStore.settings.weatherCityNum, true) }, 30 * 60 * 1000)
  showControlsHandler = () => {
    prepareAudio()
    controlsHidden.value = false
    window.clearTimeout(controlsTimer)
    controlsTimer = window.setTimeout(() => { controlsHidden.value = true }, 10000)
  }
  window.addEventListener('pointermove', showControlsHandler, { passive: true })
  window.addEventListener('pointerdown', showControlsHandler, { passive: true })
  window.addEventListener('keydown', showControlsHandler)
  window.__cytimeCountdownHandlers?.stop?.()
  window.__cytimeCountdownHandlers = countdownHandlers
  window.addEventListener('cytime:countdown-warning', onCountdownWarning)
  window.addEventListener('cytime:countdown-complete', onCountdownComplete)
  syncAfterVisibilityChange = () => {
    syncWakeLock()
    timeStore.sync()
  }
  document.addEventListener('visibilitychange', syncAfterVisibilityChange)
  window.addEventListener('focus', syncAfterVisibilityChange)
  initializeDesktopWindow()
  stopRightClick = event => event.preventDefault()
  document.addEventListener('contextmenu', stopRightClick)
  document.oncontextmenu = () => false
  document.addEventListener('fullscreenchange', () => { fullscreenActive.value = Boolean(document.fullscreenElement) })
  timeStore.start()
  if (settingsStore.settings.timeSyncEnabled) {
    syncNetworkTime()
    timeSyncTimer = window.setInterval(syncNetworkTime, Math.max(5, Number(settingsStore.settings.timeSyncInterval) || 60) * 60 * 1000)
  }
  initDesktopBridge(handleDesktopUri).then(stop => { stopDesktopBridge = stop })
  quotesStore.start()
  showControlsHandler()
  window.__cytimeShowControls = showControlsHandler
  taskResizeObserver = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(updateTaskOverflow)
  stopTaskWatch = watch([activeTaskCount, () => settingsStore.examModeActive], async () => {
    await nextTick()
    taskResizeObserver?.disconnect()
    if (taskDock.value) taskResizeObserver?.observe(taskDock.value)
    updateTaskOverflow()
  })
  nextTick(() => {
    if (taskDock.value) taskResizeObserver?.observe(taskDock.value)
    updateTaskOverflow()
  })
  safeAreaObserver = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(syncContentSafeTop)
  window.addEventListener('resize', syncContentSafeTop)
  sideLayoutQuery?.addEventListener('change', updateTaskOverflow)
  stopSafeAreaWatch = watch([isSettings, () => settingsStore.examModeActive, () => settingsStore.settings.statusDockScale, () => settingsStore.settings.statusDockOffsetY, () => settingsStore.settings.uiScale], async () => {
    await nextTick()
    observeSafeAreas()
  })
  nextTick(observeSafeAreas)
  syncWakeLock()
  window.setTimeout(schedulePurePrompt, 550)
})
onUnmounted(() => {
  timeStore.stop()
  quotesStore.stop()
  window.clearInterval(weatherTimer)
  window.clearInterval(timeSyncTimer)
  window.clearInterval(dayRotationTimer)
  window.clearTimeout(controlsTimer)
  if (window.__cytimeCountdownHandlers === countdownHandlers) {
    countdownHandlers.stop()
    delete window.__cytimeCountdownHandlers
  }
  document.removeEventListener('visibilitychange', syncAfterVisibilityChange)
  window.removeEventListener('focus', syncAfterVisibilityChange)
  window.removeEventListener('resize', syncContentSafeTop)
  sideLayoutQuery?.removeEventListener('change', updateTaskOverflow)
  taskResizeObserver?.disconnect()
  safeAreaObserver?.disconnect()
  stopTaskWatch?.()
  stopSafeAreaWatch?.()
  stopDesktopBridge?.()
  window.clearTimeout(noticeTimer)
  closePurePrompt()
  if (showControlsHandler) {
    window.removeEventListener('pointermove', showControlsHandler)
    window.removeEventListener('pointerdown', showControlsHandler)
    window.removeEventListener('keydown', showControlsHandler)
  }
  if (stopRightClick) document.removeEventListener('contextmenu', stopRightClick)
  document.oncontextmenu = null
  delete window.__cytimeShowControls
})
</script>

<template>
  <div class="app-root" :class="{ 'is-desktop': desktopAvailable, 'titlebar-hidden': desktopAvailable && fullscreenActive }">
    <div v-if="desktopAvailable" class="app-titlebar" role="banner"><div class="app-titlebar-drag" @mousedown="startDrag"><span>CyTime 昔时时钟</span></div><div class="app-titlebar-controls"><button type="button" aria-label="最小化" @click="minimizeWindow"><FluentIcon icon="subtract-16-regular" :width="16" /></button><button type="button" aria-label="最大化或解锁 Mini 模式" @click="maximizeWindow"><FluentIcon icon="maximize-16-regular" :width="16" /></button><button type="button" aria-label="关闭窗口" @click="closeWindow"><FluentIcon icon="dismiss-16-regular" :width="16" /></button></div></div>
    <div class="app-shell" ref="shellRef" :class="{ 'settings-shell': isSettings, 'controls-hidden': controlsHidden, 'exam-mode': settingsStore.examModeActive, 'mini-mode': desktopMini, [`window-mode-${desktopWindowMode}`]: desktopAvailable }">
    <header v-if="!isSettings && !settingsStore.examModeActive" ref="statusDockRef" class="status-dock" aria-label="状态信息">
      <div v-if="settingsStore.settings.showWeather" class="status-weather"><strong>{{ weatherTemperature }}°</strong><FluentIcon icon="weather-partly-cloudy-day-20-regular" :width="18" /><span>{{ weatherStatus }}</span></div>
      <div v-if="settingsStore.settings.showDayProgress" class="status-progress"><span>今日进度</span><div class="status-progress-bar"><i :style="{ width: `${progress}%` }"></i></div><strong>{{ progress.toFixed(0) }}%</strong></div>
      <div v-if="settingsStore.settings.showImportantDays" class="status-exam"><span>距离 <Transition name="status-swap" mode="out-in"><b :key="featuredDay?.id || 'fallback'" class="status-day-name">{{ featuredDay?.name || '重要日' }}</b></Transition>仅</span><strong>{{ featuredDayRemaining }}</strong><span>天</span></div>
    </header>
    <nav v-if="!isSettings" ref="navRef" class="mode-nav" aria-label="模式切换">
      <RouterLink v-for="item in navItems" :key="item.path" :to="item.path" :class="{ active: route.path === item.path }"><FluentIcon :icon="item.icon" :width="17" /><span>{{ item.label }}</span></RouterLink>
    </nav>
    <main class="clock-stage" :class="{ 'is-settings-background': isSettings }"><RouterView v-slot="{ Component }"><Transition name="page" mode="out-in"><component :is="Component" /></Transition></RouterView></main>
    <template v-if="!isSettings">
      <footer class="clock-footer">
        <button type="button" class="footer-action footer-settings" aria-label="设置" @click="openSettings"><FluentIcon icon="settings-20-regular" :width="19" /></button>
        <div class="footer-center-actions"><button type="button" class="footer-action" :aria-label="fullscreenActive ? '退出全屏' : '全屏'" @click="toggleFullscreen"><FluentIcon :icon="fullscreenActive ? 'full-screen-minimize-20-regular' : 'full-screen-maximize-20-regular'" :width="19" /><span>{{ fullscreenActive ? '退出全屏' : '全屏' }}</span></button><button type="button" class="footer-action" :aria-label="settingsStore.examModeActive ? '退出纯净模式' : '纯净/考试模式'" @click="settingsStore.examModeActive ? exitExamMode() : schedulePurePrompt()"><FluentIcon :icon="settingsStore.examModeActive ? 'eye-20-filled' : 'eye-off-20-regular'" :width="19" /><span>{{ settingsStore.examModeActive ? '退出纯净' : '纯净模式' }}</span></button></div>
      </footer>
      <div class="app-meta">
        <a class="app-signature" href="https://github.com/Cyrene2008/CyTime" target="_blank" rel="noreferrer">v{{ appVersion }}<span v-if="buildId"> (build {{ buildId }})</span> by Cyrene2008</a>
        <a v-if="FILING_NAME" class="app-filing" :href="FILING_URL" target="_blank" rel="noreferrer">{{ FILING_NAME }}</a>
      </div>
      <div v-if="activeTaskCount && !settingsStore.examModeActive" ref="taskDock" class="task-docks" :class="['is-side', `task-docks-${taskSide}`, { 'is-marquee': taskOverflow }]"><div class="task-docks-track"><template v-for="copy in taskOverflow ? 2 : 1" :key="copy"><RouterLink v-for="task in timeStore.activeCountdowns" :key="`${copy}-${task.id}`" to="/countdown" class="task-widget task-widget-countdown" @click="timeStore.selectCountdown(task)"><span class="task-dot pink"></span><span>{{ task.label }}</span><strong>{{ formatDuration(countdownRemaining(task)) }}</strong></RouterLink><RouterLink v-for="task in timeStore.activeTimers" :key="`${copy}-${task.id}-timer`" to="/timer" class="task-widget task-widget-timer" @click="timeStore.selectTimer(task)"><span class="task-dot green"></span><span>{{ task.label }}</span><strong>{{ formatDuration(timeStore.timerElapsed(task)) }}</strong></RouterLink></template></div></div>
      <div v-if="taskNotice" class="task-notice" role="status" aria-live="assertive">{{ taskNotice }}</div>
      <div v-if="purePromptOpen" class="pure-prompt-layer" role="dialog" aria-modal="false" aria-label="纯净考试模式提示"><div class="pure-prompt-card"><h2>是否进入纯净模式(考试模式)</h2><p>该模式下仅显示当前时间，隐藏其他内容。可以点击界面上的退出纯净/考试模式按钮退出，也可点击进入纯净/考试模式按钮进入。</p><div class="pure-prompt-actions"><button type="button" class="subtle-button" @click="closePurePrompt">不了 ({{ purePromptSeconds }}s)</button><button type="button" class="save-button" @click="enterExamMode">进入</button></div></div></div>
    </template>
    <Transition name="settings-overlay"><div v-if="isSettings" class="settings-overlay"><div class="settings-scrim" @click="closeSettings"></div><SettingsView :desktop-available="desktopAvailable" @close="closeSettings" /></div></Transition>
    </div>
  </div>
</template>
