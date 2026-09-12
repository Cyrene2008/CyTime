import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { ref } from 'vue'

const desktopState = ref(false)

function hasTauriInternals() {
  return typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__ || window.__TAURI__ || window.__TAURI_METADATA__)
}

export function isDesktop() {
  return desktopState.value || hasTauriInternals()
}

export async function probeDesktop() {
  if (desktopState.value) return true
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      const result = await invoke('application_platform')
      desktopState.value = result === 'tauri'
      if (desktopState.value) return true
    } catch {}
    if (hasTauriInternals()) return true
    await new Promise(resolve => window.setTimeout(resolve, 100))
  }
  return hasTauriInternals()
}

export async function fetchJson(url, signal) {
  if (isDesktop()) {
    try {
      if (signal?.aborted) throw new DOMException('The request was aborted', 'AbortError')
      return await invoke('desktop_fetch_json', { url })
    } catch (invokeError) {
      if (invokeError?.name === 'AbortError') throw invokeError
      const response = await fetch(url, { signal })
      if (!response.ok) throw new Error(`Request failed: ${response.status}`)
      return response.json()
    }
  }
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(`Request failed: ${response.status}`)
  return response.json()
}

export async function initDesktopBridge(onUri) {
  if (!isDesktop()) return () => {}
  let lastUri = ''
  let lastUriAt = 0
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
  try { (await invoke('desktop_pending_uris')).forEach(deliver) } catch {}
  try {
    const args = await invoke('desktop_startup_args')
    args.filter(argument => argument.startsWith('cytime://')).forEach(deliver)
  } catch {}
  return () => { unlistenDeepLink(); unlistenSingleInstance() }
}

export function setDesktopWindowMode(mode, reveal = true) {
  return isDesktop() ? invoke('desktop_window_mode', { mode, reveal }) : Promise.resolve(false)
}

export function setDesktopAutostart(enabled) {
  return isDesktop() ? invoke('desktop_set_autostart', { enabled }) : Promise.resolve(false)
}

export function setDesktopUriRegistration(enabled) {
  return isDesktop() ? invoke('desktop_set_uri_registration', { enabled }) : Promise.resolve(false)
}

export function desktopWindowAction(action) {
  return isDesktop() ? invoke('desktop_window_action', { action }) : Promise.resolve(false)
}

export async function getDesktopStartupArgs() {
  return isDesktop() ? invoke('desktop_startup_args') : []
}

export function persistDesktopValue(key, value) {
  return isDesktop() ? invoke('storage_write', { key, value }) : Promise.resolve()
}

export async function saveDesktopFile(path, content) {
  return isDesktop() ? invoke('desktop_write_file', { path, content }) : false
}

export async function chooseAndSaveFile(content, fileName = 'cytime-backup.json') {
  if (isDesktop()) {
    const { save } = await import('@tauri-apps/plugin-dialog')
    const path = await save({ defaultPath: fileName, filters: [{ name: 'JSON', extensions: ['json'] }] })
    if (!path) return false
    await saveDesktopFile(path, content)
    return true
  }
  if (window.showSaveFilePicker) {
    const handle = await window.showSaveFilePicker({ suggestedName: fileName, types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }] })
    const writable = await handle.createWritable()
    await writable.write(content)
    await writable.close()
    return true
  }
  return false
}

export function checkDesktopUpdate() {
  return isDesktop() ? invoke('desktop_check_update') : fetchJson('https://api.github.com/repos/Cyrene2008/CyTime/releases/latest')
}

export function downloadDesktopUpdate(url) {
  return isDesktop() ? invoke('desktop_download_update', { url }) : window.open(url, '_blank', 'noopener,noreferrer')
}
