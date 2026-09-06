<script setup>
import { computed, ref } from 'vue'
import { useTimeStore } from '../stores/time'

const timeStore = useTimeStore()
const label = ref('')
const mode = ref('absolute')
const modeOptions = [{ value: 'absolute', label: '绝对计时' }, { value: 'runtime', label: '运行时计时' }]
const settingsOpen = ref(false)
const task = computed(() => {
  const selected = timeStore.timers.find(item => item.id === timeStore.selectedTimerId)
  if (selected && ['running', 'paused'].includes(selected.status)) return selected
  return timeStore.timers.find(item => ['running', 'paused'].includes(item.status)) || null
})
const display = computed(() => {
  const seconds = Math.max(0, Math.floor(task.value ? timeStore.timerElapsed(task.value) : 0))
  return [Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), seconds % 60].map(value => String(value).padStart(2, '0')).join(':')
})

function startTimer() {
  if (window.__cytimeMiniMode && task.value) return
  timeStore.addTimer(label.value, mode.value)
  label.value = ''
  settingsOpen.value = false
}
function removeTask() { if (task.value) timeStore.removeTimer(task.value) }
</script>

<template>
  <section class="focus-view">
    <div class="focus-status">{{ task?.status === 'paused' ? '已暂停' : task?.label || '准备好记录一段时间' }}</div>
    <time class="focus-clock" :class="{ muted: !task }" role="button" tabindex="0" aria-label="打开计时器设置" @click="settingsOpen = true" @keydown.enter.prevent="settingsOpen = true" @keydown.space.prevent="settingsOpen = true">{{ display }}</time>
    <p v-if="task" class="focus-caption">{{ task.mode === 'absolute' ? '绝对计时' : '运行时计时' }}</p>
    <div class="focus-controls">
      <button type="button" class="focus-control primary" @click="settingsOpen = true"><FluentIcon icon="add-20-regular" :width="17" /> 新建</button>
      <button v-if="task?.status === 'running'" type="button" class="focus-control" @click="timeStore.pauseTimer(task)"><FluentIcon icon="pause-20-filled" :width="17" /> 暂停</button>
      <button v-if="task?.status === 'paused'" type="button" class="focus-control" @click="timeStore.resumeTimer(task)"><FluentIcon icon="play-20-filled" :width="17" /> 继续</button>
      <button v-if="task" type="button" class="focus-control" @click="removeTask"><FluentIcon icon="arrow-reset-20-regular" :width="17" /> 重置</button>
    </div>
    <div v-if="settingsOpen" class="focus-dialog-layer" @click.self="settingsOpen = false">
       <form class="focus-dialog timer-dialog surface-panel" @submit.prevent="startTimer">
        <div class="dialog-heading"><div><span class="eyebrow">TIMER</span><h2>设置计时器</h2></div><button type="button" class="dialog-close" @click="settingsOpen = false"><FluentIcon icon="dismiss-20-regular" :width="18" /></button></div>
        <label class="dialog-label">任务名称 <span>可选</span><input v-model="label" placeholder="例如：英语阅读" /></label>
         <label class="dialog-label">计时模式<FluentSelect v-model="mode" :options="modeOptions" /></label>
        <div class="dialog-actions"><button type="button" class="focus-control" @click="settingsOpen = false">取消</button><button type="submit" class="focus-control primary">开始</button></div>
      </form>
    </div>
  </section>
</template>
