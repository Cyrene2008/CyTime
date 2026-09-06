import { invoke } from '@tauri-apps/api/core'
import { isDesktop } from './desktop'

export function isTauri() {
  return isDesktop()
}

export async function getPlatform() {
  if (!isTauri()) return 'pwa'
  try { return await invoke('application_platform') } catch { return 'tauri' }
}
