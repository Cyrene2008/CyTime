<script setup>
import { computed, inject, onMounted, onUnmounted, ref, watch } from 'vue'
import { useTimeStore } from '../stores/time'
import { useDigitBox } from '../composables/useDigitBox'
import { useDisplayTime } from '../composables/useDisplayTime'
import { useDialogActivity } from '../composables/useDialogActivity'
import { chooseAndSaveFile } from '../services/desktop'
import { MAX_TIMER_LAPS, formatLapDuration, serializeTimerLaps } from '../services/timerLaps'
import { fileNamePart } from '../utils/csv'
import { formatDate } from '../utils/time'

const timeStore = useTimeStore()
const { active, now } = useDisplayTime()
const refreshLayout = inject('cytimeRefreshLayout', null)
const label = ref('')
const mode = ref('absolute')
const modeOptions = [{ value: 'absolute', label: '连续计时' }, { value: 'runtime', label: '本次计时' }]
const settingsOpen = ref(false)
useDialogActivity([settingsOpen])
const lapsOpen = ref(false)
const lapPage = ref(1)
const lapMessage = ref('')
const LAP_PAGE_SIZE = 10
const task = computed(() => {
  const selected = timeStore.timers.find(item => item.id === timeStore.selectedTimerId)
  if (selected && ['running', 'paused'].includes(selected.status)) return selected
  return timeStore.timers.find(item => ['running', 'paused'].includes(item.status)) || null
})
const display = computed(() => {
  const seconds = Math.max(0, Math.floor(task.value ? timeStore.timerElapsed(task.value, now.value) : 0))
  return [Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), seconds % 60].map(value => String(value).padStart(2, '0')).join(':')
})
const clockRef = ref(null)
useDigitBox(clockRef)
const lapCount = computed(() => task.value?.laps?.length || 0)
const lapPageCount = computed(() => Math.max(1, Math.ceil(lapCount.value / LAP_PAGE_SIZE)))
const pagedLaps = computed(() => [...(task.value?.laps || [])].reverse().slice((lapPage.value - 1) * LAP_PAGE_SIZE, lapPage.value * LAP_PAGE_SIZE))

function recordLap() {
  if (!active.value || !task.value || settingsOpen.value) return
  const lap = timeStore.addTimerLap(task.value)
  if (!lap) { lapMessage.value = '继续计时后再记一段'; return }
  lapsOpen.value = true
  lapPage.value = 1
  lapMessage.value = ''
}
async function exportLaps() {
  if (!task.value || !lapCount.value) return
  try {
    const saved = await chooseAndSaveFile(serializeTimerLaps(task.value), `${fileNamePart(task.value.label, '计时器')}-${formatDate(new Date())}-分段.csv`)
    lapMessage.value = saved ? '分段记录已导出' : '已取消导出'
  } catch { lapMessage.value = '导出失败，请重试' }
}
watch(() => task.value?.id, () => { lapsOpen.value = false; lapPage.value = 1; lapMessage.value = '' })
watch(lapPageCount, count => { lapPage.value = Math.min(lapPage.value, count) })
watch([lapsOpen, lapCount, lapPage], () => refreshLayout?.(), { flush: 'post' })
onMounted(() => window.addEventListener('cytime:timer-lap', recordLap))
onUnmounted(() => window.removeEventListener('cytime:timer-lap', recordLap))

function startTimer() {
  if (window.__cytimeMiniMode && task.value) return
  timeStore.addTimer(label.value, mode.value)
  label.value = ''
  settingsOpen.value = false
}
function guardSubmitClick(event) {
  const button = event.target?.closest?.('button')
  if (button && button.type === 'submit' && !button.closest('.dialog-actions')) event.preventDefault()
}
function removeTask() { if (task.value) timeStore.removeTimer(task.value) }
</script>

<template>
  <section class="focus-view" :class="{ 'has-laps': lapsOpen && lapCount }">
    <div class="focus-status">{{ task?.status === 'paused' ? '已暂停' : task?.label || '点击时间开始计时' }}</div>
    <time ref="clockRef" class="focus-clock" :class="{ muted: !task }" role="button" tabindex="0" aria-label="打开计时器设置" @click="settingsOpen = true" @keydown.enter.prevent="settingsOpen = true" @keydown.space.prevent="settingsOpen = true"><template v-for="(char, index) in display.split('')" :key="index"><b v-if="char === ':'">:</b><span v-else class="hero-digit">{{ char }}</span></template></time>
    <p v-if="task" class="focus-caption">{{ task.mode === 'absolute' ? '连续计时' : '本次计时' }}</p>
    <div class="focus-controls">
      <button type="button" class="focus-control primary" @click="settingsOpen = true"><FluentIcon icon="add-20-regular" :width="17" /> 新建</button>
      <button v-if="task?.status === 'running'" type="button" class="focus-control" @click="timeStore.pauseTimer(task)"><FluentIcon icon="pause-20-filled" :width="17" /> 暂停</button>
      <button v-if="task?.status === 'paused'" type="button" class="focus-control" @click="timeStore.resumeTimer(task)"><FluentIcon icon="play-20-filled" :width="17" /> 继续</button>
      <button v-if="task" type="button" class="focus-control" @click="removeTask"><FluentIcon icon="arrow-reset-20-regular" :width="17" /> 重置</button>
      <button v-if="task" type="button" class="focus-control" :disabled="lapCount >= MAX_TIMER_LAPS" @click="recordLap"><FluentIcon icon="flag-20-regular" :width="17" /> 记一段</button>
      <button v-if="lapCount" type="button" class="focus-control" :aria-expanded="lapsOpen" @click="lapsOpen = !lapsOpen"><FluentIcon icon="history-20-regular" :width="17" /> 记录 ({{ lapCount }})</button>
    </div>
    <p v-if="lapMessage" class="timer-lap-message" role="status">{{ lapMessage }}</p>
    <section v-if="lapsOpen && lapCount" class="timer-laps" aria-label="分段记录">
      <header class="timer-lap-head"><strong>分段记录 <small>{{ lapCount }} 条</small></strong><div><button type="button" class="micro-button" @click="timeStore.removeLastTimerLap(task)">撤销上一段</button><button type="button" class="micro-button" @click="exportLaps"><FluentIcon icon="arrow-download-20-regular" :width="14" /> 导出</button></div></header>
      <div class="timer-lap-list"><table><thead><tr><th>分段</th><th>本段用时</th><th>累计用时</th></tr></thead><tbody><tr v-for="(lap, index) in pagedLaps" :key="lap.id"><td>{{ lapCount - (lapPage - 1) * LAP_PAGE_SIZE - index }}</td><td>{{ formatLapDuration(lap.split) }}</td><td>{{ formatLapDuration(lap.elapsed) }}</td></tr></tbody></table></div>
      <footer v-if="lapPageCount > 1" class="timer-lap-pager"><button type="button" class="micro-button" :disabled="lapPage === 1" @click="lapPage--">上一页</button><span>{{ lapPage }} / {{ lapPageCount }}</span><button type="button" class="micro-button" :disabled="lapPage === lapPageCount" @click="lapPage++">下一页</button></footer>
    </section>
    <div v-if="settingsOpen" class="focus-dialog-layer" @click.self="settingsOpen = false">
       <form class="focus-dialog timer-dialog surface-panel" @submit.prevent="startTimer" @click="guardSubmitClick">
        <div class="dialog-heading"><div><span class="eyebrow">TIMER</span><h2>设置计时器</h2></div><button type="button" class="dialog-close" @click="settingsOpen = false"><FluentIcon icon="dismiss-20-regular" :width="18" /></button></div>
        <label class="dialog-label">任务名称<input v-model="label" placeholder="例如：英语阅读" /></label>
         <label class="dialog-label">计时模式<FluentSelect v-model="mode" :options="modeOptions" /></label>
         <p class="timer-mode-hint">{{ mode === 'absolute' ? '关闭应用后仍继续计时。' : '关闭应用时暂停，下次可以接着计时。' }}</p>
        <div class="dialog-actions"><button type="button" class="focus-control" @click="settingsOpen = false">取消</button><button type="submit" class="focus-control primary">开始</button></div>
      </form>
    </div>
  </section>
</template>
