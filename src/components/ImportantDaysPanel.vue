<script setup>
import { computed, nextTick, onMounted, reactive, ref } from 'vue'
import { localDateStr } from '../services/duty'
import { groupImportantDays, importantDayStatus, isImportantDate } from '../services/importantDays'
import { useContentStore } from '../stores/content'
import { useTimeStore } from '../stores/time'

const props = defineProps({ focusOnOpen: Boolean })
const contentStore = useContentStore()
const timeStore = useTimeStore()
const heading = ref(null)
const nameInput = ref(null)
const dateInput = ref(null)
const editingId = ref('')
const pendingDelete = ref('')
const error = ref('')
const invalidField = ref('')
const notice = ref('')
const emptyDraft = () => ({ name: '', date: '', recurring: false, pinned: false })
const draft = reactive(emptyDraft())
let deleteTrigger = null

const today = computed(() => localDateStr(new Date(timeStore.now)))
const days = computed(() => groupImportantDays(contentStore.content.importantDays, today.value))
const sections = computed(() => [
  { title: '今天和即将到来', items: days.value.upcoming },
  { title: '已过去', items: days.value.past }
].filter(section => section.items.length))

onMounted(() => { if (props.focusOnOpen) heading.value?.focus() })

function clearError() {
  error.value = ''
  invalidField.value = ''
}
function resetDraft(restoreFocus = true) {
  const edited = editingId.value
  Object.assign(draft, emptyDraft())
  editingId.value = ''
  clearError()
  if (restoreFocus) nextTick(() => (document.getElementById(`important-day-edit-${edited}`) || nameInput.value)?.focus())
}
function submitDay() {
  const name = draft.name.trim()
  if (!name || !isImportantDate(draft.date)) {
    invalidField.value = name ? 'date' : 'name'
    error.value = name ? '请选择有效日期。' : '请输入重要日名称。'
    const field = name ? dateInput.value : nameInput.value
    field?.focus()
    return
  }
  const editing = Boolean(editingId.value)
  const saved = editing ? contentStore.updateImportantDay(editingId.value, draft) : contentStore.addImportantDay(draft)
  if (!saved) {
    error.value = '无法保存此日期，请重新选择后再试。'
    return
  }
  notice.value = editing ? `已更新「${name}」。` : `已添加「${name}」。`
  resetDraft(editing)
}
function editDay(item) {
  pendingDelete.value = ''
  deleteTrigger = null
  editingId.value = item.id
  Object.assign(draft, { name: item.name, date: item.date, recurring: item.recurring, pinned: item.pinned })
  notice.value = ''
  clearError()
  nextTick(() => nameInput.value?.focus())
}
function askDelete(item, event) {
  pendingDelete.value = item.id
  deleteTrigger = event.currentTarget
  const row = deleteTrigger.closest('li')
  nextTick(() => row?.querySelector('.important-day-confirm button')?.focus())
}
function cancelDelete() {
  pendingDelete.value = ''
  const trigger = deleteTrigger
  deleteTrigger = null
  nextTick(() => trigger?.focus())
}
function deleteDay(item) {
  if (!contentStore.removeImportantDay(item.id)) return
  if (editingId.value === item.id) resetDraft(false)
  notice.value = `已删除「${item.name}」。`
  pendingDelete.value = ''
  deleteTrigger = null
  nextTick(() => heading.value?.focus())
}
</script>

<template>
  <span class="settings-kicker">基础功能</span>
  <h2 ref="heading" tabindex="-1">重要日</h2>
  <p class="settings-lead">记录考试、生日或纪念日，从时钟顶部查看倒计时。</p>

  <section class="setting-card">
    <h3>{{ editingId ? '编辑重要日' : '添加重要日' }}</h3>
    <form class="important-day-form" novalidate @submit.prevent="submitDay" @input="clearError">
      <div class="important-day-fields">
        <label class="important-day-field">
          <span>名称</span>
          <input ref="nameInput" v-model="draft.name" type="text" maxlength="80" placeholder="例如：期末考试" required :aria-invalid="invalidField === 'name' || undefined" />
        </label>
        <label class="important-day-field">
          <span>日期</span>
          <input ref="dateInput" v-model="draft.date" type="date" min="0001-01-01" max="9999-12-31" required :aria-invalid="invalidField === 'date' || undefined" />
        </label>
      </div>
      <div class="important-day-options">
        <label><input v-model="draft.recurring" type="checkbox" />每年重复</label>
        <label><input v-model="draft.pinned" type="checkbox" />当天优先显示在时钟顶部</label>
      </div>
      <p v-if="draft.recurring && draft.date.endsWith('-02-29')" class="setting-copy">2 月 29 日的重要日在平年按 2 月 28 日显示。</p>
      <p v-if="error" class="important-day-error" role="alert">{{ error }}</p>
      <div class="important-day-actions">
        <button type="submit" class="save-button">{{ editingId ? '保存修改' : '添加日期' }}</button>
        <button v-if="editingId" type="button" class="subtle-button" @click="resetDraft()">取消编辑</button>
      </div>
    </form>
    <p v-if="notice" class="inline-status" role="status">{{ notice }}</p>
  </section>

  <section v-if="!sections.length" class="setting-card">
    <h3>还没有重要日</h3>
    <p class="setting-copy">添加一个日期，即可在时钟顶部查看还有多少天。</p>
  </section>
  <section v-for="section in sections" :key="section.title" class="setting-card">
    <h3>{{ section.title }}</h3>
    <ul class="important-day-list">
      <li v-for="item in section.items" :key="item.id" class="important-day-item">
        <div class="important-day-item-info">
          <strong>{{ item.name }}</strong>
          <span>
            <time :datetime="item.occurrenceDate">{{ item.occurrenceDate }}</time>
            <template v-if="item.recurring"> · 每年重复</template>
            <template v-if="item.pinned"> · 当天优先</template>
          </span>
        </div>
        <span class="important-day-status" :class="{ past: item.days < 0 }">{{ importantDayStatus(item.days) }}</span>
        <div class="important-day-actions">
          <button type="button" :id="`important-day-edit-${item.id}`" class="icon-text-button" :aria-label="`编辑 ${item.name}`" @click="editDay(item)">编辑</button>
          <button type="button" class="icon-text-button" :aria-label="`删除 ${item.name}`" @click="askDelete(item, $event)">删除</button>
        </div>
        <div v-if="pendingDelete === item.id" class="important-day-confirm" @keydown.esc.stop="cancelDelete">
          <span>删除「{{ item.name }}」？</span>
          <div class="important-day-actions">
            <button type="button" class="subtle-button" @click="cancelDelete">保留</button>
            <button type="button" class="subtle-button" @click="deleteDay(item)">确认删除</button>
          </div>
        </div>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.important-day-form { display: grid; gap: 13px; margin-top: 14px; }
.important-day-fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 165px), 1fr)); gap: 12px; }
.important-day-field { display: grid; gap: 5px; min-width: 0; color: var(--text-secondary); font-size: 12px; }
.important-day-field input {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  min-height: 38px;
  padding: 0 9px;
  border: 1px solid var(--border-strong);
  border-radius: 5px;
  color: var(--text-primary);
  background: var(--bg-card-solid);
  font: inherit;
}
.important-day-options, .important-day-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.important-day-options { column-gap: 16px; }
.important-day-options label { display: inline-flex; align-items: center; gap: 5px; min-height: 32px; color: var(--text-secondary); font-size: 12px; cursor: pointer; }
.important-day-options input { accent-color: var(--accent); }
.important-day-list { display: grid; gap: 8px; margin: 12px 0 0; padding: 0; list-style: none; }
.important-day-item { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; padding: 10px; border: 1px solid var(--border-subtle); border-radius: 6px; }
.important-day-item-info { display: grid; gap: 4px; flex: 1 1 130px; min-width: 0; font-size: 13px; overflow-wrap: anywhere; }
.important-day-item-info > span { color: var(--text-muted); font-size: 11px; }
.important-day-item-info time { white-space: nowrap; font-variant-numeric: tabular-nums; }
.important-day-status { padding: 5px 8px; border-radius: 5px; color: var(--accent); background: var(--accent-50); font-size: 11px; font-weight: 600; white-space: nowrap; }
.important-day-status.past { color: var(--text-secondary); background: var(--bg-hover); }
.important-day-confirm { display: flex; flex: 1 1 100%; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; padding-top: 8px; border-top: 1px solid var(--border-subtle); color: var(--text-secondary); font-size: 12px; overflow-wrap: anywhere; }
.important-day-error { margin: 0; color: var(--text-primary); font-size: 12px; font-weight: 600; }
.important-day-form input:focus-visible, .important-day-actions button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
</style>
