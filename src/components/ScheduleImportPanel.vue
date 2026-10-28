<script setup>
import { computed, ref } from 'vue'
import { useContentStore } from '../stores/content'
import { chooseAndSaveFile } from '../services/desktop'
import { readScheduleFile, countNewScheduleLessons, serializeSchedule, scheduleConflictCount, scheduleWeekdays } from '../services/schedule'

const emit = defineEmits(['imported'])
const contentStore = useContentStore()
const fileInput = ref(null)
const incoming = ref(null)
const fileName = ref('')
const message = ref('')
const reading = ref(false)
const current = computed(() => contentStore.content.schedule)
const preview = computed(() => incoming.value?.lessons.slice(0, 20) || [])
const added = computed(() => incoming.value ? countNewScheduleLessons(current.value, incoming.value.lessons) : 0)
const conflicts = computed(() => incoming.value ? scheduleConflictCount(incoming.value.lessons) : 0)

async function importFile(event) {
  const file = event.target.files?.[0]
  if (!file) return
  reading.value = true
  try {
    incoming.value = await readScheduleFile(file)
    fileName.value = file.name
    message.value = ''
  } catch (error) { incoming.value = null; message.value = error?.message || '无法读取课程表' }
  finally { reading.value = false; event.target.value = '' }
}
function applyImport(replace) {
  if (!incoming.value || reading.value) return
  const count = contentStore.importSchedule(incoming.value.lessons, replace)
  message.value = replace ? `课程表已替换，共 ${count} 节` : `已添加 ${count} 节课程`
  incoming.value = null
  emit('imported', replace)
}
async function exportFile(template = false) {
  const lessons = template ? [{ weekday: 1, startAt: '08:00', endAt: '08:45', subject: '数学', room: '教室' }] : current.value
  try {
    const saved = await chooseAndSaveFile(serializeSchedule(lessons), template ? '课程表模板.csv' : '课程表.csv')
    message.value = saved ? (template ? '模板已下载' : '课程表已导出') : '已取消导出'
  } catch { message.value = '导出失败，请重试' }
}
</script>

<template>
  <section class="setting-card schedule-import-panel">
    <div class="card-toolbar"><div><h3>课程表文件</h3><p>导入课程表或导出备份，支持 CSV、JSON 和 Excel。</p></div></div>
    <div class="data-actions"><button type="button" class="subtle-button" :disabled="reading" @click="fileInput?.click()"><FluentIcon icon="arrow-upload-20-regular" :width="14" />导入文件</button><button type="button" class="subtle-button" :disabled="!current.length || reading" @click="exportFile(false)">导出课程表</button><button type="button" class="subtle-button" :disabled="reading" @click="exportFile(true)">下载模板</button><input ref="fileInput" type="file" accept=".csv,.json,.xlsx,.xls" hidden @change="importFile" /></div>
    <p v-if="reading" class="inline-status">正在读取…</p>
    <div v-if="incoming && !reading" class="schedule-import-preview">
      <div class="schedule-import-summary"><strong>{{ fileName }}</strong><span>{{ incoming.lessons.length }} 节课程 · 可新增 {{ added }} 节</span></div>
      <p v-if="incoming.duplicates" class="setting-copy">{{ incoming.duplicates }} 节重复课程已忽略。</p>
      <p v-if="conflicts" class="inline-status">有 {{ conflicts }} 处时间重叠，请检查课程时间。</p>
      <div class="schedule-import-list"><table><thead><tr><th>星期</th><th>时间</th><th>课程</th><th>教室</th></tr></thead><tbody><tr v-for="(lesson, index) in preview" :key="index"><td>{{ scheduleWeekdays[lesson.weekday] }}</td><td>{{ lesson.startAt }}–{{ lesson.endAt }}</td><td>{{ lesson.subject }}</td><td>{{ lesson.room || '—' }}</td></tr></tbody></table></div>
      <p v-if="incoming.lessons.length > preview.length" class="setting-copy">预览前 {{ preview.length }} 节，共 {{ incoming.lessons.length }} 节。</p>
      <div class="data-actions"><button type="button" class="save-button" :disabled="!added" @click="applyImport(false)">添加到课程表</button><button type="button" class="subtle-button" @click="applyImport(true)">替换课程表</button><button type="button" class="subtle-button" @click="incoming = null">取消</button></div>
    </div>
    <p v-if="message" class="inline-status" role="status">{{ message }}</p>
  </section>
</template>
