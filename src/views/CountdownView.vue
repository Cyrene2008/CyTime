<script setup>
import { computed, ref, watch } from 'vue'
import { useTimeStore } from '../stores/time'
import { useDigitBox } from '../composables/useDigitBox'

const timeStore = useTimeStore()
const label = ref('')
const inputError = ref('')
const settingsOpen = ref(false)
const hours = ref(0)
const minutes = ref(10)
const seconds = ref(0)
const quickChoice = ref(600)
const targetEnabled = ref(false)
const targetDate = ref('')
const targetTime = ref('')
const task = computed(() => {
  const selected = timeStore.countdowns.find(item => item.id === timeStore.selectedCountdownId)
  if (selected && ['running', 'paused'].includes(selected.status)) return selected
  if (selected?.status === 'completed') return selected
  return timeStore.countdowns.find(item => ['running', 'paused'].includes(item.status)) || null
})
const remaining = computed(() => task.value ? Math.max(0, task.value.status === 'paused' ? Math.ceil(task.value.pausedRemaining / 1000) : Math.ceil((task.value.targetAt - timeStore.now) / 1000)) : 0)
const isWarning = computed(() => Boolean(task.value?.status === 'running' && remaining.value > 0 && remaining.value <= 5))
const isFinished = computed(() => task.value?.status === 'completed')
const display = computed(() => formatDuration(task.value ? remaining.value : 0))
const clockRef = ref(null)
useDigitBox(clockRef)

function formatDuration(totalSeconds) {
  const value = Math.max(0, Math.floor(totalSeconds))
  return [Math.floor(value / 3600), Math.floor((value % 3600) / 60), value % 60].map(item => String(item).padStart(2, '0')).join(':')
}

function adjust(field, amount) {
  const target = field === 'hours' ? hours : field === 'minutes' ? minutes : seconds
  const max = field === 'hours' ? 99 : 59
  target.value = Math.max(0, Math.min(max, target.value + amount))
  quickChoice.value = 0
}

function selectQuick(value) {
  quickChoice.value = value
  hours.value = Math.floor(value / 3600)
  minutes.value = Math.floor((value % 3600) / 60)
  seconds.value = value % 60
}

function setField(field, event) {
  const max = field === 'hours' ? 99 : 59
  const digits = String(event.target.value).replace(/\D/g, '').slice(0, 2)
  const value = Math.max(0, Math.min(max, Number(digits || 0)))
  if (field === 'hours') hours.value = value
  else if (field === 'minutes') minutes.value = value
  else seconds.value = value
  quickChoice.value = 0
  event.target.value = String(value).padStart(2, '0')
}

function toDateValue(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function addTask() {
  if (window.__cytimeMiniMode && task.value) return
  let targetAt
  if (targetEnabled.value) {
    const target = new Date(`${targetDate.value}T${targetTime.value || '00:00'}:00`)
    if (Number.isNaN(target.getTime()) || target.getTime() <= timeStore.now) { inputError.value = '目标时刻需要晚于当前时间'; return }
    targetAt = target.getTime()
  } else {
    const duration = hours.value * 3600 + minutes.value * 60 + seconds.value
    if (!duration) { inputError.value = '请设置一个大于 0 的倒计时时长'; return }
    targetAt = timeStore.now + duration * 1000
  }
  timeStore.addCountdown(label.value, targetAt)
  label.value = ''; targetEnabled.value = false; inputError.value = ''; settingsOpen.value = false
}

function openSettings() {
  if (!task.value) selectQuick(600)
  const now = new Date(timeStore.now)
  targetDate.value = toDateValue(now)
  const next = new Date(timeStore.now + 10 * 60 * 1000)
  targetTime.value = `${String(next.getHours()).padStart(2, '0')}:${String(next.getMinutes()).padStart(2, '0')}`
  settingsOpen.value = true
  window.__cytimeShowControls?.()
}

function resetTask() { if (task.value) timeStore.removeCountdown(task.value) }
watch(settingsOpen, open => { if (open) window.__cytimeShowControls?.() })
</script>

<template>
  <section class="focus-view">
    <div class="focus-status">{{ task?.status === 'paused' ? '已暂停' : task?.label || '准备好开始一段倒计时' }}</div>
    <time ref="clockRef" class="focus-clock" :class="{ muted: !task, warning: isWarning }" role="button" tabindex="0" aria-label="打开倒计时设置" @click="openSettings" @keydown.enter.prevent="openSettings" @keydown.space.prevent="openSettings"><template v-for="(char, index) in display.split('')" :key="index"><b v-if="char === ':'">:</b><span v-else class="hero-digit">{{ char }}</span></template></time>
    <p v-if="isFinished" class="focus-caption finished-caption" role="status">时间到</p>
    <p v-else-if="isWarning" class="focus-caption warning-caption" role="status">{{ Math.ceil(remaining) }} 秒后结束</p>
    <div class="focus-controls">
       <button type="button" class="focus-control primary" @click="openSettings"><FluentIcon icon="add-20-regular" :width="17" /> 新建</button>
      <button v-if="task?.status === 'running'" type="button" class="focus-control" @click="timeStore.pauseCountdown(task)"><FluentIcon icon="pause-20-filled" :width="17" /> 暂停</button>
      <button v-if="task?.status === 'paused'" type="button" class="focus-control" @click="timeStore.resumeCountdown(task)"><FluentIcon icon="play-20-filled" :width="17" /> 继续</button>
      <button v-if="task" type="button" class="focus-control" @click="resetTask"><FluentIcon icon="arrow-reset-20-regular" :width="17" /> 重置</button>
    </div>

    <div v-if="settingsOpen" class="focus-dialog-layer" @click.self="settingsOpen = false">
      <form class="focus-dialog countdown-dialog surface-panel" @submit.prevent="addTask">
        <div class="dialog-heading"><div><span class="eyebrow">COUNTDOWN</span><h2>设置倒计时</h2></div><button type="button" class="dialog-close" @click="settingsOpen = false"><FluentIcon icon="dismiss-20-regular" :width="18" /></button></div>
        <section class="duration-editor"><h3>时间设置</h3><div class="duration-columns"><div v-for="item in [{ key: 'hours', label: '时', value: hours }, { key: 'minutes', label: '分', value: minutes }, { key: 'seconds', label: '秒', value: seconds }]" :key="item.key" class="duration-column"><button type="button" @click="adjust(item.key, 1)">+</button><label class="duration-value"><input :value="String(item.value).padStart(2, '0')" inputmode="numeric" maxlength="2" :aria-label="`${item.label}数`" @focus="$event.target.select()" @change="setField(item.key, $event)" @keydown.enter.prevent /><span>{{ item.label }}</span></label><button type="button" @click="adjust(item.key, -1)">−</button></div></div></section>
        <section class="quick-duration"><h3>快速设置</h3><div class="quick-options"><button v-for="item in [{ value: 600, label: '10分钟' }, { value: 1800, label: '30分钟' }, { value: 4500, label: '75分钟' }]" :key="item.label" type="button" :class="{ active: quickChoice === item.value }" @click="selectQuick(item.value)">{{ item.label }}</button></div></section>
        <label class="dialog-label">任务名称 <span>可选</span><input v-model="label" placeholder="例如：数学作业" /></label>
        <div class="advanced-target"><div class="advanced-toggle"><span>使用目标时刻</span><button type="button" class="switch" :class="{ on: targetEnabled }" :aria-pressed="targetEnabled" @click="targetEnabled = !targetEnabled"><i></i></button></div><div v-if="targetEnabled" class="target-pickers"><FluentDatePicker v-model="targetDate" placeholder="日期" /><FluentTimePicker v-model="targetTime" placeholder="时间" /></div></div>
        <p v-if="inputError" class="field-error">{{ inputError }}</p>
        <div class="dialog-actions"><button type="button" class="focus-control" @click="settingsOpen = false">取消</button><button type="submit" class="focus-control primary">确认</button></div>
      </form>
    </div>
  </section>
</template>
