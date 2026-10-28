import { inject, onScopeDispose, toValue, watch } from 'vue'

export const dialogActivityKey = Symbol('cytimeDialogActivity')

export function useDialogActivity(sources) {
  const count = inject(dialogActivityKey, null)
  if (!count) return
  let registered = false
  const release = () => {
    if (!registered) return
    count.value = Math.max(0, count.value - 1)
    registered = false
  }
  watch(() => sources.some(source => Boolean(toValue(source))), open => {
    if (open && !registered) { registered = true; count.value++ }
    else if (!open) release()
  }, { immediate: true, flush: 'sync' })
  onScopeDispose(release)
}
