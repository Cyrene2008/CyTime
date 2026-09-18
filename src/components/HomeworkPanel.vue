<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useContentStore } from '../stores/content'
import { useSettingsStore } from '../stores/settings'

const contentStore = useContentStore()
const settingsStore = useSettingsStore()

const CUSTOM_SUBJECT = '__custom__'
const subjectPresets = ['语文', '数学', '英语', '物理', '化学', '生物', '历史', '政治', '地理', '其他']
const subjectOptions = [...subjectPresets.map(value => ({ value, label: value })), { value: CUSTOM_SUBJECT, label: '自定义…' }]

const items = computed(() => contentStore.content.homework)
const pageSize = 4
const page = ref(1)
const pageCount = computed(() => Math.max(1, Math.ceil(items.value.length / pageSize)))
const pagedItems = computed(() => items.value.slice((page.value - 1) * pageSize, page.value * pageSize))

const editorOpen = ref(false)
const editingId = ref(null)
const subjectChoice = ref('数学')
const customSubject = ref('')
const content = ref('')
const startDate = ref('')
const startTime = ref('')
const dueDate = ref('')
const dueTime = ref('')
const formError = ref('')
let rotateTimer

function parseStamp(value) {
  const [date = '', time = ''] = String(value || '').split('T')
  return { date, time }
}

function buildStamp(date, time, fallback) {
  if (!date) return ''
  return `${date}T${time || fallback}`
}

function formatStamp(value) {
  const { date, time } = parseStamp(value)
  if (!date) return ''
  return `${date.slice(5)} ${time || ''}`.trim()
}

function openEditor(item = null) {
  editingId.value = item?.id || null
  const subject = item?.subject || '数学'
  if (subjectPresets.includes(subject)) {
    subjectChoice.value = subject
    customSubject.value = ''
  } else {
    subjectChoice.value = CUSTOM_SUBJECT
    customSubject.value = subject
  }
  content.value = item?.content || ''
  const start = parseStamp(item?.startAt)
  startDate.value = start.date
  startTime.value = start.time
  const due = parseStamp(item?.dueAt)
  dueDate.value = due.date
  dueTime.value = due.time
  formError.value = ''
  editorOpen.value = true
}

function closeEditor() { editorOpen.value = false }

function guardSubmitClick(event) {
  const button = event.target?.closest?.('button')
  if (button && button.type === 'submit' && !button.closest('.dialog-actions')) event.preventDefault()
}

function saveHomework() {
  if (!content.value.trim()) { formError.value = '请填写作业内容'; return }
  const subjectName = subjectChoice.value === CUSTOM_SUBJECT ? customSubject.value.trim() : subjectChoice.value
  const payload = {
    subject: subjectName || '其他',
    content: content.value,
    startAt: buildStamp(startDate.value, startTime.value, '00:00'),
    dueAt: buildStamp(dueDate.value, dueTime.value, '23:59')
  }
  if (editingId.value) {
    const item = items.value.find(entry => entry.id === editingId.value)
    if (item) contentStore.updateHomework(item, payload)
  } else contentStore.addHomework(payload)
  closeEditor()
}

function cyclePosition() {
  settingsStore.update({ homeworkPosition: settingsStore.settings.homeworkPosition === 'left' ? 'right' : 'left' })
}

function adjustFont(amount) {
  const next = Math.max(10, Math.min(24, Number(settingsStore.settings.homeworkFontSize) + amount))
  settingsStore.update({ homeworkFontSize: next })
}

watch(pageCount, value => { if (page.value > value) page.value = value })

onMounted(() => {
  rotateTimer = window.setInterval(() => {
    if (editorOpen.value || pageCount.value <= 1) return
    page.value = page.value % pageCount.value + 1
  }, 10000)
})

onUnmounted(() => window.clearInterval(rotateTimer))
</script>

<template>
  <aside class="homework-panel" :class="`homework-${settingsStore.settings.homeworkPosition}`" :style="{ '--homework-font-size': `${settingsStore.settings.homeworkFontSize}px` }" aria-label="作业板">
    <header class="homework-header"><div><span class="homework-kicker">WORK</span><h2>作业板</h2></div><div class="homework-tools"><button type="button" class="micro-button" aria-label="切换作业板位置" @click="cyclePosition">{{ settingsStore.settings.homeworkPosition === 'left' ? '右侧' : '左侧' }}</button><button type="button" class="micro-button" aria-label="减小作业板字号" @click="adjustFont(-1)">A−</button><button type="button" class="micro-button" aria-label="增大作业板字号" @click="adjustFont(1)">A＋</button></div></header>
    <div class="homework-list"><div v-for="item in pagedItems" :key="item.id" class="homework-item" :class="{ completed: item.completed }"><span><strong>{{ item.subject }}</strong><span class="homework-content" :title="item.content">{{ item.content }}</span><small v-if="item.dueAt" class="homework-due">截止 {{ formatStamp(item.dueAt) }}</small></span><div class="homework-item-actions"><button type="button" class="homework-action" :aria-label="`编辑${item.subject}作业`" @click="openEditor(item)">编辑</button><button type="button" class="homework-remove" aria-label="删除作业" @click="contentStore.removeHomework(item)">×</button></div></div><p v-if="!items.length" class="homework-empty">还没有布置作业</p></div>
    <div v-if="pageCount > 1" class="homework-pager"><button type="button" class="micro-button" aria-label="上一页" @click="page = page > 1 ? page - 1 : pageCount">‹</button><span>{{ page }} / {{ pageCount }}</span><button type="button" class="micro-button" aria-label="下一页" @click="page = page < pageCount ? page + 1 : 1">›</button></div>
    <div class="homework-footer"><button type="button" class="homework-add-button" @click="openEditor()">布置作业</button></div>

    <Teleport to="body">
      <div v-if="editorOpen" class="focus-dialog-layer" @click.self="closeEditor">
        <form class="focus-dialog homework-dialog surface-panel" @submit.prevent="saveHomework" @click="guardSubmitClick">
          <div class="dialog-heading"><div><span class="eyebrow">HOMEWORK</span><h2>{{ editingId ? '编辑作业' : '布置作业' }}</h2></div><button type="button" class="dialog-close" aria-label="关闭作业编辑" @click="closeEditor"><FluentIcon icon="dismiss-20-regular" :width="18" /></button></div>
          <div class="homework-form">
            <label class="dialog-label">科目<FluentSelect v-model="subjectChoice" :options="subjectOptions" /></label>
            <label v-if="subjectChoice === CUSTOM_SUBJECT" class="dialog-label">自定义科目<input v-model="customSubject" placeholder="例如：信息技术" /></label>
            <label class="dialog-label">作业内容<textarea v-model="content" rows="4" placeholder="例如：完成练习册第 12 页"></textarea></label>
            <div class="homework-time-grid">
              <label class="dialog-label">开始时间 <span>可选</span><div class="homework-time-row"><FluentDatePicker v-model="startDate" placeholder="日期" /><FluentTimePicker v-model="startTime" placeholder="时间" /></div></label>
              <label class="dialog-label">截止时间 <span>可选</span><div class="homework-time-row"><FluentDatePicker v-model="dueDate" placeholder="日期" /><FluentTimePicker v-model="dueTime" placeholder="时间" /></div></label>
            </div>
            <p v-if="formError" class="field-error">{{ formError }}</p>
          </div>
          <div class="dialog-actions"><button type="button" class="focus-control" @click="closeEditor">取消</button><button type="submit" class="focus-control primary">{{ editingId ? '保存' : '布置' }}</button></div>
        </form>
      </div>
    </Teleport>
  </aside>
</template>
