<script setup>
import { computed, inject, nextTick, onUnmounted, ref } from 'vue'
import { useTimeStore } from '../stores/time'
import { useSettingsStore } from '../stores/settings'
import { useContentStore } from '../stores/content'
import { formatDuration } from '../utils/time'
import { localDateStr, resolveDay, resolveRosterDay, nextDutyDate } from '../services/duty'
import { useDisplayTime } from '../composables/useDisplayTime'

const timeStore = useTimeStore()
const { now } = useDisplayTime()
const settingsStore = useSettingsStore()
const contentStore = useContentStore()
const openSettings = inject('cytimeOpenSettings', null)

const duty = computed(() => contentStore.content.duty)
const realToday = computed(() => localDateStr(new Date(now.value)))
const pinnedDate = ref(null)
const displayDate = computed(() => pinnedDate.value || realToday.value)
const atToday = computed(() => !pinnedDate.value || pinnedDate.value === realToday.value)

const sections = computed(() => resolveDay(duty.value, displayDate.value))
const hasRoster = computed(() => duty.value.rosters.length > 0 || Boolean(duty.value.cleaningPlans?.length))
const hasPrev = computed(() => Boolean(nextDutyDate(duty.value, displayDate.value, -1)))
const hasNext = computed(() => Boolean(nextDutyDate(duty.value, displayDate.value, 1)))

function memberName(memberId) {
  return duty.value.members.find(member => member.id === memberId)?.name || '—'
}
function lineNames(line) {
  if (line.names) return line.names.join('、')
  return line.memberIds.length ? line.memberIds.map(memberName).join('、') : '待指定'
}

const weekdayText = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
function formatDateLabel(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number)
  return `${month}月${day}日 ${weekdayText[new Date(year, month - 1, day).getDay()]}`
}
const dateLabel = computed(() => formatDateLabel(displayDate.value))
const previewing = computed(() => pinnedDate.value && pinnedDate.value !== realToday.value)

function step(delta) {
  const target = nextDutyDate(duty.value, displayDate.value, delta)
  if (target) pinnedDate.value = target === realToday.value ? null : target
  editor.value = null
}
function backToday() {
  pinnedDate.value = null
  editor.value = null
}

const side = computed(() => {
  const position = settingsStore.settings.blackboardPosition
  const homeworkSide = settingsStore.settings.homeworkPosition
  if ((position === 'left' || position === 'right') && (!settingsStore.settings.showHomework || position !== homeworkSide)) return position
  return homeworkSide === 'right' ? 'left' : 'right'
})

function countdownRemaining(task) {
  return task?.status === 'paused' ? Math.ceil(task.pausedRemaining / 1000) : Math.max(0, Math.ceil((task.targetAt - now.value) / 1000))
}
const tasks = computed(() => [
  ...timeStore.activeCountdowns.map(task => ({ key: `cd-${task.id}`, kind: 'countdown', task, to: '/countdown', dot: 'pink' })),
  ...timeStore.activeTimers.map(task => ({ key: `tm-${task.id}`, kind: 'timer', task, to: '/timer', dot: 'green' }))
])
function taskTime(item) {
  const seconds = item.kind === 'countdown' ? countdownRemaining(item.task) : Math.floor(timeStore.timerElapsed(item.task, now.value))
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

const editor = ref(null)
function openLineEditor(section, line) {
  editor.value = {
    date: displayDate.value,
    dateLabel: formatDateLabel(displayDate.value),
    rosterId: section.roster.id,
    rosterName: section.roster.name,
    choreId: line.choreId,
    name: line.name
  }
}
const editorIds = computed(() => {
  if (!editor.value) return []
  const section = sections.value.find(item => item.roster.id === editor.value.rosterId)
  const line = section?.lines.find(item => item.choreId === editor.value.choreId)
  return line?.memberIds || []
})
function writeEditorLine(mutate) {
  if (!editor.value) return
  const roster = duty.value.rosters.find(item => item.id === editor.value.rosterId)
  if (!roster) return
  const { lines } = resolveRosterDay(duty.value, roster, editor.value.date, localDateStr())
  const entries = lines.map(line => ({ choreId: line.choreId, name: line.name, memberIds: [...line.memberIds] }))
  const target = entries.find(entry => entry.choreId === editor.value.choreId)
  if (!target) return
  mutate(target)
  contentStore.setOverride(editor.value.date, roster.id, entries)
}
function toggleEditorMember(memberId) {
  writeEditorLine(target => {
    const index = target.memberIds.indexOf(memberId)
    if (index >= 0) target.memberIds.splice(index, 1)
    else target.memberIds.push(memberId)
  })
}
function clearEditorLine() {
  writeEditorLine(target => { target.memberIds = [] })
}

const notepad = computed(() => contentStore.content.notepad || '')
const notepadEditing = ref(false)
const notepadDraft = ref('')
const notepadRef = ref(null)
const notepadButton = ref(null)
let notepadTimer = 0
function openNotepad() {
  notepadDraft.value = notepad.value
  notepadEditing.value = true
  nextTick(() => notepadRef.value?.focus())
}
function saveNotepad(restoreFocus = false) {
  window.clearTimeout(notepadTimer)
  notepadTimer = 0
  contentStore.updateNotepad(notepadDraft.value)
  notepadEditing.value = false
  if (restoreFocus) nextTick(() => notepadButton.value?.focus())
}
function onNotepadInput() {
  window.clearTimeout(notepadTimer)
  notepadTimer = window.setTimeout(() => {
    notepadTimer = 0
    contentStore.updateNotepad(notepadDraft.value)
  }, 500)
}
function clearNotepad() {
  window.clearTimeout(notepadTimer)
  notepadTimer = 0
  notepadDraft.value = ''
  contentStore.updateNotepad('')
}
onUnmounted(() => {
  if (!notepadTimer) return
  window.clearTimeout(notepadTimer)
  contentStore.updateNotepad(notepadDraft.value)
})
</script>

<template>
  <aside class="blackboard-panel" :class="`blackboard-${side}`" aria-label="小黑板">
    <header class="blackboard-header">
      <div><span class="blackboard-kicker">值日与记事</span><h2>小黑板</h2></div>
      <div class="blackboard-head-actions">
        <span v-if="previewing" class="blackboard-preview-badge">预览</span>
        <button type="button" class="micro-button icon-only" title="值日管理" aria-label="打开值日管理" @click="openSettings?.('duty')"><FluentIcon icon="settings-20-regular" :width="14" /></button>
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
          <div class="blackboard-roster-head"><strong>{{ section.roster.name }}</strong><small v-if="section.roster.mode === 'cleaning'">清洁排班</small><small v-else-if="section.roster.mode === 'manual'">手动指定</small><small v-else>第 {{ section.occurrence + 1 }} 次</small></div>
          <template v-if="section.roster.mode === 'manual'">
            <button v-for="line in section.lines" :key="line.choreId" type="button" class="blackboard-line blackboard-line-edit" :class="{ modified: line.overridden }" @click="openLineEditor(section, line)">
              <span class="blackboard-chore">{{ line.name }}<em v-if="line.overridden">调</em></span>
              <span class="blackboard-names">{{ lineNames(line) }}</span>
            </button>
          </template>
          <template v-else>
            <div v-for="line in section.lines" :key="line.choreId" class="blackboard-line" :class="{ modified: line.overridden }">
              <span class="blackboard-chore">{{ line.name }}<em v-if="line.overridden">调</em></span>
              <span class="blackboard-names">{{ lineNames(line) }}</span>
            </div>
          </template>
        </section>
      </template>
      <p v-else class="blackboard-empty">
        <template v-if="hasRoster">今日无值日安排</template>
        <template v-else>还没有值日名单<small>可到「值日管理」添加成员和任务。</small></template>
      </p>
      <section class="blackboard-notepad">
        <div class="blackboard-notepad-head">
          <span>记事板</span>
          <button v-if="notepad && !notepadEditing" type="button" class="micro-button icon-only" title="清空记事板" aria-label="清空记事板" @click="clearNotepad"><FluentIcon icon="delete-20-regular" :width="12" /></button>
        </div>
        <textarea v-if="notepadEditing" ref="notepadRef" v-model="notepadDraft" class="blackboard-notepad-input" rows="3" aria-label="记事内容" placeholder="写点什么…" @input="onNotepadInput" @blur="saveNotepad()" @keydown.esc.prevent="saveNotepad(true)"></textarea>
        <button v-else ref="notepadButton" type="button" class="blackboard-notepad-text" :class="{ empty: !notepad }" @click="openNotepad">{{ notepad || '点此记点什么…' }}</button>
      </section>
    </div>
    <footer class="blackboard-footer">
      <button type="button" class="micro-button icon-only" title="上一天" aria-label="上一天" :disabled="!hasPrev" @click="step(-1)"><FluentIcon icon="chevron-left-20-regular" :width="14" /></button>
      <span class="blackboard-date">{{ dateLabel }}</span>
      <button v-if="!atToday" type="button" class="micro-button" @click="backToday">回到今天</button>
      <button type="button" class="micro-button icon-only" title="下一天" aria-label="下一天" :disabled="!hasNext" @click="step(1)"><FluentIcon icon="chevron-right-20-regular" :width="14" /></button>
    </footer>
    <div v-if="editor" class="blackboard-editor">
      <div class="blackboard-editor-head">
        <strong>{{ editor.name }}</strong>
        <button type="button" class="micro-button icon-only" title="关闭" aria-label="关闭" @click="editor = null"><FluentIcon icon="dismiss-20-regular" :width="13" /></button>
      </div>
      <p class="blackboard-editor-hint">{{ editor.dateLabel }} · {{ editor.rosterName }} · 点选即保存</p>
      <div class="blackboard-editor-chips">
        <button v-for="member in duty.members" :key="member.id" type="button" class="category-chip" :class="{ active: editorIds.includes(member.id) }" @click="toggleEditorMember(member.id)">{{ member.name }}</button>
      </div>
      <div class="blackboard-editor-actions">
        <button type="button" class="micro-button" :disabled="!editorIds.length" @click="clearEditorLine">清空</button>
        <button type="button" class="micro-button micro-primary" @click="editor = null">完成</button>
      </div>
    </div>
  </aside>
</template>
