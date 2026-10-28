<script setup>
import { computed, ref } from 'vue'
import { useSettingsStore, defaultSettings } from '../stores/settings'
import { useContentStore } from '../stores/content'
import { useTimeStore } from '../stores/time'
import { chooseAndSaveFile } from '../services/desktop'
import { createBackup, parseBackup, availableBackupGroups, backupGroupDetail, prepareBackupRestore } from '../services/backup'
import { replaceStoredData } from '../services/storageReplacement'
import { formatDate } from '../utils/time'

const settingsStore = useSettingsStore()
const contentStore = useContentStore()
const timeStore = useTimeStore()
const fileInput = ref(null)
const backup = ref(null)
const fileName = ref('')
const selected = ref([])
const message = ref('')
const busy = ref(false)
const groups = computed(() => backup.value ? availableBackupGroups(backup.value) : [])
const snapshot = () => ({ settings: settingsStore.settings, content: contentStore.content, time: { countdowns: timeStore.countdowns, timers: timeStore.timers } })
const savedDate = computed(() => {
  const date = new Date(backup.value?.exportedAt || '')
  return Number.isFinite(date.getTime()) ? date.toLocaleString('zh-CN', { hour12: false }) : ''
})

async function exportBackup() {
  try {
    const saved = await chooseAndSaveFile(JSON.stringify(createBackup(snapshot(), __APP_VERSION__), null, 2), `cytime-backup-${formatDate(new Date())}.json`)
    message.value = saved ? '备份已导出' : '已取消导出'
  } catch { message.value = '导出失败，请重试' }
}
async function readBackup(event) {
  const file = event.target.files?.[0]
  if (!file) return
  try {
    const parsed = parseBackup(await file.text())
    backup.value = parsed
    fileName.value = file.name
    selected.value = availableBackupGroups(parsed).map(group => group.id)
    message.value = ''
  } catch (error) { message.value = error?.message || '无法读取备份' }
  finally { event.target.value = '' }
}
async function restoreBackup() {
  if (!backup.value || !selected.value.length || busy.value) return
  busy.value = true
  try { await replaceStoredData(prepareBackupRestore(snapshot(), backup.value, selected.value)) }
  catch (error) { message.value = error?.message || '恢复失败，请重试'; busy.value = false }
}
async function resetSettings() {
  if (!window.confirm('恢复默认设置？课程、作业和值日名单会保留。')) return
  busy.value = true
  try { await replaceStoredData({ updates: { 'cytime.settings.v2': defaultSettings }, removeKeys: ['cytime.settings.v1'] }) }
  catch { message.value = '重置失败，请重试'; busy.value = false }
}
async function clearData() {
  if (!window.confirm('清空全部本地数据？此操作无法撤销。')) return
  busy.value = true
  try { await replaceStoredData({ clear: true }) }
  catch { message.value = '清空失败，请重试'; busy.value = false }
}
</script>

<template>
  <section class="setting-card backup-panel">
    <div class="card-toolbar"><div><h3>备份与恢复</h3><p>将数据备份到文件，或从备份中恢复所需内容。</p></div></div>
    <div class="data-actions">
      <button type="button" class="subtle-button" :disabled="busy" @click="exportBackup"><FluentIcon icon="arrow-download-20-regular" :width="15" />导出备份</button>
      <button type="button" class="subtle-button" :disabled="busy" @click="fileInput?.click()"><FluentIcon icon="arrow-upload-20-regular" :width="15" />选择备份</button>
      <input ref="fileInput" type="file" accept=".json,application/json" hidden @change="readBackup" />
    </div>
    <div v-if="backup" class="backup-preview">
      <div class="backup-file"><strong>{{ fileName }}</strong><small v-if="savedDate">{{ savedDate }}</small></div>
      <p class="setting-copy">选择要恢复的内容，所选项将替换当前数据。</p>
      <div class="backup-groups">
        <label v-for="group in groups" :key="group.id" class="backup-group"><input v-model="selected" type="checkbox" :value="group.id" :disabled="busy" /><span><strong>{{ group.label }}</strong><small>{{ backupGroupDetail(group, backup) }}</small></span></label>
      </div>
      <div class="data-actions"><button type="button" class="save-button" :disabled="busy || !selected.length" @click="restoreBackup">{{ busy ? '正在恢复…' : '恢复所选' }}</button><button type="button" class="subtle-button" :disabled="busy" @click="backup = null">取消</button></div>
    </div>
    <p v-if="message" class="inline-status" role="status">{{ message }}</p>
  </section>
  <section class="setting-card"><h3>重置</h3><p>恢复默认偏好，或清空这台设备上的全部数据。</p><div class="data-actions"><button type="button" class="subtle-button" :disabled="busy" @click="resetSettings">恢复默认设置</button><button type="button" class="subtle-button danger-button" :disabled="busy" @click="clearData">清空全部数据</button></div></section>
</template>
