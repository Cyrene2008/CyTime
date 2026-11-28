import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { ref } from 'vue'

const desktopState = ref(false)
let storageQueue = Promise.resolve()

function hasTauriInternals() {
  return typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__ || window.__TAURI__ || window.__TAURI_METADATA__)
}

export function isDesktop() {
  return desktopState.value || hasTauriInternals()
}

export async function probeDesktop() {
  if (desktopState.value || hasTauriInternals()) return true
  try { desktopState.value = (await invoke('application_platform')) === 'tauri' } catch {}
  return desktopState.value
}

function abortReason(signal) {
  return signal.reason instanceof Error ? signal.reason : new DOMException('请求已取消', 'AbortError')
}

function withAbort(promise, signal) {
  if (signal.aborted) return Promise.reject(abortReason(signal))
  return new Promise((resolve, reject) => {
    const abort = () => { signal.removeEventListener('abort', abort); reject(abortReason(signal)) }
    signal.addEventListener('abort', abort, { once: true })
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
  })
}

export async function fetchJson(url, externalSignal, { headers, timeoutMs = 12000 } = {}) {
  const controller = new AbortController()
  const abort = () => controller.abort(externalSignal?.reason)
  if (externalSignal?.aborted) abort()
  else externalSignal?.addEventListener('abort', abort, { once: true })
  const timeout = setTimeout(() => controller.abort(new DOMException('请求超时', 'TimeoutError')), timeoutMs)
  const signal = controller.signal
  const load = async () => {
    // A marked request must go through the WebView so the endpoint also sees its Origin.
    if (!headers && isDesktop()) {
      try { return await withAbort(invoke('desktop_fetch_json', { url }), signal) }
      catch (error) { if (signal.aborted || error?.name === 'AbortError') throw error }
    }
    const response = await fetch(url, { signal, headers })
    if (!response.ok) throw new Error(`Request failed: ${response.status}`)
    return response.json()
  }
  try {
    if (signal.aborted) throw abortReason(signal)
    return await withAbort(load(), signal)
  } finally {
    clearTimeout(timeout)
    externalSignal?.removeEventListener('abort', abort)
  }
}

export async function initDesktopBridge(onUri, startupUri = '') {
  if (!isDesktop()) return () => {}
  let lastUri = startupUri
  let lastUriAt = startupUri ? Date.now() : 0
  const deliver = value => {
    const uri = String(value || '')
    const now = Date.now()
    if (!uri.startsWith('cytime://') || (uri === lastUri && now - lastUriAt < 500)) return
    lastUri = uri
    lastUriAt = now
    onUri(uri)
  }
  const unlistenDeepLink = await listen('deep-link://new-url', event => (Array.isArray(event.payload) ? event.payload : [event.payload]).forEach(deliver))
  const unlistenSingleInstance = await listen('cytime:open-url', event => deliver(event.payload))
  try { (await invoke('desktop_pending_uris')).filter(uri => uri !== startupUri).forEach(deliver) } catch {}
  return () => { unlistenDeepLink(); unlistenSingleInstance() }
}

export function prepareDesktopUri(uri, fallbackMode = null) {
  return invoke('desktop_prepare_uri', { uri, fallbackMode })
}

export function setDesktopWindowMode(mode, reveal = true) {
  return isDesktop() ? invoke('desktop_window_mode', { mode, reveal }) : Promise.resolve(false)
}

export function setDesktopAutostart(enabled, hidden = true) {
  return isDesktop() ? invoke('desktop_set_autostart', { enabled, hidden }) : Promise.resolve(false)
}

export function setDesktopUriRegistration(enabled) {
  return isDesktop() ? invoke('desktop_set_uri_registration', { enabled }) : Promise.resolve(false)
}

export function desktopWindowAction(action) {
  return isDesktop() ? invoke('desktop_window_action', { action }) : Promise.resolve(false)
}

/** 打开独立悬浮作业管理窗（Tauri 多窗口） */
export function openHomeworkManageWindow() {
  return isDesktop() ? invoke('desktop_open_homework') : Promise.resolve(false)
}

/** 关闭独立作业管理窗 */
export function closeHomeworkManageWindow() {
  return isDesktop() ? invoke('desktop_window_action', { action: 'close-homework' }) : Promise.resolve(false)
}

export async function getDesktopStartupArgs() {
  return isDesktop() ? invoke('desktop_startup_args') : []
}

export function persistDesktopValue(key, value) {
  if (!isDesktop()) return Promise.resolve()
  const write = storageQueue.then(() => invoke('storage_write', { key, value }))
  storageQueue = write.catch(() => {})
  return write
}

export async function applyDesktopStorage(values, removeKeys = [], clear = false) {
  if (!isDesktop()) return
  await storageQueue
  await invoke('storage_apply', { values, removeKeys, clear })
}

export async function saveDesktopFile(path, content) {
  return isDesktop() ? invoke('desktop_write_file', { path, content }) : false
}

export async function chooseAndSaveFile(content, fileName = 'cytime-backup.json') {
  const extension = fileName.split('.').pop()?.toLowerCase() || 'txt'
  const mime = extension === 'json' ? 'application/json' : extension === 'csv' ? 'text/csv' : 'text/plain'
  if (isDesktop()) {
    const { save } = await import('@tauri-apps/plugin-dialog')
    const path = await save({ defaultPath: fileName, filters: [{ name: extension.toUpperCase(), extensions: [extension] }] })
    if (!path) return false
    await saveDesktopFile(path, content)
    return true
  }
  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({ suggestedName: fileName, types: [{ description: extension.toUpperCase(), accept: { [mime]: [`.${extension}`] } }] })
      const writable = await handle.createWritable()
      await writable.write(content)
      await writable.close()
      return true
    } catch (error) {
      if (error?.name === 'AbortError') return false
      if (error?.name !== 'SecurityError' && error?.name !== 'NotAllowedError') throw error
    }
  }
  const url = URL.createObjectURL(new Blob([content], { type: `${mime};charset=utf-8` }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  return true
}

export async function checkDesktopUpdate() {
  const mirrors = [
    'https://gh.昔涟.cn',
    'https://v4.gh-proxy.com',
    'https://api.github.com'
  ]
  if (isDesktop()) {
    try {
      return await invoke('desktop_check_update')
    } catch {}
  }
  for (const base of mirrors) {
    try {
      return await fetchJson(`${base}/repos/Cyrene2008/CyTime/releases/latest`)
    } catch {}
  }
  throw new Error('无法访问更新源')
}

export async function downloadDesktopUpdate(url) {
  if (!isDesktop()) {
    window.open(url, '_blank', 'noopener,noreferrer')
    return
  }
  try {
    await invoke('desktop_download_update', { url })
  } catch (error) {
    throw new Error(typeof error === 'string' ? error : (error?.message || '下载安装包失败'))
  }
}
