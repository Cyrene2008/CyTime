import { getCurrentScope, nextTick, onScopeDispose } from 'vue'

// 同一轮操作的多次保存合并到 Vue 更新结束后，只序列化最终状态。
export function createBatchedPersist(write) {
  let pending = false

  function flush() {
    if (!pending) return
    pending = false
    write()
  }

  function persist() {
    if (pending) return
    pending = true
    nextTick(flush)
  }

  const target = typeof window === 'undefined' ? null : window
  target?.addEventListener('pagehide', flush)
  if (getCurrentScope()) {
    onScopeDispose(() => {
      target?.removeEventListener('pagehide', flush)
      flush()
    })
  }

  return persist
}
