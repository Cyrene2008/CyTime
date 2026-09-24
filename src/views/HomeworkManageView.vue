<script setup>
import { onMounted, onUnmounted } from 'vue'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { listen } from '@tauri-apps/api/event'
import HomeworkPanel from '../components/HomeworkPanel.vue'
import { closeHomeworkManageWindow, isDesktop } from '../services/desktop'

let unlistenReveal = null

async function handleClose() {
  if (isDesktop()) {
    await closeHomeworkManageWindow().catch(() => {})
    try { await getCurrentWindow().close() } catch {}
  } else if (window.history.length > 1) {
    window.history.back()
  } else {
    window.location.href = '/'
  }
}

onMounted(async () => {
  document.documentElement.classList.add('homework-window-root')
  try {
    unlistenReveal = await listen('cytime:homework-manage', () => {
      // Re-opened / revealed: panel's own idle timer will re-arm on next interaction path.
    })
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
