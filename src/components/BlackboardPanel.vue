<script setup>
import { computed, ref } from 'vue'
import { useTimeStore } from '../stores/time'
import { useSettingsStore } from '../stores/settings'
import { useContentStore } from '../stores/content'
import { formatDuration } from '../utils/time'
import { localDateStr, resolveDay, nextDutyDate } from '../services/duty'

const timeStore = useTimeStore()
const settingsStore = useSettingsStore()
const contentStore = useContentStore()

const duty = computed(() => contentStore.content.duty)
const realToday = computed(() => localDateStr(new Date(timeStore.now)))
const pinnedDate = ref(null)
const displayDate = computed(() => pinnedDate.value || realToday.value)
const atToday = computed(() => !pinnedDate.value || pinnedDate.value === realToday.value)

const sections = computed(() => resolveDay(duty.value, displayDate.value))
const hasRoster = computed(() => duty.value.rosters.length > 0)
const hasPrev = computed(() => Boolean(nextDutyDate(duty.value, displayDate.value, -1)))
const hasNext = computed(() => Boolean(nextDutyDate(duty.value, displayDate.value, 1)))

function memberName(memberId) {
  return duty.value.members.find(member => member.id === memberId)?.name || '—'
}
function lineNames(line) {
  return line.memberIds.length ? line.memberIds.map(memberName).join('、') : '待分配'
}

const weekdayText = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
const dateLabel = computed(() => {
  const [year, month, day] = displayDate.value.split('-').map(Number)
  return `${month}月${day}日 ${weekdayText[new Date(year, month - 1, day).getDay()]}`
})
const previewing = computed(() => pinnedDate.value && pinnedDate.value !== realToday.value)

function step(delta) {
  const target = nextDutyDate(duty.value, displayDate.value, delta)
  if (target) pinnedDate.value = target === realToday.value ? null : target
}
function backToday() {
  pinnedDate.value = null
}

const side = computed(() => {
  const position = settingsStore.settings.blackboardPosition
  if (position === 'left' || position === 'right') return position
  return settingsStore.settings.homeworkPosition === 'right' ? 'left' : 'right'
})

function countdownRemaining(task) {
  return task?.status === 'paused' ? Math.ceil(task.pausedRemaining / 1000) : Math.max(0, Math.ceil((task.targetAt - timeStore.now) / 1000))
}
const tasks = computed(() => [
  ...timeStore.activeCountdowns.map(task => ({ key: `cd-${task.id}`, kind: 'countdown', task, to: '/countdown', dot: 'pink' })),
  ...timeStore.activeTimers.map(task => ({ key: `tm-${task.id}`, kind: 'timer', task, to: '/timer', dot: 'green' }))
])
function taskTime(item) {
  const seconds = item.kind === 'countdown' ? countdownRemaining(item.task) : Math.floor(timeStore.timerElapsed(item.task))
  return formatDuration(seconds)
}
function selectTask(item) {
  if (item.kind === 'countdown') timeStore.selectCountdown(item.task)
  else timeStore.selectTimer(item.task)
}

function adjustFont(amount) {
  const next = Math.max(70, Math.min(160, (Number(settingsStore.settings.blackboardFontScale) || 100) + amount * 5))
  settingsStore.update({ blackboardFontScale: next })
}
</script>

<template>
  <aside class="blackboard-panel" :class="`blackboard-${side}`" aria-label="小黑板">
    <header class="blackboard-header">
      <div><span class="blackboard-kicker">BLACKBOARD</span><h2>小黑板</h2></div>
      <div class="blackboard-head-actions">
        <span v-if="previewing" class="blackboard-preview-badge">预览</span>
        <button type="button" class="micro-button icon-only" title="减小字号" aria-label="减小黑板字号" @click="adjustFont(-1)"><FluentIcon icon="font-decrease-20-regular" :width="14" /></button>
        <button type="button" class="micro-button icon-only" title="增大字号" aria-label="增大黑板字号" @click="adjustFont(1)"><FluentIcon icon="font-increase-20-regular" :width="14" /></button>
      </div>
    </header>
    <div v-if="tasks.length" class="blackboard-timers">
      <RouterLink v-for="item in tasks" :key="item.key" :to="item.to" class="blackboard-timer" @click="selectTask(item)">
        <span class="task-dot" :class="item.dot"></span>
        <span class="blackboard-timer-label">{{ item.task.label }}</span>
        <strong>{{ taskTime(item) }}</strong>
      </RouterLink>
    </div>
    <div class="blackboard-body">
      <template v-if="sections.length">
        <section v-for="section in sections" :key="section.roster.id" class="blackboard-roster">
          <div class="blackboard-roster-head"><strong>{{ section.roster.name }}</strong><small>第 {{ section.occurrence + 1 }} 次</small></div>
          <div v-for="line in section.lines" :key="line.choreId" class="blackboard-line" :class="{ modified: line.overridden }">
            <span class="blackboard-chore">{{ line.name }}<em v-if="line.overridden">调</em></span>
            <span class="blackboard-names">{{ lineNames(line) }}</span>
          </div>
        </section>
      </template>
      <p v-else class="blackboard-empty">
        <template v-if="hasRoster">今日无值日安排</template>
        <template v-else>尚无值日名单<small>在 设置 · 值日管理 中导入或新建</small></template>
      </p>
    </div>
    <footer class="blackboard-footer">
      <button type="button" class="micro-button icon-only" title="上一天" aria-label="上一天" :disabled="!hasPrev" @click="step(-1)"><FluentIcon icon="chevron-left-20-regular" :width="14" /></button>
      <span class="blackboard-date">{{ dateLabel }}</span>
      <button type="button" class="micro-button" :disabled="atToday" @click="backToday">回到今天</button>
      <button type="button" class="micro-button icon-only" title="下一天" aria-label="下一天" :disabled="!hasNext" @click="step(1)"><FluentIcon icon="chevron-right-20-regular" :width="14" /></button>
    </footer>
  </aside>
</template>
