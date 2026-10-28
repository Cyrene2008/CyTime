import { computed, inject, ref } from 'vue'
import { useTimeStore } from '../stores/time'

// 只暂停不可见页面的时间显示，计时和到点提醒仍由 store 正常推进。
export function useDisplayTime() {
  const timeStore = useTimeStore()
  const active = inject('cytimeStageActive', ref(true))
  const now = computed(previous => active.value ? timeStore.now : previous ?? timeStore.now)
  return { active, now }
}
