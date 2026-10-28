import { getCurrentScope, nextTick, onScopeDispose } from 'vue'

const writers = new Set()
let suspended = 0

export function flushPendingPersistence() {
  for (const writer of writers) writer.flush()
}

// 恢复备份期间先写完旧状态，再暂停自动保存，避免旧任务覆盖导入的数据。
export function suspendPersistence() {
  flushPendingPersistence()
  suspended++
  let released = false
  return ({ discard = false } = {}) => {
    if (released) return
    released = true
    if (discard) for (const writer of writers) writer.discard()
    suspended = Math.max(0, suspended - 1)
    if (!suspended) flushPendingPersistence()
  }
}

// 同一轮操作的多次保存合并到 Vue 更新结束后，只序列化最终状态。
export function createBatchedPersist(write) {
  let pending = false

  function flush() {
    if (!pending || suspended) return
    pending = false
    write()
  }

  function persist() {
    if (pending) return
    pending = true
    if (!suspended) nextTick(flush)
  }

  const writer = { flush, discard: () => { pending = false } }
  writers.add(writer)
  const target = typeof window === 'undefined' ? null : window
  target?.addEventListener('pagehide', flush)
  if (getCurrentScope()) {
    onScopeDispose(() => {
      target?.removeEventListener('pagehide', flush)
      flush()
      writers.delete(writer)
    })
  }

  return persist
}
