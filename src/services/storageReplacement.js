import { applyDesktopStorage } from './desktop.js'
import { suspendPersistence } from './persistence.js'

export const storageKeys = ['cytime.settings.v2', 'cytime.settings.v1', 'cytime.content.v1', 'cytime.time-state.v1']

export async function replaceStoredData({ updates = {}, removeKeys = [], clear = false }, reload = () => window.location.reload()) {
  const serialized = Object.entries(updates).map(([key, value]) => [key, JSON.stringify(value)])
  const removals = new Set(removeKeys)
  if (clear) {
    storageKeys.forEach(key => removals.add(key))
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index)
      if (key?.startsWith('cytime.')) removals.add(key)
    }
  }
  const touched = new Set([...removals, ...serialized.map(([key]) => key)])
  if ([...touched].some(key => !key.startsWith('cytime.'))) throw new Error('不支持的数据项')
  const resume = suspendPersistence()
  const previous = new Map([...touched].map(key => [key, localStorage.getItem(key)]))
  const changed = new Set()
  try {
    for (const key of removals) {
      localStorage.removeItem(key)
      changed.add(key)
    }
    for (const [key, value] of serialized) {
      localStorage.setItem(key, value)
      changed.add(key)
    }
    await applyDesktopStorage(updates, [...removals], clear)
    reload()
    // 成功后保持暂停直到新页面载入；返回清理函数供嵌入环境和测试使用。
    return () => resume({ discard: true })
  } catch (error) {
    for (const key of changed) {
      const value = previous.get(key)
      if (value === null) localStorage.removeItem(key)
      else localStorage.setItem(key, value)
    }
    resume()
    throw error
  }
}
