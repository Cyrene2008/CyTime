<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { listen } from '@tauri-apps/api/event'
import HomeworkPanel from '../components/HomeworkPanel.vue'
import { closeHomeworkManageWindow, isDesktop } from '../services/desktop'

let unlistenReveal = null
const closing = ref(false)
const openedAt = Date.now()
const MIN_OPEN_MS = 1200

async function handleClose() {
  // Ignore close events during the first moments after open (mount races / stray emits).
  if (Date.now() - openedAt < MIN_OPEN_MS) return
  if (closing.value) return
  closing.value = true
  try {
    if (isDesktop()) {
      await closeHomeworkManageWindow().catch(() => {})
      try { await getCurrentWindow().close() } catch {}
    } else if (window.history.length > 1) {
      window.history.back()
    } else {
      window.location.href = '/'
    }
  } finally {
    closing.value = false
  }
}

onMounted(async () => {
  document.documentElement.classList.add('homework-window-root')
  try {
    unlistenReveal = await listen('cytime:homework-manage', () => {})
  } catch {}
})

onUnmounted(() => {
  document.documentElement.classList.remove('homework-window-root')
  unlistenReveal?.()
})
</script>

<template>
  <div class="homework-window-page">
    <HomeworkPanel manage-float @close="handleClose" />
  </div>
</template>
