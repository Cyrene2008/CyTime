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
  if (!isTauri()) {
    const response = await fetch(url, { signal })
    if (!response.ok) throw new Error(`Request failed: ${response.status}`)
    return response.json()
  }
  if (signal?.aborted) throw new DOMException('The request was aborted', 'AbortError')
  return invoke('desktop_fetch_json', { url })
}

export async function fetchNetworkTime() {
  if (isTauri()) return invoke('desktop_fetch_network_time')
  const data = await fetchJson('https://worldtimeapi.org/api/timezone/Etc/UTC')
  const unixSeconds = Number(data?.unixtime)
  if (!Number.isFinite(unixSeconds)) throw new Error('Time service returned no unix time')
  return unixSeconds * 1000
}

export async function initDesktopBridge(onUri) {
  if (!isTauri()) return () => {}
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
  return isTauri() ? invoke('desktop_window_mode', { mode, reveal }) : Promise.resolve(false)
}

export function setDesktopAutostart(enabled) {
  return isTauri() ? invoke('desktop_set_autostart', { enabled }) : Promise.resolve(false)
}

export function setDesktopUriRegistration(enabled) {
  return isTauri() ? invoke('desktop_set_uri_registration', { enabled }) : Promise.resolve(false)
}

export function desktopWindowAction(action) {
  return isTauri() ? invoke('desktop_window_action', { action }) : Promise.resolve(false)
}

export async function getDesktopStartupArgs() {
  return isTauri() ? invoke('desktop_startup_args') : []
}
