import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

const STORAGE_KEY = 'cytime.time-state.v1'

const makeId = prefix => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

export const useTimeStore = defineStore('time', () => {
  const now = ref(Date.now())
  const countdowns = ref([])
  const timers = ref([])
  const selectedCountdownId = ref(null)
  const selectedTimerId = ref(null)
  const clockOffset = ref(0)
  let tickHandle
  const currentTime = () => Date.now() + clockOffset.value

  const runningCountdowns = computed(() => countdowns.value.filter(task => task.status === 'running'))
  const runningTimers = computed(() => timers.value.filter(task => task.status === 'running'))
  const activeCountdowns = computed(() => countdowns.value.filter(task => ['running', 'paused'].includes(task.status)))
  const activeTimers = computed(() => timers.value.filter(task => ['running', 'paused'].includes(task.status)))

  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ countdowns: countdowns.value, timers: timers.value }))
  }

  function hydrate() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
      countdowns.value = Array.isArray(saved.countdowns) ? saved.countdowns : []
      timers.value = Array.isArray(saved.timers) ? saved.timers : []
      const restoredAt = currentTime()
      countdowns.value.forEach(task => {
        // A closed PWA must not replay an alarm for a countdown that ended while it was away.
        if (task.status === 'running' && task.targetAt <= restoredAt) {
          task.status = 'completed'
          task.completedAt ||= restoredAt
        }
      })
      // Runtime timers cannot accumulate while the page is closed.
      timers.value.forEach(timer => {
        if (timer.mode === 'runtime' && timer.status === 'running') timer.status = 'paused'
      })
    } catch {
      countdowns.value = []
      timers.value = []
    }
  }

  function tick() {
    now.value = currentTime()
    let changed = false
    countdowns.value.forEach(task => {
      if (task.status !== 'running') return
      const remainingSeconds = Math.ceil((task.targetAt - now.value) / 1000)
      if (remainingSeconds <= 5 && remainingSeconds > 0 && task.lastAlertSecond !== remainingSeconds) {
        task.lastAlertSecond = remainingSeconds
        window.dispatchEvent(new CustomEvent('cytime:countdown-warning', { detail: { task, seconds: remainingSeconds } }))
      }
      if (task.targetAt <= now.value) {
        task.status = 'completed'
        task.completedAt = now.value
        window.dispatchEvent(new CustomEvent('cytime:countdown-complete', { detail: { task } }))
        changed = true
      }
    })
    if (changed) persist()
  }

  function start() {
    if (tickHandle) return
    hydrate()
    tick()
    tickHandle = window.setInterval(tick, 250)
  }

  function stop() {
    if (tickHandle) window.clearInterval(tickHandle)
    tickHandle = undefined
  }

  function sync() {
    tick()
  }

  function setClockOffset(offset) {
    clockOffset.value = Number.isFinite(Number(offset)) ? Number(offset) : 0
    tick()
  }

  function addCountdown(label, targetAt) {
    const initialDuration = Math.max(0, targetAt - currentTime())
    const task = { id: makeId('countdown'), label: label || '未命名倒计时', targetAt, initialDuration, status: 'running', createdAt: currentTime(), pausedRemaining: 0 }
    countdowns.value.unshift(task)
    selectedCountdownId.value = task.id
    persist()
    return task
  }

  function pauseCountdown(task) {
    if (task.status !== 'running') return
    task.pausedRemaining = Math.max(0, task.targetAt - now.value)
    task.status = 'paused'
    persist()
  }

  function resumeCountdown(task) {
    if (task.status !== 'paused' || !task.pausedRemaining) return
    task.targetAt = currentTime() + task.pausedRemaining
    task.lastAlertSecond = null
    task.status = 'running'
    persist()
  }

  function stopCountdown(task) {
    task.status = 'stopped'
    persist()
  }

  function resetCountdown(task) {
    const duration = Math.max(0, task.initialDuration || task.pausedRemaining || task.targetAt - currentTime())
    task.targetAt = currentTime() + duration
    task.pausedRemaining = duration
    task.lastAlertSecond = null
    task.status = 'paused'
    delete task.completedAt
    persist()
  }

  function removeCountdown(task) {
    countdowns.value = countdowns.value.filter(item => item.id !== task.id)
    if (selectedCountdownId.value === task.id) selectedCountdownId.value = activeCountdowns.value[0]?.id || null
    persist()
  }

  function addTimer(label, mode = 'absolute') {
    const task = { id: makeId('timer'), label: label || '未命名计时', mode, status: 'running', elapsed: 0, startedAt: currentTime(), createdAt: currentTime() }
    timers.value.unshift(task)
    selectedTimerId.value = task.id
    persist()
    return task
  }

  function timerElapsed(task) {
    if (task.status !== 'running') return task.elapsed
    return task.elapsed + Math.max(0, (now.value - task.startedAt) / 1000)
  }

  function pauseTimer(task) {
    task.elapsed = timerElapsed(task)
    task.status = 'paused'
    persist()
  }

  function resumeTimer(task) {
    if (task.status !== 'paused') return
    task.startedAt = currentTime()
    task.status = 'running'
    persist()
  }

  function stopTimer(task) {
    task.elapsed = timerElapsed(task)
    task.status = 'stopped'
    persist()
  }

  function resetTimer(task) {
    task.elapsed = 0
    task.startedAt = currentTime()
    task.status = 'paused'
    persist()
  }

  function removeTimer(task) {
    timers.value = timers.value.filter(item => item.id !== task.id)
    if (selectedTimerId.value === task.id) selectedTimerId.value = activeTimers.value[0]?.id || null
    persist()
  }

  function pauseRuntimeTimers() {
    let changed = false
    timers.value.forEach(task => {
      if (task.mode === 'runtime' && task.status === 'running') {
        task.elapsed = timerElapsed(task)
        task.status = 'paused'
        changed = true
      }
    })
    if (changed) persist()
  }

  function selectCountdown(task) {
    selectedCountdownId.value = task?.id || null
  }

  function selectTimer(task) {
    selectedTimerId.value = task?.id || null
  }

  return { now, clockOffset, countdowns, timers, selectedCountdownId, selectedTimerId, runningCountdowns, runningTimers, activeCountdowns, activeTimers, start, stop, sync, setClockOffset, addCountdown, pauseCountdown, resumeCountdown, stopCountdown, resetCountdown, removeCountdown, addTimer, timerElapsed, pauseTimer, resumeTimer, stopTimer, resetTimer, removeTimer, pauseRuntimeTimers, selectCountdown, selectTimer }
})
