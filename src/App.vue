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
import { desktopWindowAction, fetchNetworkTime, getDesktopStartupArgs, initDesktopBridge, isDesktop, probeDesktop, setDesktopUriRegistration, setDesktopWindowMode } from './services/desktop'

const route = useRoute()
const router = useRouter()
const timeStore = useTimeStore()
const settingsStore = useSettingsStore()
const contentStore = useContentStore()
const weatherStore = useWeatherStore()
const quotesStore = useQuotesStore()
const controlsHidden = ref(false)
const settingsOpen = ref(false)
const desktopAvailable = ref(false)
const desktopMini = ref(false)
const desktopAutoStart = ref(false)
const fullscreenActive = ref(false)
const isSettings = computed(() => settingsOpen.value)
const purePromptOpen = ref(false)
const purePromptSeconds = ref(10)
const currentDate = computed(() => new Date(timeStore.now))
const progress = computed(() => dayProgress(currentDate.value))
const examRemaining = computed(() => Math.max(0, Math.ceil((new Date('2027-06-07T00:00:00').getTime() - timeStore.now) / 86400000)))
const featuredDay = computed(() => contentStore.content.importantDays.filter(item => new Date(`${item.date}T23:59:59`).getTime() >= timeStore.now).sort((a, b) => a.date.localeCompare(b.date))[0])
const weatherTemperature = computed(() => weatherStore.current?.temperature?.value || '--')
const weatherStatus = computed(() => weatherStore.current ? weatherStore.currentLabel : (weatherStore.error || '天气同步中'))
const taskNotice = ref('')
const taskDock = ref(null)
const taskOverflow = ref(false)
let weatherTimer
let controlsTimer
let noticeTimer
let purePromptTimer
let purePromptCountdownTimer
let showControlsHandler
let taskResizeObserver
let syncAfterVisibilityChange
let stopTaskWatch
let stopDesktopBridge
let timeSyncTimer
let stopRightClick
const navItems = [
  { path: '/clock', label: '时钟', icon: 'clock-20-regular' },
  { path: '/countdown', label: '倒计时', icon: 'timer-20-regular' },
  { path: '/timer', label: '计时器', icon: 'arrow-clockwise-20-regular' }
]
const activeTaskCount = computed(() => timeStore.activeCountdowns.length + timeStore.activeTimers.length)

function updateTaskOverflow() {
  const element = taskDock.value
  if (!element) {
    taskOverflow.value = false
    return
  }
  const cardWidth = window.matchMedia('(max-width: 620px)').matches ? 145 : 168
  const gap = 8
  taskOverflow.value = activeTaskCount.value * cardWidth + Math.max(0, activeTaskCount.value - 1) * gap > element.clientWidth
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
      fullscreenActive.value = false
    } else {
      await setDesktopWindowMode('full')
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
function maximizeWindow() {
  if (desktopMini.value) {
    desktopMini.value = false
    window.__cytimeMiniMode = false
    setDesktopWindowMode('normal')
  } else desktopWindowAction('maximize')
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

let audioContext
function prepareAudio() {
  if (typeof AudioContext === 'undefined') return
  audioContext ||= new AudioContext()
  audioContext.resume?.()
}

function playTone(frequency, duration, delay = 0, volume = 0.08, type = 'sine') {
  try {
    prepareAudio()
    if (!audioContext) return
    const start = audioContext.currentTime + delay
    const oscillator = audioContext.createOscillator()
    const gain = audioContext.createGain()
    oscillator.frequency.value = frequency
    oscillator.type = type
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
    oscillator.connect(gain).connect(audioContext.destination)
    oscillator.start(start)
    oscillator.stop(start + duration + 0.02)
  } catch {}
}

function showTaskNotice(message) {
  taskNotice.value = message
  window.clearTimeout(noticeTimer)
  noticeTimer = window.setTimeout(() => { taskNotice.value = '' }, 4500)
}

function onCountdownWarning(event) {
  const { task, seconds } = event.detail || {}
  if (settingsStore.settings.soundEnabled) {
    playTone(880, 0.08, 0, 0.06)
    playTone(1320, 0.06, 0.04, 0.035)
  }
  navigator.vibrate?.(80)
  notifyTask('CyTime 倒计时提醒', `${task?.label || '倒计时'} 还剩 ${seconds} 秒`)
  showTaskNotice(`${task?.label || '倒计时'} · ${seconds} 秒`)
}

function onCountdownComplete(event) {
  const task = event.detail?.task
  if (settingsStore.settings.soundEnabled) {
    playTone(523.25, 0.16, 0, 0.08)
    playTone(659.25, 0.22, 0.12, 0.07)
    playTone(783.99, 0.3, 0.25, 0.06)
  }
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
  const startedAt = Date.now()
  try {
    const serverTime = await fetchNetworkTime()
    const midpoint = startedAt + (Date.now() - startedAt) / 2
    timeStore.setClockOffset(serverTime - midpoint)
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
  window.__cytimeMiniMode = desktopMini.value
  try { await setDesktopUriRegistration(settingsStore.settings.uriRegistration) } catch {}
  await setDesktopWindowMode(mode, !desktopAutoStart.value || Boolean(uriMode))
}

watch(() => [settingsStore.settings.weatherCityNum, settingsStore.settings.showWeather], ([cityNum, visible]) => {
  if (visible) weatherStore.refresh(cityNum, true)
})
watch(() => settingsStore.settings.preventSleep, syncWakeLock)
watch(() => [settingsStore.settings.timeSyncEnabled, settingsStore.settings.timeSyncInterval], () => {
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
  syncWakeLock()
  window.setTimeout(schedulePurePrompt, 550)
})
onUnmounted(() => {
  timeStore.stop()
  quotesStore.stop()
  window.clearInterval(weatherTimer)
  window.clearInterval(timeSyncTimer)
  window.clearTimeout(controlsTimer)
  window.removeEventListener('cytime:countdown-warning', onCountdownWarning)
  window.removeEventListener('cytime:countdown-complete', onCountdownComplete)
  document.removeEventListener('visibilitychange', syncAfterVisibilityChange)
  window.removeEventListener('focus', syncAfterVisibilityChange)
  taskResizeObserver?.disconnect()
  stopTaskWatch?.()
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
  <div class="app-root" :class="{ 'is-desktop': desktopAvailable }">
    <div v-if="desktopAvailable" class="app-titlebar" role="banner"><div class="app-titlebar-drag" data-tauri-drag-region><span>CyTime 昔时时钟</span></div><div class="app-titlebar-controls"><button type="button" aria-label="最小化" @click="minimizeWindow"><FluentIcon icon="subtract-16-regular" :width="16" /></button><button type="button" aria-label="最大化或解锁 Mini 模式" @click="maximizeWindow"><FluentIcon icon="maximize-16-regular" :width="16" /></button><button type="button" aria-label="关闭窗口" @click="closeWindow"><FluentIcon icon="dismiss-16-regular" :width="16" /></button></div></div>
    <div class="app-shell" :class="{ 'settings-shell': isSettings, 'controls-hidden': controlsHidden, 'exam-mode': settingsStore.examModeActive, 'mini-mode': desktopMini }">
    <header v-if="!isSettings && !settingsStore.examModeActive" class="status-dock" aria-label="状态信息">
      <div v-if="settingsStore.settings.showWeather" class="status-weather"><strong>{{ weatherTemperature }}°</strong><FluentIcon icon="weather-partly-cloudy-day-20-regular" :width="18" /><span>{{ weatherStatus }}</span></div>
      <div v-if="settingsStore.settings.showDayProgress" class="status-progress"><span>今日进度</span><div class="status-progress-bar"><i :style="{ width: `${progress}%` }"></i></div><strong>{{ progress.toFixed(0) }}%</strong></div>
      <div v-if="settingsStore.settings.showImportantDays" class="status-exam"><span>距离 {{ featuredDay?.name || '重要日' }}仅</span><strong>{{ featuredDay ? Math.max(0, Math.ceil((new Date(`${featuredDay.date}T00:00:00`).getTime() - timeStore.now) / 86400000)) : examRemaining }}</strong><span>天</span></div>
    </header>
    <nav v-if="!isSettings" class="mode-nav" aria-label="模式切换">
      <RouterLink v-for="item in navItems" :key="item.path" :to="item.path" :class="{ active: route.path === item.path }"><FluentIcon :icon="item.icon" :width="17" /><span>{{ item.label }}</span></RouterLink>
    </nav>
    <main class="clock-stage" :class="{ 'is-settings-background': isSettings }"><RouterView v-slot="{ Component }"><Transition name="page" mode="out-in"><component :is="Component" /></Transition></RouterView></main>
    <template v-if="!isSettings">
      <footer class="clock-footer">
        <button type="button" class="footer-action footer-settings" aria-label="设置" @click="openSettings"><FluentIcon icon="settings-20-regular" :width="19" /></button>
        <div class="footer-center-actions"><button type="button" class="footer-action" :aria-label="fullscreenActive ? '退出全屏' : '全屏'" @click="toggleFullscreen"><FluentIcon :icon="fullscreenActive ? 'full-screen-minimize-20-regular' : 'full-screen-maximize-20-regular'" :width="19" /><span>{{ fullscreenActive ? '退出全屏' : '全屏' }}</span></button><button type="button" class="footer-action" :aria-label="settingsStore.examModeActive ? '退出纯净模式' : '纯净/考试模式'" @click="settingsStore.examModeActive ? exitExamMode() : schedulePurePrompt()"><FluentIcon :icon="settingsStore.examModeActive ? 'eye-20-filled' : 'eye-off-20-regular'" :width="19" /><span>{{ settingsStore.examModeActive ? '退出纯净' : '纯净模式' }}</span></button></div>
      </footer>
      <a class="app-signature" href="https://github.com/Cyrene2008/CyTime" target="_blank" rel="noreferrer">v26.0.1 by Cyrene2008</a>
      <div v-if="activeTaskCount && !settingsStore.examModeActive" ref="taskDock" class="task-docks" :class="{ 'is-marquee': taskOverflow }"><div class="task-docks-track"><template v-for="copy in taskOverflow ? 2 : 1" :key="copy"><RouterLink v-for="task in timeStore.activeCountdowns" :key="`${copy}-${task.id}`" to="/countdown" class="task-widget task-widget-countdown" @click="timeStore.selectCountdown(task)"><span class="task-dot pink"></span><span>{{ task.label }}</span><strong>{{ formatDuration(countdownRemaining(task)) }}</strong></RouterLink><RouterLink v-for="task in timeStore.activeTimers" :key="`${copy}-${task.id}-timer`" to="/timer" class="task-widget task-widget-timer" @click="timeStore.selectTimer(task)"><span class="task-dot green"></span><span>{{ task.label }}</span><strong>{{ formatDuration(timeStore.timerElapsed(task)) }}</strong></RouterLink></template></div></div>
      <div v-if="taskNotice" class="task-notice" role="status" aria-live="assertive">{{ taskNotice }}</div>
      <div v-if="purePromptOpen" class="pure-prompt-layer" role="dialog" aria-modal="false" aria-label="纯净考试模式提示"><div class="pure-prompt-card"><h2>是否进入纯净模式(考试模式)</h2><p>该模式下仅显示当前时间，隐藏其他内容。可以点击界面上的退出纯净/考试模式按钮退出，也可点击进入纯净/考试模式按钮进入。</p><div class="pure-prompt-actions"><button type="button" class="subtle-button" @click="closePurePrompt">不了 ({{ purePromptSeconds }}s)</button><button type="button" class="save-button" @click="enterExamMode">进入</button></div></div></div>
    </template>
    <Transition name="settings-overlay"><div v-if="isSettings" class="settings-overlay"><div class="settings-scrim" @click="closeSettings"></div><SettingsView :desktop-available="desktopAvailable" @close="closeSettings" /></div></Transition>
    </div>
  </div>
</template>
