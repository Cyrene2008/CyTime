<script setup>
import { ref } from 'vue'
import { useContentStore } from '../stores/content'
import { useSettingsStore } from '../stores/settings'

const contentStore = useContentStore()
const settingsStore = useSettingsStore()
const subject = ref('数学')
const content = ref('')
const editingId = ref(null)
const subjects = ['语文', '数学', '英语', '物理', '化学', '生物', '历史', '政治', '地理', '其他'].map(value => ({ value, label: value }))

function addHomework() {
  if (!content.value.trim()) return
  if (editingId.value) {
    const item = contentStore.content.homework.find(entry => entry.id === editingId.value)
    if (item) contentStore.updateHomework(item, { subject: subject.value, content: content.value })
  } else contentStore.addHomework({ subject: subject.value, content: content.value })
  editingId.value = null
  subject.value = '数学'
  content.value = ''
}

function editHomework(item) {
  editingId.value = item.id
  subject.value = item.subject
  content.value = item.content
}

function cancelEdit() {
  editingId.value = null
  subject.value = '数学'
  content.value = ''
}

function cyclePosition() {
  settingsStore.update({ homeworkPosition: settingsStore.settings.homeworkPosition === 'left' ? 'right' : 'left' })
}

function adjustFont(amount) {
  const next = Math.max(10, Math.min(24, Number(settingsStore.settings.homeworkFontSize) + amount))
  settingsStore.update({ homeworkFontSize: next })
}
</script>

<template>
  <aside class="homework-panel" :class="`homework-${settingsStore.settings.homeworkPosition}`" :style="{ '--homework-font-size': `${settingsStore.settings.homeworkFontSize}px` }" aria-label="作业板">
    <header class="homework-header"><div><span class="homework-kicker">WORK</span><h2>作业板</h2></div><div class="homework-tools"><button type="button" class="micro-button" aria-label="切换作业板位置" @click="cyclePosition">{{ settingsStore.settings.homeworkPosition === 'left' ? '右侧' : '左侧' }}</button><button type="button" class="micro-button" aria-label="减小作业板字号" @click="adjustFont(-1)">A−</button><button type="button" class="micro-button" aria-label="增大作业板字号" @click="adjustFont(1)">A＋</button></div></header>
    <div class="homework-list"><div v-for="item in contentStore.content.homework" :key="item.id" class="homework-item" :class="{ completed: item.completed }"><span><strong>{{ item.subject }}</strong><span>{{ item.content }}</span></span><div class="homework-item-actions"><button type="button" class="homework-action" :aria-label="`编辑${item.subject}作业`" @click="editHomework(item)">编辑</button><button type="button" class="homework-remove" aria-label="删除作业" @click="contentStore.removeHomework(item)">×</button></div></div><p v-if="!contentStore.content.homework.length" class="homework-empty">还没有布置作业</p></div>
    <form class="homework-compose" @submit.prevent="addHomework"><FluentSelect v-model="subject" :options="subjects" aria-label="作业学科" /><input v-model="content" aria-label="作业内容" :placeholder="editingId ? '修改作业内容' : '布置一项作业'" /><button v-if="editingId" type="button" class="micro-button" @click="cancelEdit">取消</button><button type="submit" class="micro-button primary">{{ editingId ? '保存' : '布置' }}</button></form>
  </aside>
</template>
