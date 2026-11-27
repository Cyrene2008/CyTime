<script setup>
import { computed, nextTick, ref } from 'vue'
import { useContentStore } from '../stores/content'
import { chooseAndSaveFile } from '../services/desktop'
import { analyzeScheduleImport, readScheduleFile, scheduleWeekdays, scheduleWeekTypes } from '../services/schedule'
import { serializeSchedule } from '../services/cses'

const emit = defineEmits(['imported'])
const contentStore = useContentStore()
const fileInput = ref(null)
const importButton = ref(null)
const mergeOption = ref(null)
const incoming = ref(null)
const fileName = ref('')
const message = ref('')
const readError = ref('')
const reading = ref(false)
const mode = ref('merge')
const rowLimit = ref(20)
const conflictLimit = ref(5)
const current = computed(() => contentStore.content.schedule)
const analysis = computed(() => incoming.value && analyzeScheduleImport(current.value, incoming.value.lessons, mode.value))
const canApply = computed(() => !reading.value && incoming.value?.lessons.length > 0 && (analysis.value.added > 0 || analysis.value.removed > 0))

async function importFile(event) {
  const file = event.target.files?.[0]
  if (!file) return
  incoming.value = null
  readError.value = ''
  message.value = ''
  mode.value = 'merge'
  rowLimit.value = 20
  conflictLimit.value = 5
  fileName.value = file.name
  reading.value = true
  try {
    incoming.value = await readScheduleFile(file)
  } catch (error) {
    readError.value = `${file.name}：${error?.message || '无法读取课程表'}。当前课表未更改。`
  } finally {
    reading.value = false
    event.target.value = ''
    await nextTick()
    const focusTarget = incoming.value ? mergeOption.value : importButton.value
    focusTarget?.focus()
  }
}
function closePreview() {
  incoming.value = null
  importButton.value?.focus()
}
function applyImport() {
  if (!canApply.value) return
  const replace = mode.value === 'replace'
  const count = contentStore.importSchedule(incoming.value.lessons, replace)
  message.value = replace ? `课程表已替换，共 ${count} 节` : `已添加 ${count} 节课程`
  closePreview()
  emit('imported', replace)
}
async function exportFile(template = false) {
  const lessons = template
    ? [
        { weekday: 1, weeks: 'all', startAt: '08:00', endAt: '08:45', subject: '数学', room: '教室' },
        { weekday: 3, weeks: 'odd', startAt: '08:00', endAt: '08:45', subject: '物理', room: '实验室' },
        { weekday: 3, weeks: 'even', startAt: '08:00', endAt: '08:45', subject: '化学', room: '实验室' }
      ]
    : current.value
  try {
    const saved = await chooseAndSaveFile(serializeSchedule(lessons), template ? 'CSES-课程表模板.yaml' : 'CSES-课程表.yaml')
    message.value = saved ? (template ? '模板已下载' : '课程表已导出') : '已取消导出'
  } catch { message.value = '导出失败，请重试' }
}
</script>

<template>
  <section class="setting-card schedule-import-panel">
    <div class="card-toolbar"><div><h3>课程表文件</h3><p>使用 CSES v1（.yaml / .yml）交换课表。也可导入旧版 CSV、JSON 和 Excel 文件。</p></div></div>
    <div class="data-actions">
      <button ref="importButton" type="button" class="subtle-button" :disabled="reading" @click="fileInput?.click()"><FluentIcon icon="arrow-upload-20-regular" :width="14" />{{ incoming ? '重新选择文件' : '导入文件' }}</button>
      <button type="button" class="subtle-button" :disabled="!current.length || reading" @click="exportFile(false)">导出 CSES</button>
      <button type="button" class="subtle-button" :disabled="reading" @click="exportFile(true)">下载 CSES 模板</button>
      <input ref="fileInput" type="file" accept=".yaml,.yml,.cses,.csv,.json,.xlsx,.xls" hidden @change="importFile" />
    </div>
    <p v-if="reading" class="inline-status" role="status">正在读取…</p>
    <p v-if="readError" class="import-error" role="alert">{{ readError }}</p>
    <div v-if="analysis && !reading" class="schedule-import-preview">
      <div class="schedule-import-summary"><strong>{{ fileName }}</strong><span>已读入 {{ incoming.lessons.length }} 节课程</span></div>
      <fieldset class="import-modes">
        <legend>导入方式</legend>
        <label :class="{ selected: mode === 'merge' }">
          <input ref="mergeOption" v-model="mode" name="schedule-import-mode" type="radio" value="merge" />
          <span><strong>追加课程</strong><small>保留现有课表</small></span>
        </label>
        <label :class="{ selected: mode === 'replace' }">
          <input v-model="mode" name="schedule-import-mode" type="radio" value="replace" />
          <span><strong>替换课表</strong><small>仅保留文件中的课程</small></span>
        </label>
      </fieldset>
      <div class="import-impact" role="status" aria-atomic="true">
        <strong>{{ mode === 'merge' ? '追加' : '替换' }}后共 {{ analysis.lessons.length }} 节</strong>
        <span>新增 {{ analysis.added }} 节<template v-if="mode === 'replace'"> · 移除 {{ analysis.removed }} 节原有课程</template></span>
        <small v-if="mode === 'merge' && analysis.duplicates">已跳过 {{ analysis.duplicates }} 节与现有课表相同的课程。</small>
        <small v-if="incoming.duplicates">文件内另有 {{ incoming.duplicates }} 条重复记录，只计一次。</small>
        <small v-if="!canApply">当前课表没有需要更改的课程。</small>
      </div>
      <div v-if="analysis.conflictCount" class="import-conflicts">
        <strong>{{ mode === 'merge' ? '追加将新增' : '替换后有' }} {{ analysis.conflictCount }} 处时间重叠</strong>
        <ul>
          <li v-for="({ weekday, weeks, first, second }, index) in analysis.conflicts.slice(0, conflictLimit)" :key="index">
            <b>{{ scheduleWeekdays[weekday] }}<template v-if="weeks !== 'all'"> · {{ scheduleWeekTypes[weeks] }}</template></b>
            <span v-for="(lesson, side) in [first, second]" :key="side">{{ lesson.subject }}<template v-if="lesson.room">（{{ lesson.room }}）</template><span class="conflict-time">{{ lesson.startAt }}–{{ lesson.endAt }}</span></span>
          </li>
        </ul>
        <button v-if="analysis.conflicts.length > conflictLimit" type="button" class="subtle-button" @click="conflictLimit += 10">查看更多重叠</button>
        <small v-if="analysis.conflictCount > analysis.conflicts.length">最多预览前 {{ analysis.conflicts.length }} 处重叠。</small>
      </div>
      <details class="import-file-rows">
        <summary>查看文件中的 {{ incoming.lessons.length }} 节课程</summary>
        <div class="schedule-import-list"><table aria-label="文件中的课程">
          <thead><tr><th scope="col">星期</th><th scope="col">时间</th><th scope="col">课程</th><th scope="col">教室</th></tr></thead>
          <tbody>
            <tr v-for="(lesson, index) in incoming.lessons.slice(0, rowLimit)" :key="index">
              <td>{{ scheduleWeekdays[lesson.weekday] }}<small v-if="lesson.weeks && lesson.weeks !== 'all'">{{ scheduleWeekTypes[lesson.weeks] }}</small></td>
              <td>{{ lesson.startAt }}–{{ lesson.endAt }}</td>
              <td>{{ lesson.subject }}<small v-if="lesson.teacher">{{ lesson.teacher }}</small></td>
              <td>{{ lesson.room || '—' }}</td>
            </tr>
          </tbody>
        </table></div>
        <button v-if="incoming.lessons.length > rowLimit" type="button" class="subtle-button" @click="rowLimit += 20">显示更多课程（剩余 {{ incoming.lessons.length - rowLimit }} 节）</button>
      </details>
      <div class="data-actions">
        <button type="button" class="save-button" :disabled="!canApply" @click="applyImport">{{ mode === 'merge' ? '确认追加' : '确认替换课表' }}</button>
        <button type="button" class="subtle-button" @click="closePreview">取消</button>
      </div>
    </div>
    <p v-if="message" class="inline-status" role="status">{{ message }}</p>
  </section>
</template>

<style scoped>
.schedule-import-preview { min-width: 0; padding-top: 12px; border-top: 1px solid var(--border-subtle); }
.schedule-import-summary { justify-content: space-between; }
.import-modes { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(125px, 100%), 1fr)); gap: 6px; min-width: 0; margin: 0; padding: 0; border: 0; }
.import-modes legend { margin-bottom: 6px; padding: 0; color: var(--text-secondary); font-size: 11px; }
.import-modes label { display: flex; align-items: center; gap: 8px; padding: 8px; border: 1px solid var(--border-strong); border-radius: 6px; cursor: pointer; }
.import-modes label.selected { border-color: var(--accent); background: var(--accent-50); }
.import-modes input { flex: none; margin: 0; accent-color: var(--accent); }
.import-modes span { display: grid; gap: 3px; }
.import-modes small, .import-impact small { color: var(--text-secondary); font-size: 11px; }
.import-modes strong, .import-impact strong, .import-conflicts > strong { font-size: 12px; }
.import-impact { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; }
.import-impact > span, .import-file-rows { color: var(--text-secondary); font-size: 12px; }
.import-impact > small { flex-basis: 100%; }
.import-conflicts { padding: 9px 12px; border-left: 3px solid var(--accent); border-radius: 4px; background: var(--accent-50); }
.import-conflicts > small { display: block; margin-top: 6px; color: var(--text-secondary); font-size: 11px; }
.import-conflicts ul { display: grid; gap: 7px; max-height: 180px; margin: 8px 0 0; padding: 0; overflow: auto; list-style: none; }
.import-conflicts li { display: grid; grid-template-columns: auto 1fr; gap: 3px 8px; align-items: baseline; font-size: 11px; }
.import-conflicts li b { grid-row: span 2; color: var(--text-secondary); }
.import-conflicts li span, .import-error, .schedule-import-list td { overflow-wrap: anywhere; }
.conflict-time { margin-left: 6px; color: var(--text-secondary); font-variant-numeric: tabular-nums; white-space: nowrap; }
.import-file-rows summary { width: fit-content; padding: 6px 0; cursor: pointer; }
.schedule-import-list td small { display: block; margin-top: 3px; color: var(--text-secondary); }
.schedule-import-preview .data-actions { margin: 0; }
.schedule-import-preview .save-button:disabled { opacity: .55; cursor: default; }
.schedule-import-panel .import-error { color: var(--text-primary); line-height: 1.6; }
</style>
