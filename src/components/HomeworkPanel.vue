<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useContentStore } from '../stores/content'
import { useSettingsStore } from '../stores/settings'

const contentStore = useContentStore()
const settingsStore = useSettingsStore()

const CUSTOM_SUBJECT = '__custom__'
const subjectPresets = ['语文', '数学', '英语', '物理', '化学', '生物', '历史', '政治', '地理', '其他']
const subjectOptions = [...subjectPresets.map(value => ({ value, label: value })), { value: CUSTOM_SUBJECT, label: '自定义…' }]

const items = computed(() => contentStore.content.homework)
const historyItems = computed(() => [...contentStore.content.homeworkHistory].reverse())
const historyOpen = ref(false)
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
const now = ref(Date.now())
let rotateTimer
let nowTimer

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

function formatTimeRange(startAt, dueAt) {
  const start = parseStamp(startAt)
  const due = parseStamp(dueAt)
  if (start.date && due.date && start.date === due.date) {
    return `${start.time || '00:00'} → ${due.time || '23:59'}`
  }
  const s = formatStamp(startAt)
  const d = formatStamp(dueAt)
  if (s && d) return `${s} → ${d}`
  if (d) return `截止 ${d}`
  if (s) return `开始 ${s}`
  return ''
}

function stampToMs(value, endOfMinute = false) {
  const { date, time } = parseStamp(value)
  if (!date) return NaN
  const [y, mo, d] = date.split('-').map(Number)
  const [h = 0, mi = 0, s] = String(time || '00:00').split(':').map(Number)
  if (!y || !mo || !d) return NaN
  const sec = s ?? (endOfMinute ? 59 : 0)
  return new Date(y, mo - 1, d, h, mi, sec).getTime()
}

function getItemStatus(item) {
  const ts = now.value
  const hasStart = !!item.startAt
  const hasDue = !!item.dueAt
  if (!hasStart && !hasDue) return null
  if (hasStart) {
    const startMs = stampToMs(item.startAt)
    if (Number.isFinite(startMs) && ts < startMs) return 'upcoming'
  }
  if (hasDue) {
    const dueMs = stampToMs(item.dueAt)
    if (Number.isFinite(dueMs) && ts >= dueMs) return 'ended'
  }
  return 'ongoing'
}

function timeValue(value, fallback = Number.MAX_SAFE_INTEGER) {
  const ms = stampToMs(value)
  return Number.isFinite(ms) ? ms : fallback
}

const ongoingItems = computed(() => items.value
  .filter(i => !getItemStatus(i) || getItemStatus(i) === 'ongoing')
  .sort((a, b) => timeValue(a.startAt) - timeValue(b.startAt) || timeValue(a.dueAt) - timeValue(b.dueAt)))
const upcomingItems = computed(() => items.value
  .filter(i => getItemStatus(i) === 'upcoming')
  .sort((a, b) => timeValue(a.startAt) - timeValue(b.startAt)))
const endedItems = computed(() => items.value
  .filter(i => getItemStatus(i) === 'ended')
  .sort((a, b) => timeValue(b.dueAt, 0) - timeValue(a.dueAt, 0)))

const sortedItems = computed(() => [...ongoingItems.value, ...upcomingItems.value, ...endedItems.value])
const DEFAULT_PAGE_SIZE = 3
const pageSize = ref(DEFAULT_PAGE_SIZE)
const page = ref(1)
const pageCount = computed(() => Math.max(1, Math.ceil(sortedItems.value.length / pageSize.value)))
const visibleItems = computed(() => sortedItems.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))

watch(pageCount, value => { if (page.value > value) page.value = value })

const panelRef = ref(null)
const listRef = ref(null)
let pageAnimating = false
let activeAnim = null

function setPage(next) {
  const count = pageCount.value
  if (count <= 1) return
  let target = next
  if (target < 1) target = count
  if (target > count) target = 1
  if (target === page.value) return
  const panel = panelRef.value
  const from = panel ? panel.offsetHeight : 0
  page.value = target
  startRotateTimer()
  nextTick(() => {
    const el = panelRef.value
    if (!el || !from || typeof el.animate !== 'function') return
    const to = el.offsetHeight
    if (to === from) return
    pageAnimating = true
    const anim = el.animate(
      [{ height: `${from}px` }, { height: `${to}px` }],
      { duration: 300, easing: 'cubic-bezier(.2, .8, .2, 1)' }
    )
    activeAnim = anim
    const done = () => {
      if (activeAnim !== anim) return
      activeAnim = null
      pageAnimating = false
      scheduleMeasure()
    }
    anim.addEventListener('finish', done)
    anim.addEventListener('cancel', done)
  })
}

function measurePageSize() {
  const panel = panelRef.value
  const list = listRef.value
  if (!panel || !list || !panel.offsetHeight || pageAnimating) return
  if (window.innerWidth <= 620) {
    pageSize.value = 4
    return
  }
  const shell = panel.closest('.app-shell')
  const shellH = (shell && shell.clientHeight) || window.innerHeight
  let safeTop = 80
  let safeBottom = 76
  const dock = document.querySelector('.status-dock')
  if (dock && dock.offsetParent !== null && dock.offsetHeight > 0) {
    safeTop = Math.max(80, Math.round(dock.offsetTop + dock.offsetHeight + 12))
  }
  const settingsButton = document.querySelector('.footer-settings')
  if (settingsButton && settingsButton.offsetParent !== null) {
    const footer = settingsButton.closest('.clock-footer') || settingsButton
    let footerTop = 0
    let node = footer
    while (node && node !== shell && node !== document.body) {
      footerTop += node.offsetTop
      node = node.offsetParent
    }
    if (footerTop > 0 && footerTop < shellH) safeBottom = Math.max(76, Math.round(shellH - footerTop + 12))
  }
  panel.style.setProperty('--homework-safe-top', `${safeTop}px`)
  panel.style.setProperty('--homework-safe-bottom', `${safeBottom}px`)
  const available = Math.max(140, shellH - safeTop - safeBottom)
  let chrome = 28 + 22
  const header = panel.querySelector('.homework-header')
  const footerEl = panel.querySelector('.homework-footer')
  const pagerEl = panel.querySelector('.homework-pager')
  if (header) chrome += header.offsetHeight
  if (footerEl) chrome += footerEl.offsetHeight
  if (pagerEl && pageCount.value > 1) chrome += pagerEl.offsetHeight
  const listAvailable = Math.max(50, available - chrome)
  const children = [...list.children].filter(el => el.classList?.contains('homework-item'))
  if (!children.length) return
  const gap = 4
  const maxH = Math.max(...children.map(el => el.offsetHeight))
  const slot = maxH + gap
  const capacity = Math.max(1, Math.min(20, Math.floor((listAvailable + gap) / slot)))
  if (capacity !== pageSize.value) pageSize.value = capacity
}

let measureHandle = 0
function scheduleMeasure() {
  if (measureHandle) return
  measureHandle = requestAnimationFrame(() => { measureHandle = 0; measurePageSize() })
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

function todayDate() {
  const d = new Date()
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function saveHomework() {
  if (!content.value.trim()) { formError.value = '请填写作业内容'; return }
  const hasStartDate = !!startDate.value
  const hasDueDate = !!dueDate.value
  const hasStartTime = !!startTime.value
  const hasDueTime = !!dueTime.value
  if (hasStartDate && !hasDueDate && !hasDueTime) { formError.value = '填了开始日期就必须填截止日期'; return }
  if (hasDueDate && !hasStartDate && !hasStartTime) { formError.value = '填了截止日期就必须填开始日期'; return }
  if (hasStartTime && !hasStartDate) startDate.value = todayDate()
  if (hasDueTime && !hasDueDate) dueDate.value = todayDate()
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

function startRotateTimer() {
  window.clearInterval(rotateTimer)
  const interval = (settingsStore.settings.homeworkPageInterval || 10) * 1000
  rotateTimer = window.setInterval(() => {
    if (editorOpen.value || historyOpen.value || pageCount.value <= 1) return
    setPage(page.value + 1)
  }, interval)
}

let safeObserver = null
function observeSafeArea() {
  if (typeof ResizeObserver === 'undefined') return
  safeObserver = new ResizeObserver(() => scheduleMeasure())
  const dock = document.querySelector('.status-dock')
  const footer = document.querySelector('.clock-footer')
  if (dock) safeObserver.observe(dock)
  if (footer) safeObserver.observe(footer)
}

onMounted(() => {
  nowTimer = window.setInterval(() => { now.value = Date.now() }, 1000)
  contentStore.archivePastHomework()
  startRotateTimer()
  window.addEventListener('resize', scheduleMeasure)
  observeSafeArea()
  scheduleMeasure()
})

onUnmounted(() => {
  window.clearInterval(rotateTimer)
  window.clearInterval(nowTimer)
  window.removeEventListener('resize', scheduleMeasure)
  if (safeObserver) safeObserver.disconnect()
  if (measureHandle) cancelAnimationFrame(measureHandle)
  measureHandle = 0
})

watch(visibleItems, scheduleMeasure, { flush: 'post' })
watch(() => sortedItems.value.length, scheduleMeasure, { flush: 'post' })
watch(() => [settingsStore.settings.homeworkWidth, settingsStore.settings.homeworkFontSize, settingsStore.settings.statusDockScale, settingsStore.settings.statusDockOffsetY, settingsStore.settings.homeworkPosition, settingsStore.settings.uiScale], scheduleMeasure, { flush: 'post' })

watch(() => settingsStore.settings.homeworkPageInterval, () => {
  startRotateTimer()
})
</script>

<template>
  <aside ref="panelRef" class="homework-panel" :class="`homework-${settingsStore.settings.homeworkPosition}`" :style="{ '--homework-font-size': `${settingsStore.settings.homeworkFontSize}px` }" aria-label="作业板">
    <header class="homework-header">
      <div><span class="homework-kicker">WORK</span><h2>作业板</h2></div>
      <div class="homework-tools">
        <button type="button" class="micro-button icon-only" title="布置历史" aria-label="查看布置历史" @click="historyOpen = true"><FluentIcon icon="history-20-regular" :width="15" /></button>
        <button type="button" class="micro-button icon-only" title="切换位置" aria-label="切换作业板位置" @click="cyclePosition"><FluentIcon icon="arrow-swap-20-regular" :width="15" /></button>
        <button type="button" class="micro-button icon-only" title="减小字号" aria-label="减小作业板字号" @click="adjustFont(-1)"><FluentIcon icon="font-decrease-20-regular" :width="15" /></button>
        <button type="button" class="micro-button icon-only" title="增大字号" aria-label="增大作业板字号" @click="adjustFont(1)"><FluentIcon icon="font-increase-20-regular" :width="15" /></button>
      </div>
    </header>
    <div ref="listRef" class="homework-list">
      <div v-for="item in visibleItems" :key="item.id" class="homework-item" :class="{ completed: item.completed }">
        <span>
          <span class="homework-item-title">
            <strong>{{ item.subject }}</strong>
            <span v-if="getItemStatus(item)" class="homework-badge" :class="`badge-${getItemStatus(item)}`">
              {{ getItemStatus(item) === 'ongoing' ? '进行中' : getItemStatus(item) === 'upcoming' ? '即将进行' : '已结束' }}
            </span>
            <small v-if="formatTimeRange(item.startAt, item.dueAt)" class="homework-time-badge">{{ formatTimeRange(item.startAt, item.dueAt) }}</small>
          </span>
          <span class="homework-content" :title="item.content">{{ item.content }}</span>
        </span>
        <div class="homework-item-actions">
          <button type="button" class="homework-action" :aria-label="`编辑${item.subject}作业`" @click="openEditor(item)">编辑</button>
          <button type="button" class="homework-remove" aria-label="删除作业" @click="contentStore.removeHomework(item, { toHistory: true, reason: 'manual' })">×</button>
        </div>
      </div>
      <p v-if="!items.length" class="homework-empty">还没有布置作业</p>
    </div>
    <div v-if="pageCount > 1" class="homework-pager">
      <button type="button" class="micro-button" aria-label="上一页" @click="setPage(page - 1)">‹</button>
      <span>{{ page }} / {{ pageCount }}</span>
      <button type="button" class="micro-button" aria-label="下一页" @click="setPage(page + 1)">›</button>
      <span class="homework-page-progress" aria-hidden="true"><i :key="`${page}-${settingsStore.settings.homeworkPageInterval}`" :style="{ animationDuration: `${(settingsStore.settings.homeworkPageInterval || 10) * 1000}ms` }"></i></span>
    </div>
    <div class="homework-footer"><button type="button" class="homework-add-button" @click="openEditor()">布置作业</button></div>

    <Teleport to=".app-shell">
      <div v-if="editorOpen" class="focus-dialog-layer" @click.self="closeEditor">
        <form class="focus-dialog homework-dialog surface-panel" @submit.prevent="saveHomework" @click="guardSubmitClick">
          <div class="dialog-heading"><div><span class="eyebrow">HOMEWORK</span><h2>{{ editingId ? '编辑作业' : '布置作业' }}</h2></div><button type="button" class="dialog-close" aria-label="关闭作业编辑" @click="closeEditor"><FluentIcon icon="dismiss-20-regular" :width="18" /></button></div>
          <div class="homework-form">
            <label class="dialog-label">科目<FluentSelect v-model="subjectChoice" :options="subjectOptions" /></label>
            <label v-if="subjectChoice === CUSTOM_SUBJECT" class="dialog-label">自定义科目<input v-model="customSubject" placeholder="例如：信息技术" /></label>
            <label class="dialog-label">作业内容<textarea v-model="content" rows="4" placeholder="例如：完成练习册第 12 页"></textarea></label>
            <div class="homework-time-grid">
              <div class="dialog-label">开始时间<div class="homework-time-row"><FluentDatePicker v-model="startDate" placeholder="日期" /><FluentTimePicker v-model="startTime" placeholder="时间" /></div></div>
              <div class="dialog-label">截止时间<div class="homework-time-row"><FluentDatePicker v-model="dueDate" placeholder="日期" /><FluentTimePicker v-model="dueTime" placeholder="时间" /></div></div>
            </div>
            <p class="homework-hint">未填写日期时自动按今日计算；填写了日期则需同时填写开始和截止日期。</p>
            <p v-if="formError" class="field-error">{{ formError }}</p>
          </div>
          <div class="dialog-actions"><button type="button" class="focus-control" @click="closeEditor">取消</button><button type="submit" class="focus-control primary">{{ editingId ? '保存' : '布置' }}</button></div>
        </form>
      </div>
    </Teleport>

    <Teleport to=".app-shell">
      <div v-if="historyOpen" class="focus-dialog-layer" @click.self="historyOpen = false">
        <div class="focus-dialog homework-history-dialog surface-panel">
          <div class="dialog-heading"><div><span class="eyebrow">HISTORY</span><h2>布置历史</h2></div><button type="button" class="dialog-close" aria-label="关闭历史" @click="historyOpen = false"><FluentIcon icon="dismiss-20-regular" :width="18" /></button></div>
          <div class="homework-history-content">
            <p v-if="!historyItems.length" class="homework-empty">暂无历史记录</p>
            <div v-for="item in historyItems" :key="item.id" class="homework-history-item">
              <div class="homework-history-head">
                <strong>{{ item.subject }}</strong>
                <span class="homework-badge" :class="item.reason === 'auto' ? 'badge-auto' : 'badge-manual'">{{ item.reason === 'auto' ? '自动删除' : '手动删除' }}</span>
                <small v-if="formatTimeRange(item.startAt, item.dueAt)" class="homework-time-badge">{{ formatTimeRange(item.startAt, item.dueAt) }}</small>
              </div>
              <span class="homework-content">{{ item.content }}</span>
            </div>
          </div>
          <div class="dialog-actions">
            <button type="button" class="focus-control" @click="historyOpen = false">关闭</button>
            <button v-if="historyItems.length" type="button" class="focus-control danger-button" @click="contentStore.clearHomeworkHistory()">清空历史</button>
          </div>
        </div>
      </div>
    </Teleport>
  </aside>
</template>
