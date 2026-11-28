<script setup>
import { computed, nextTick, onMounted, onUnmounted, provide, ref, watch } from 'vue'
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
import { desktopWindowAction, getDesktopStartupArgs, initDesktopBridge, isDesktop, openHomeworkManageWindow, prepareDesktopUri, probeDesktop, setDesktopUriRegistration, setDesktopWindowMode } from './services/desktop'
import { homeworkManageOpen } from './composables/useHomeworkManage'
import { installPopupFit } from './services/popupFit'
import { dialogActivityKey } from './composables/useDialogActivity'
import { swarmMotionQuery, useSwarmEffects } from './composables/useSwarmEffects'
import { allowsSwarmSurface } from './services/swarmScope'
import HomeworkPanel from './components/HomeworkPanel.vue'
import { fetchNetworkTime } from './services/timeSync'
import { locateWeatherCity } from './services/weather'
import { localDateStr } from './services/duty'
import { groupImportantDays, importantDayPreviews, importantDayStatus } from './services/importantDays'

const props = defineProps({ desktopLaunch: Boolean })
const route = useRoute()
const router = useRouter()
const timeStore = useTimeStore()
const settingsStore = useSettingsStore()
const contentStore = useContentStore()
contentStore.recordSchoolDay()
const weatherStore = useWeatherStore()
const quotesStore = useQuotesStore()
const controlsHidden = ref(false)
const settingsOpen = ref(false)
const dialogActivity = ref(0)
provide(dialogActivityKey, dialogActivity)
const settingsPane = ref('')
const appVersion = __APP_VERSION__
const buildId = __BUILD_ID__
const desktopAvailable = ref(false)
const desktopMini = ref(false)
const desktopWindowMode = ref('normal')
const desktopAutoStart = ref(false)
const fullscreenActive = ref(false)
const isHomeworkWindow = ref(false)
const isSettings = computed(() => settingsOpen.value)
const isClassroom = computed(() => route.meta.classroom === true)
provide('cytimeStageActive', computed(() => !isSettings.value && !dialogActivity.value))
const purePromptOpen = ref(false)
const purePromptSeconds = ref(10)
const pointerPreview = ref(null)
const effectsAllowed = (surface) => allowsSwarmSurface(settingsStore.settings, surface, settingsStore.examModeActive)
const currentSurfaceAllows = () => isSettings.value && pointerPreview.value !== null
  ? pointerPreview.value && (!settingsStore.examModeActive || !settingsStore.settings.swarmDisablePure)
  : effectsAllowed(isSettings.value ? 'settings' : route.meta.swarmSurface)
const bootCurtain = ref(props.desktopLaunch || (settingsStore.settings.swarmEffects && currentSurfaceAllows() && window.matchMedia(swarmMotionQuery).matches))
const launchSettling = ref(props.desktopLaunch)
const modalOpen = computed(() => isSettings.value || dialogActivity.value > 0)
const overlayOpen = computed(() => modalOpen.value || purePromptOpen.value)
let launchController
let nativePreparation = Promise.resolve()
let disposed = false
watch(isSettings, open => { if (!open) pointerPreview.value = null }, { flush: 'sync' })
const swarm = useSwarmEffects(router, {
  enabled: () => (pointerPreview.value ?? settingsStore.settings.swarmEffects) === true,
  sound: () => settingsStore.settings.swarmSound === true,
  suspended: () => launchSettling.value || isHomeworkWindow.value,
  allowsRoute: candidate => !modalOpen.value && effectsAllowed(candidate.meta.swarmSurface),
  allowsSurface: currentSurfaceAllows
})
const swarmLayout = computed(() => bootCurtain.value || swarm.active.value)
const currentSecond = computed(() => Math.floor(timeStore.now / 1000))
const currentDate = computed(() => new Date(currentSecond.value * 1000))
const currentDay = computed(() => localDateStr(currentDate.value))
const progress = computed(() => dayProgress(currentDate.value))
const importantDays = computed(() => groupImportantDays(contentStore.content.importantDays, currentDay.value))
const upcomingDays = computed(() => importantDayPreviews(importantDays.value.upcoming))
const dayRotation = ref(0)
const featuredDay = computed(() => upcomingDays.value[dayRotation.value % upcomingDays.value.length] || null)
const importantDaysTrigger = ref(null)
const importantDaysLabel = computed(() => featuredDay.value
  ? `${featuredDay.value.name}，${importantDayStatus(featuredDay.value.days)}。查看和管理重要日`
  : `${importantDays.value.past.length ? '所有重要日均已过去' : '还没有重要日'}。查看和管理重要日`)
let restoreImportantDaysFocus = false
watch(upcomingDays, () => { dayRotation.value = 0 })
watch(isSettings, open => {
  if (!open && restoreImportantDaysFocus) {
    restoreImportantDaysFocus = false
    nextTick(() => importantDaysTrigger.value?.focus())
  }
})
function openImportantDays() {
  restoreImportantDaysFocus = true
  openSettings('countdown')
}
const weatherTemperature = computed(() => weatherStore.current?.temperature?.value ?? '--')
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
let automaticPurePromptTimer
let automaticPurePromptPending = false
let dayRotationTimer
let showControlsHandler
let taskResizeObserver
let safeAreaObserver
let viewResizeObserver
let viewMutationObserver
let viewLayoutFrame = 0
let syncAfterVisibilityChange
let stopTaskWatch
let stopSafeAreaWatch
let stopViewPaddingWatch
let stopDesktopBridge
let disposePopupFit
let timeSyncTimer
let timeSyncController
let stopRightClick
let idleReturnTimer
let schoolDayTimer
let lastControlsActivity = 0
const navItems = [
  { path: '/time', label: '时钟', icon: 'clock-20-regular' },
  { path: '/countdown', label: '倒计时', icon: 'arrow-clockwise-20-regular' },
  { path: '/timer', label: '计时器', icon: 'timer-20-regular' },
  { path: '/classroom', label: '课堂工具', icon: 'apps-20-regular' }
]
const visibleNavItems = computed(() => desktopMini.value && !isClassroom.value ? navItems.filter(item => item.path !== '/classroom') : navItems)
const activeTaskCount = computed(() => timeStore.activeCountdowns.length + timeStore.activeTimers.length)
const viewport = ref({ width: window.innerWidth, height: window.innerHeight })
const uiScale = computed(() => Math.max(.5, Math.min(2, Number(settingsStore.settings.uiScale) / 100 || 1)))
const stageWidth = computed(() => viewport.value.width / uiScale.value)
const stageHeight = computed(() => viewport.value.height / uiScale.value)
const narrowLayout = computed(() => stageWidth.value <= 850)
const displayLayout = computed(() => settingsStore.settings.displayLayout || 'auto')
const classroomLayout = computed(() => {
  if (desktopMini.value || displayLayout.value === 'desktop') return false
  const [width, height] = displayLayout.value === 'classroom' ? [1024, 700] : [1440, 840]
  return stageWidth.value >= width && stageHeight.value >= height
})
const stageReadScale = computed(() => classroomLayout.value
  ? Math.max(1.24, Math.min(1.8, stageWidth.value / 1270, stageHeight.value / 690))
  : 1)
const allowBoards = computed(() => !settingsStore.examModeActive && !desktopMini.value && !(desktopAvailable.value && ['normal', 'mini'].includes(desktopWindowMode.value)))
const homeworkEnabled = computed(() => allowBoards.value && settingsStore.settings.showHomework)
const blackboardEnabled = computed(() => allowBoards.value && settingsStore.settings.showBlackboard)
const compactBoards = computed(() => narrowLayout.value && (homeworkEnabled.value || blackboardEnabled.value))
const compactClock = computed(() => route.path === '/time' && compactBoards.value)
const switchableBoards = computed(() => narrowLayout.value && homeworkEnabled.value && blackboardEnabled.value)
const selectedBoard = ref('homework')
const homeworkShown = computed(() => homeworkEnabled.value && (!switchableBoards.value || selectedBoard.value === 'homework'))
const blackboardShown = computed(() => blackboardEnabled.value && (!switchableBoards.value || selectedBoard.value === 'blackboard'))
provide('cytimeClassroomBoards', { homeworkEnabled, blackboardEnabled, homeworkShown, blackboardShown, compactBoards, switchableBoards, selectedBoard })
const taskSide = computed(() => homeworkShown.value && settingsStore.settings.homeworkPosition === 'right' ? 'left' : 'right')
const blackboardActive = computed(() => route.path === '/time' && !isSettings.value && blackboardShown.value)

const waitFrame = () => new Promise(resolve => {
  const timer = window.setTimeout(() => { window.cancelAnimationFrame(frame); resolve() }, 160)
  const frame = window.requestAnimationFrame(() => { window.clearTimeout(timer); resolve() })
})

async function settleScene() {
  await nextTick()
  syncViewport()
  await nextTick()
  await waitFrame()
  syncContentSafeTop()
  await waitFrame()
}

watch(overlayOpen, open => { if (open) swarm.interrupt() }, { flush: 'sync' })

function syncViewport() {
  viewport.value = { width: window.innerWidth, height: window.innerHeight }
  nextTick(syncContentSafeTop)
}

function updateTaskOverflow() {
  const element = taskDock.value
  if (!element) {
    taskOverflow.value = false
    return
  }
  if (!narrowLayout.value) {
    taskOverflow.value = false
    return
  }
  const cardWidth = element.querySelector('.task-widget')?.offsetWidth ?? 145
  const gap = 8
  const bottom = parseFloat(getComputedStyle(element).bottom) || 0
  shellRef.value?.style.setProperty('--board-task-clearance', `${Math.ceil(bottom + element.offsetHeight + gap)}px`)
  taskOverflow.value = activeTaskCount.value * cardWidth + Math.max(0, activeTaskCount.value - 1) * gap > element.clientWidth
}

function shellBottomOf(shell) {
  const shellRect = shell.getBoundingClientRect()
  const scale = shell.offsetWidth && shellRect.width ? shellRect.width / shell.offsetWidth : 1
  // 浏览器聚焦时可能滚动外层容器，排版仍需要未滚动的相对位置。
  return element => element ? Math.max(0, (element.getBoundingClientRect().bottom - shellRect.top) / scale + shell.scrollTop) : 0
}

function syncContentSafeTop() {
  if (isSettings.value || dialogActivity.value) return
  const shell = shellRef.value
  if (!shell) return
  const bottomOf = shellBottomOf(shell)
  if (statusDockRef.value) {
    const dockWidth = statusDockRef.value.offsetWidth
    const maxScale = dockWidth > 0 ? shell.offsetWidth / dockWidth : 1
    const userScale = (Number(settingsStore.settings.statusDockScale) || 100) / 100
    shell.style.setProperty('--status-dock-scale', String(Math.min(userScale, maxScale)))
  }
  const statusBottom = bottomOf(statusDockRef.value)
  shell.style.setProperty('--stage-status-clearance', `${Math.max(80, Math.ceil(statusBottom + 14))}px`)
  shell.style.setProperty('--nav-safe-top', `${Math.ceil(statusBottom + 12)}px`)
  const safeTop = Math.max(statusBottom, settingsStore.examModeActive ? 0 : bottomOf(navRef.value))
  shell.style.setProperty('--content-safe-top', `${Math.max(0, Math.ceil(safeTop + 10))}px`)
  updateViewPadding()
}

function updateViewPadding() {
  if (isSettings.value || dialogActivity.value) return
  const shell = shellRef.value
  if (!shell) return
  if (settingsStore.examModeActive) {
    for (const view of shell.querySelectorAll('.clock-view, .focus-view')) view.style.paddingTop = ''
    return
  }
  const bottomOf = shellBottomOf(shell)
  const safeTop = Math.max(bottomOf(statusDockRef.value), bottomOf(navRef.value)) + 10
  for (const view of shell.querySelectorAll('.clock-view, .focus-view')) {
    if (view.classList.contains('compact-boards')) { view.style.paddingTop = ''; continue }
    const viewHeight = view.offsetHeight
    const padBottom = parseFloat(getComputedStyle(view).paddingBottom) || 0
    const children = [...view.children].filter(element => {
      const position = getComputedStyle(element).position
      return position !== 'absolute' && position !== 'fixed' && element.offsetHeight > 0
    })
    if (!children.length) { view.style.paddingTop = ''; continue }
    // 排版尺寸不包含正在播放的位移动画，避免动画反过来改变居中位置。
    const tops = children.map(element => element.offsetTop)
    const bottoms = children.map(element => element.offsetTop + element.offsetHeight)
    const content = Math.max(...bottoms) - Math.min(...tops)
    const minTop = 24
    const maxTop = Math.max(minTop, viewHeight - padBottom - content)
    // 目标：内容在视口内垂直居中；若居中会压到顶部导航且下推后仍能容纳，则让位到导航下方
    let target = Math.max(minTop, (viewHeight - content) / 2)
    if (safeTop > target && safeTop + content <= viewHeight - padBottom) target = safeTop
    target = Math.min(target, maxTop)
    // flex 会在 padding 盒内再居中一次，因此由目标位置反推 padding-top
    const paddingTop = 2 * target - viewHeight + padBottom + content
    const next = `${Math.max(0, Math.ceil(paddingTop))}px`
    if (view.style.paddingTop !== next) view.style.paddingTop = next
  }
}

function scheduleViewPadding() {
  if (viewLayoutFrame || isSettings.value || dialogActivity.value) return
  viewLayoutFrame = requestAnimationFrame(() => { viewLayoutFrame = 0; updateViewPadding() })
}

function observeViewContent() {
  viewResizeObserver?.disconnect()
  for (const view of shellRef.value?.querySelectorAll('.clock-view, .focus-view') || []) {
    for (const child of view.children) {
      const position = getComputedStyle(child).position
      if (position !== 'absolute' && position !== 'fixed') viewResizeObserver?.observe(child)
    }
  }
  scheduleViewPadding()
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
      await setDesktopWindowMode('max')
      desktopWindowMode.value = 'max'
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

function minimizeWindow() {
  if (!isDesktop()) return
  if (fullscreenActive.value) {
    desktopMini.value = false
    window.__cytimeMiniMode = false
    fullscreenActive.value = false
    desktopWindowMode.value = 'normal'
    setDesktopWindowMode('normal')
    return
  }
  if (!desktopMini.value) {
    desktopMini.value = true
    window.__cytimeMiniMode = true
    desktopWindowMode.value = 'mini'
    setDesktopWindowMode('mini')
    return
  }
  desktopWindowAction('minimize')
}
function closeWindow() { desktopWindowAction('close') }
function maximizeWindow() {
  if (desktopMini.value) {
    desktopMini.value = false
    window.__cytimeMiniMode = false
    setDesktopWindowMode('normal')
    desktopWindowMode.value = 'normal'
  } else { desktopWindowAction('maximize'); desktopWindowMode.value = 'max' }
}

function openSettings(pane = '') {
  settingsPane.value = typeof pane === 'string' ? pane : ''
  settingsOpen.value = true
}
provide('cytimeOpenSettings', openSettings)
provide('cytimeRefreshLayout', () => nextTick(scheduleViewPadding))

function closeSettings() {
  settingsOpen.value = false
}

function scheduleIdleReturn() {
  window.clearTimeout(idleReturnTimer)
  if (launchSettling.value || !settingsStore.settings.idleReturnTime || desktopMini.value || isHomeworkWindow.value || isClassroom.value || isSettings.value || dialogActivity.value || purePromptOpen.value) return
  idleReturnTimer = window.setTimeout(() => {
    if (launchSettling.value || !settingsStore.settings.idleReturnTime || desktopMini.value || isHomeworkWindow.value || isClassroom.value || isSettings.value || dialogActivity.value || purePromptOpen.value) return
    if (route.path !== '/time') router.push('/time')
  }, 30000)
}

function applyDesktopMode(mode) {
  if (!mode) return
  desktopMini.value = mode === 'mini'
  fullscreenActive.value = mode === 'full'
  desktopWindowMode.value = mode
  window.__cytimeMiniMode = desktopMini.value
}

function waitForDesktopLayout(signal) {
  if (signal.aborted) return Promise.resolve()
  return new Promise(resolve => {
    const finish = () => { window.clearTimeout(timer); signal.removeEventListener('abort', finish); resolve() }
    const timer = window.setTimeout(finish, 5000)
    signal.addEventListener('abort', finish, { once: true })
  })
}

async function launchDesktop({ prepare, reveal = true, cold = false }) {
  launchController?.abort()
  const controller = new AbortController()
  launchController = controller
  const { signal } = controller
  const valid = () => !disposed && !signal.aborted
  bootCurtain.value = true
  launchSettling.value = true
  closePurePrompt()
  swarm.interrupt()
  const preparing = nativePreparation.then(() => valid() ? prepare() : null)
  nativePreparation = preparing.catch(() => null)
  try {
    const launch = await preparing
    if (!valid()) return
    await waitForDesktopLayout(signal)
    if (!valid()) return
    if (reveal) await desktopWindowAction('show')
    if (!valid()) return
    if (reveal) showControlsHandler?.()
    await settleScene()
    if (!valid()) return
    launchSettling.value = false
    await nextTick()
    if (reveal && (cold || launch?.replay)) await swarm.replay({ sounds: launch?.sounds, volume: launch?.volume, valid: () => valid() && !overlayOpen.value })
  } catch {
    if (reveal && valid()) await desktopWindowAction('show').catch(() => {})
  } finally {
    if (valid()) {
      launchSettling.value = false
      bootCurtain.value = false
      launchController = undefined
      scheduleIdleReturn()
    }
  }
}

function handleDesktopUri(rawUri, fallbackMode = null) {
  if (!settingsStore.settings.uriRegistration) return
  void launchDesktop({ cold: fallbackMode !== null, prepare: async () => {
    const launch = await prepareDesktopUri(rawUri, fallbackMode)
    const uri = new URL(launch.uri)
    applyDesktopMode(launch.mode)
    const page = uri.hostname === 'page' ? uri.pathname.replace(/^\//, '') : ''
    if (page === 'time' || page === 'clock') await router.push('/time')
    else if (['countdown', 'timer'].includes(page)) await router.push(`/${page}`)
    else if (uri.hostname === 'countdown') {
      const targetInput = uri.searchParams.get('target')
      const length = Number(uri.searchParams.get('length'))
      const targetAt = targetInput ? parseCountdownTarget(targetInput, new Date(timeStore.now)) : length > 0 ? timeStore.now + length * 1000 : null
      if (targetAt) timeStore.addCountdown('', targetAt)
      await router.push('/countdown')
    } else if (uri.hostname === 'task' && uri.pathname.startsWith('/countdown')) {
      const task = timeStore.countdowns.find(item => item.id === timeStore.selectedCountdownId) || timeStore.activeCountdowns[0]
      if (task) {
        if (uri.pathname.endsWith('/pause')) timeStore.pauseCountdown(task)
        else if (uri.pathname.endsWith('/continue')) timeStore.resumeCountdown(task)
        else if (uri.pathname.endsWith('/stop')) timeStore.stopCountdown(task)
      }
    }
    return launch
  } })
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
  if (audioContext.state !== 'running') audioContext.resume?.().catch(() => {})
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
    if (note) playBell(JIANPU[note], at, index % 2 ? 0.065 : 0.08, Math.max(0.16, Math.min(0.8, duration * 0.95)))
    at += duration
  })
}

function playBell(frequency, delay = 0, volume = 0.08, duration = 0.9) {
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
  if (settingsStore.settings.soundEnabled) playBell(1567.98, 0, 0.06, 0.22)
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
let wakeLockRequest
let wakeLockDisposed = false
async function syncWakeLock() {
  const wanted = () => !wakeLockDisposed && settingsStore.settings.preventSleep && navigator.wakeLock && document.visibilityState === 'visible'
  if (!wanted()) {
    const previous = wakeLock
    wakeLock = undefined
    if (previous) await previous.release().catch(() => {})
    return
  }
  if ((wakeLock && !wakeLock.released) || wakeLockRequest) return
  try {
    wakeLockRequest = navigator.wakeLock.request('screen')
    const next = await wakeLockRequest
    if (!wanted()) { await next.release().catch(() => {}); return }
    wakeLock = next
    next.addEventListener('release', () => { if (wakeLock === next) wakeLock = undefined }, { once: true })
  } catch {}
  finally { wakeLockRequest = undefined }
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
  if (isSettings.value || dialogActivity.value || settingsStore.examModeActive) return
  closePurePrompt()
  purePromptSeconds.value = 10
  purePromptOpen.value = true
  purePromptTimer = window.setTimeout(closePurePrompt, 10000)
  purePromptCountdownTimer = window.setInterval(() => {
    purePromptSeconds.value = Math.max(0, purePromptSeconds.value - 1)
  }, 1000)
}

function showAutomaticPurePrompt() {
  if (!automaticPurePromptPending || swarmLayout.value) return
  automaticPurePromptPending = false
  if (!isClassroom.value && !isHomeworkWindow.value && !purePromptOpen.value) schedulePurePrompt()
}

function queueAutomaticPurePrompt(delay) {
  window.clearTimeout(automaticPurePromptTimer)
  automaticPurePromptPending = false
  automaticPurePromptTimer = window.setTimeout(() => {
    automaticPurePromptPending = true
    showAutomaticPurePrompt()
  }, delay)
}

function enterExamMode() {
  closePurePrompt()
  settingsStore.setExamMode(true)
}

function exitExamMode() {
  settingsStore.setExamMode(false)
}

async function syncNetworkTime() {
  timeSyncController?.abort()
  const controller = new AbortController()
  timeSyncController = controller
  if (!settingsStore.settings.timeSyncEnabled) return
  const source = settingsStore.settings.timeSyncSource || 'auto'
  if (source === 'system') {
    timeStore.setClockOffset(0)
    return
  }
  const startedAt = Date.now()
  try {
    const serverTime = await fetchNetworkTime(source, controller.signal)
    if (controller.signal.aborted || !settingsStore.settings.timeSyncEnabled) return
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
    if (settingsStore.settings.weatherAutoLocated || settingsStore.settings.weatherCityNum !== weatherCityNum) return
    settingsStore.update({ weatherCityName: located.name, weatherCityNum: located.num, weatherAutoLocated: true })
  } catch {}
}

async function initializeDesktopWindow() {
  // Dedicated homework window must not reshape / focus the main window.
  if (!isDesktop() || isHomeworkWindow.value) return
  const args = await getDesktopStartupArgs().catch(() => [])
  if (disposed) return
  desktopAutoStart.value = args.includes('--cyrene-auto-start')
  const mode = settingsStore.settings.startupWindowMode || 'normal'
  const coldUri = settingsStore.settings.uriRegistration ? args.find(argument => argument.startsWith('cytime://')) || '' : ''
  if (coldUri) handleDesktopUri(coldUri, mode)
  else void launchDesktop({ cold: true, reveal: !desktopAutoStart.value, prepare: async () => {
    applyDesktopMode(mode)
    await setDesktopWindowMode(mode, false)
  } })
  void setDesktopUriRegistration(settingsStore.settings.uriRegistration).catch(() => {})
  const stop = await initDesktopBridge(handleDesktopUri, coldUri).catch(() => null)
  if (disposed) stop?.()
  else stopDesktopBridge = stop
}

watch(() => [settingsStore.settings.weatherCityNum, settingsStore.settings.showWeather], ([cityNum, visible]) => {
  if (visible) weatherStore.refresh(cityNum, true)
})
watch(() => settingsStore.settings.preventSleep, syncWakeLock)
watch(() => [settingsStore.settings.timeSyncEnabled, settingsStore.settings.timeSyncSource, settingsStore.settings.timeSyncInterval], () => {
  timeSyncController?.abort()
  window.clearInterval(timeSyncTimer)
  if (settingsStore.settings.timeSyncSource === 'system') timeStore.setClockOffset(0)
  else if (settingsStore.settings.timeSyncEnabled) {
    syncNetworkTime()
    timeSyncTimer = window.setInterval(syncNetworkTime, Math.max(5, Number(settingsStore.settings.timeSyncInterval) || 60) * 60 * 1000)
  }
})
watch(isSettings, open => { if (!open) queueAutomaticPurePrompt(180) })
watch(swarmLayout, showAutomaticPurePrompt)
watch(() => route.fullPath, () => {
  // The non-modal prompt yields to navigation, even if its timer hasn't opened it yet.
  window.clearTimeout(automaticPurePromptTimer)
  automaticPurePromptPending = false
  closePurePrompt()
}, { flush: 'sync' })
watch([() => settingsStore.settings.idleReturnTime, desktopMini, isHomeworkWindow, isClassroom, isSettings, dialogActivity, purePromptOpen], scheduleIdleReturn)

onMounted(async () => {
  desktopAvailable.value = await probeDesktop()
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    isHomeworkWindow.value = getCurrentWindow().label === 'homework'
  } catch {}
  document.documentElement.classList.toggle('homework-window-root', isHomeworkWindow.value)
  settingsStore.setExamMode(false)
  if (settingsStore.settings.showWeather) weatherStore.refresh(settingsStore.settings.weatherCityNum)
  autoLocateWeather()
  contentStore.recordSchoolDay()
  schoolDayTimer = window.setInterval(() => contentStore.recordSchoolDay(), 60000)
  dayRotationTimer = window.setInterval(() => {
    const trigger = importantDaysTrigger.value
    if (upcomingDays.value.length > 1 && trigger && !trigger.matches(':hover, :focus-visible')) dayRotation.value = (dayRotation.value + 1) % upcomingDays.value.length
  }, 15000)
  weatherTimer = window.setInterval(() => { if (settingsStore.settings.showWeather) weatherStore.refresh(settingsStore.settings.weatherCityNum, true) }, 30 * 60 * 1000)
  showControlsHandler = event => {
    const at = performance.now()
    if (event?.type === 'pointermove' && at - lastControlsActivity < 200) return
    lastControlsActivity = at
    if (event?.type === 'pointerdown' || event?.type === 'keydown') prepareAudio()
    controlsHidden.value = false
    window.clearTimeout(controlsTimer)
    controlsTimer = window.setTimeout(() => { controlsHidden.value = true }, 10000)
    scheduleIdleReturn()
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
    contentStore.recordSchoolDay()
  }
  document.addEventListener('visibilitychange', syncAfterVisibilityChange)
  window.addEventListener('focus', syncAfterVisibilityChange)
  if (desktopAvailable.value) void initializeDesktopWindow()
  else if (bootCurtain.value) {
    const valid = () => !disposed && bootCurtain.value && !overlayOpen.value
    void settleScene().then(() => swarm.replay({ valid })).finally(() => { bootCurtain.value = false })
  }
  stopRightClick = event => event.preventDefault()
  document.addEventListener('contextmenu', stopRightClick)
  document.oncontextmenu = () => false
  document.addEventListener('fullscreenchange', () => { fullscreenActive.value = Boolean(document.fullscreenElement) })
  timeStore.start()
  if (settingsStore.settings.timeSyncEnabled && settingsStore.settings.timeSyncSource !== 'system') {
    syncNetworkTime()
    timeSyncTimer = window.setInterval(syncNetworkTime, Math.max(5, Number(settingsStore.settings.timeSyncInterval) || 60) * 60 * 1000)
  }
  quotesStore.start()
  showControlsHandler()
  window.__cytimeShowControls = showControlsHandler
  taskResizeObserver = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(updateTaskOverflow)
  stopTaskWatch = watch([activeTaskCount, taskDock, narrowLayout, () => settingsStore.settings.taskCardScale], () => {
    taskResizeObserver?.disconnect()
    if (taskDock.value) taskResizeObserver?.observe(taskDock.value)
    updateTaskOverflow()
  }, { flush: 'post' })
  nextTick(() => {
    if (taskDock.value) taskResizeObserver?.observe(taskDock.value)
    updateTaskOverflow()
  })
  safeAreaObserver = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(syncContentSafeTop)
  window.addEventListener('resize', syncViewport)
  syncViewport()
  disposePopupFit = installPopupFit()
  stopSafeAreaWatch = watch([isSettings, () => route.path, compactBoards, stageReadScale, () => settingsStore.examModeActive, () => settingsStore.settings.statusDockScale, () => settingsStore.settings.statusDockOffsetY, uiScale], async () => {
    await nextTick()
    observeSafeAreas()
  })
  nextTick(observeSafeAreas)
  if (document.fonts?.ready) document.fonts.ready.then(scheduleViewPadding).catch(() => {})
  if (typeof ResizeObserver !== 'undefined' && typeof MutationObserver !== 'undefined') {
    viewResizeObserver = new ResizeObserver(scheduleViewPadding)
    viewMutationObserver = new MutationObserver(records => {
      const changed = records.some(record => record.target.matches?.('.clock-view, .focus-view') || [...record.addedNodes, ...record.removedNodes].some(node => node.matches?.('.clock-view, .focus-view') || node.querySelector?.('.clock-view, .focus-view')))
      if (changed) nextTick(observeViewContent)
    })
    const stage = shellRef.value?.querySelector('.clock-stage')
    if (stage) viewMutationObserver.observe(stage, { childList: true, subtree: true })
    stopViewPaddingWatch = watch([() => route.path, isSettings, dialogActivity], ([, settings, dialogs], previous) => nextTick(() => {
      observeViewContent()
      if (!settings && !dialogs && (previous?.[1] || previous?.[2])) syncContentSafeTop()
    }))
    nextTick(observeViewContent)
  } else {
    stopViewPaddingWatch = watch([() => isSettings.value || dialogActivity.value ? null : Math.floor(timeStore.now / 1000), () => route.path], () => nextTick(updateViewPadding))
  }
  syncWakeLock()
  if (!isHomeworkWindow.value) queueAutomaticPurePrompt(550)
})
onUnmounted(() => {
  disposed = true
  launchController?.abort()
  timeSyncController?.abort()
  wakeLockDisposed = true
  wakeLock?.release?.().catch(() => {})
  timeStore.stop()
  quotesStore.stop()
  window.clearInterval(weatherTimer)
  window.clearInterval(timeSyncTimer)
  window.clearInterval(dayRotationTimer)
  window.clearInterval(schoolDayTimer)
  window.clearTimeout(controlsTimer)
  if (window.__cytimeCountdownHandlers === countdownHandlers) {
    countdownHandlers.stop()
    delete window.__cytimeCountdownHandlers
  }
  document.removeEventListener('visibilitychange', syncAfterVisibilityChange)
  window.removeEventListener('focus', syncAfterVisibilityChange)
  window.removeEventListener('resize', syncViewport)
  disposePopupFit?.()
  taskResizeObserver?.disconnect()
  safeAreaObserver?.disconnect()
  viewResizeObserver?.disconnect()
  viewMutationObserver?.disconnect()
  if (viewLayoutFrame) cancelAnimationFrame(viewLayoutFrame)
  stopTaskWatch?.()
  stopSafeAreaWatch?.()
  stopViewPaddingWatch?.()
  stopDesktopBridge?.()
  window.clearTimeout(noticeTimer)
  window.clearTimeout(idleReturnTimer)
  window.clearTimeout(automaticPurePromptTimer)
  closePurePrompt()
  if (showControlsHandler) {
    window.removeEventListener('pointermove', showControlsHandler)
    window.removeEventListener('pointerdown', showControlsHandler)
    window.removeEventListener('keydown', showControlsHandler)
  }
  if (stopRightClick) document.removeEventListener('contextmenu', stopRightClick)
  document.oncontextmenu = null
  audioContext?.close?.().catch(() => {})
  delete window.__cytimeShowControls
})
</script>

<template>
  <div class="app-root" :class="{ 'swarm-layout': swarmLayout, 'is-desktop': desktopAvailable, 'titlebar-hidden': desktopAvailable && fullscreenActive }">
    <div v-if="desktopAvailable" class="app-titlebar" role="banner"><div class="app-titlebar-drag" data-tauri-drag-region><span data-tauri-drag-region>CyTime 昔时时钟</span></div><div class="app-titlebar-controls"><button v-if="!desktopMini" type="button" aria-label="最小化" @click="minimizeWindow"><FluentIcon icon="subtract-16-regular" :width="16" /></button><button type="button" aria-label="最大化或解锁 Mini 模式" @click="maximizeWindow"><FluentIcon icon="maximize-16-regular" :width="16" /></button><button type="button" aria-label="关闭窗口" @click="closeWindow"><FluentIcon icon="dismiss-16-regular" :width="16" /></button></div></div>
    <div class="app-shell" ref="shellRef" :inert="launchSettling" :class="{ 'settings-shell': isSettings, 'controls-hidden': controlsHidden, 'exam-mode': settingsStore.examModeActive, 'mini-mode': desktopMini, 'classroom-route': isClassroom, 'with-compact-boards': compactClock, 'short-stage': stageHeight < 700, 'compact-footer': stageWidth <= 620, [`window-mode-${desktopWindowMode}`]: desktopAvailable }" :data-display-layout="displayLayout" :data-effective-layout="classroomLayout ? 'classroom' : 'desktop'" :style="{ '--stage-read-scale': stageReadScale }">
    <header v-if="!isSettings && !settingsStore.examModeActive" ref="statusDockRef" class="status-dock" aria-label="状态信息">
      <div v-if="settingsStore.settings.showWeather" class="status-weather"><strong>{{ weatherTemperature }}°</strong><FluentIcon icon="weather-partly-cloudy-day-20-regular" :width="18" /><span>{{ weatherStatus }}</span></div>
      <div v-if="settingsStore.settings.showDayProgress" class="status-progress"><span>今日进度</span><div class="status-progress-bar"><i :style="{ width: `${progress}%` }"></i></div><strong>{{ progress.toFixed(0) }}%</strong></div>
      <button v-if="settingsStore.settings.showImportantDays" ref="importantDaysTrigger" type="button" class="important-days-trigger" :aria-label="importantDaysLabel" :title="importantDaysLabel" @click="openImportantDays">
        <FluentIcon icon="calendar-20-regular" :width="16" />
        <span>{{ featuredDay?.name || '重要日' }}</span>
        <strong v-if="featuredDay">{{ importantDayStatus(featuredDay.days) }}</strong>
        <small v-else>{{ importantDays.past.length ? '暂无倒计时' : '未添加' }}</small>
      </button>
    </header>
    <nav v-if="!isSettings" ref="navRef" class="mode-nav" aria-label="模式切换">
      <RouterLink v-for="item in visibleNavItems" :key="item.path" :to="item.path" :class="{ active: item.path === '/classroom' ? isClassroom : route.path === item.path }" :aria-current="item.path === '/classroom' && isClassroom ? 'page' : undefined"><FluentIcon :icon="item.icon" :width="17" /><span>{{ item.label }}</span></RouterLink>
    </nav>
    <main class="clock-stage" :inert="isSettings" data-swarm-pageview><RouterView v-slot="{ Component }"><Transition name="page" mode="out-in"><KeepAlive include="ClassroomView"><component :is="Component" /></KeepAlive></Transition></RouterView></main>
    <template v-if="!isSettings">
      <footer class="clock-footer">
        <button type="button" class="footer-action footer-settings" aria-label="设置" title="设置" @click="openSettings()"><FluentIcon icon="settings-20-regular" :width="19" /></button>
        <div class="footer-center-actions"><button type="button" class="footer-action" :aria-label="fullscreenActive ? '退出全屏' : '全屏'" @click="toggleFullscreen"><FluentIcon :icon="fullscreenActive ? 'full-screen-minimize-20-regular' : 'full-screen-maximize-20-regular'" :width="19" /><span>{{ fullscreenActive ? '退出全屏' : '全屏' }}</span></button><button type="button" class="footer-action" :aria-label="settingsStore.examModeActive ? '退出纯净模式' : '纯净/考试模式'" @click="settingsStore.examModeActive ? exitExamMode() : schedulePurePrompt()"><FluentIcon :icon="settingsStore.examModeActive ? 'eye-20-filled' : 'eye-off-20-regular'" :width="19" /><span>{{ settingsStore.examModeActive ? '退出纯净' : '纯净模式' }}</span></button></div>
      </footer>
      <div class="app-meta">
        <a class="app-signature" href="https://github.com/Cyrene2008/CyTime" target="_blank" rel="noreferrer">v{{ appVersion }}<span v-if="buildId"> (build {{ buildId }})</span> by Cyrene2008</a>
        <a v-if="FILING_NAME" class="app-filing" :href="FILING_URL" target="_blank" rel="noreferrer">{{ FILING_NAME }}</a>
      </div>
      <div v-if="activeTaskCount && !settingsStore.examModeActive && !blackboardActive" ref="taskDock" class="task-docks" :class="['is-side', `task-docks-${taskSide}`, { 'is-compact': narrowLayout, 'is-marquee': taskOverflow }]"><div class="task-docks-track"><template v-for="copy in taskOverflow ? 2 : 1" :key="copy"><RouterLink v-for="task in timeStore.activeCountdowns" :key="`${copy}-${task.id}`" to="/countdown" class="task-widget task-widget-countdown" @click="timeStore.selectCountdown(task)"><span class="task-dot pink"></span><span>{{ task.label }}</span><strong>{{ formatDuration(countdownRemaining(task)) }}</strong></RouterLink><RouterLink v-for="task in timeStore.activeTimers" :key="`${copy}-${task.id}-timer`" to="/timer" class="task-widget task-widget-timer" @click="timeStore.selectTimer(task)"><span class="task-dot green"></span><span>{{ task.label }}</span><strong>{{ formatDuration(timeStore.timerElapsed(task)) }}</strong></RouterLink></template></div></div>
      <Transition name="notice"><div v-if="taskNotice" class="task-notice" role="status" aria-live="assertive">{{ taskNotice }}</div></Transition>
      <Transition name="pure-prompt"><div v-if="purePromptOpen" class="pure-prompt-layer" role="dialog" aria-modal="false" aria-label="纯净模式提示"><div class="pure-prompt-card"><h2>进入纯净模式？</h2><p>天气、作业板和语录会暂时收起，只留下安静的时间画面，适合考试、自习或投屏。进入后可随时退出。</p><div class="pure-prompt-actions"><button type="button" class="subtle-button" @click="closePurePrompt">暂不进入 ({{ purePromptSeconds }}s)</button><button type="button" class="save-button" @click="enterExamMode">进入</button></div></div></div></Transition>
    </template>
    <Transition name="settings-overlay"><div v-if="isSettings" class="settings-overlay"><div class="settings-scrim" @click="closeSettings"></div><SettingsView :desktop-available="desktopAvailable" :initial-pane="settingsPane" @preview-pointer="pointerPreview = $event" @close="closeSettings" /></div></Transition>
    <div v-if="homeworkManageOpen" class="homework-float-layer" role="dialog" aria-modal="true" aria-label="悬浮作业板">
      <HomeworkPanel manage-float @close="homeworkManageOpen = false" />
    </div>
    </div>
    <div v-if="bootCurtain" class="cytime-launch-cover" role="status" aria-label="正在准备昔时"><img src="/icon-192.png" alt="" width="68" height="68" /></div>
  </div>
</template>

<style scoped>
.important-days-trigger {
  display: flex;
  flex: 0 1 auto;
  align-items: center;
  gap: clamp(4px, 1vw, 8px);
  min-width: 0;
  max-width: min(46%, 380px);
  min-height: 36px;
  padding: 0 clamp(5px, 1.3vw, 13px);
  border: 0;
  border-inline-start: 1px solid var(--border-subtle);
  color: var(--text-primary);
  background: transparent;
  font: inherit;
  text-align: start;
  white-space: nowrap;
  cursor: pointer;
}
.important-days-trigger > :is(svg, strong, small) { flex: none; }
.important-days-trigger > span { min-width: 0; overflow: hidden; color: var(--status-text-color, var(--text-secondary)); text-overflow: ellipsis; }
.important-days-trigger svg, .important-days-trigger strong { color: var(--accent); }
.important-days-trigger strong { font-variant-numeric: tabular-nums; }
.important-days-trigger small { color: var(--status-text-color, var(--text-muted)); font-size: inherit; }
.important-days-trigger:hover { background: var(--bg-hover); }
.important-days-trigger:focus-visible { outline: 2px solid var(--accent); outline-offset: -3px; }
@media (max-width: 380px) {
  .important-days-trigger > svg { display: none; }
}
</style>
