import assert from 'node:assert/strict'
import { test } from 'node:test'
import { effectScope, nextTick } from 'vue'
import { createBatchedPersist } from '../src/services/persistence.js'
import { persistDesktopValue } from '../src/services/desktop.js'
import { replaceStoredData } from '../src/services/storageReplacement.js'

class MemoryStorage {
  values = new Map()
  get length() { return this.values.size }
  key(index) { return [...this.values.keys()][index] ?? null }
  getItem(key) { return this.values.get(key) ?? null }
  setItem(key, value) { this.values.set(key, String(value)) }
  removeItem(key) { this.values.delete(key) }
}

function environment(initial = {}) {
  const calls = []
  let native = structuredClone(initial)
  let fail = false
  globalThis.localStorage = new MemoryStorage()
  for (const [key, value] of Object.entries(initial)) localStorage.setItem(key, JSON.stringify(value))
  globalThis.window = new EventTarget()
  window.__TAURI_INTERNALS__ = { invoke: async (command, args) => {
    calls.push(command)
    await new Promise(resolve => setTimeout(resolve, 5))
    if (command === 'storage_write') native[args.key] = structuredClone(args.value)
    else if (command === 'storage_apply') {
      if (fail) throw new Error('write failed')
      if (args.clear) native = Object.fromEntries(Object.entries(native).filter(([key]) => !key.startsWith('cytime.')))
      args.removeKeys.forEach(key => delete native[key])
      Object.assign(native, structuredClone(args.values))
    }
  } }
  return { calls, get native() { return native }, fail: () => { fail = true } }
}

test('restore waits for queued desktop writes and suppresses stale automatic saves until reload', async () => {
  const env = environment({ 'cytime.content.v1': { notepad: 'old' } })
  const scope = effectScope()
  let note = 'old-final'
  const persist = scope.run(() => createBatchedPersist(() => persistDesktopValue('cytime.content.v1', { notepad: note })))
  let reloads = 0
  let cleanup
  try {
    persist()
    const restoring = replaceStoredData({ updates: { 'cytime.content.v1': { notepad: 'restored' } } }, () => { reloads++ })
    note = 'stale-during-restore'
    persist()
    cleanup = await restoring
    await nextTick()
    window.dispatchEvent(new Event('pagehide'))
    assert.deepEqual(env.calls, ['storage_write', 'storage_apply'])
    assert.equal(env.native['cytime.content.v1'].notepad, 'restored')
    assert.equal(JSON.parse(localStorage.getItem('cytime.content.v1')).notepad, 'restored')
    assert.equal(reloads, 1)
  } finally { cleanup?.(); scope.stop() }
})

test('failed desktop restoration rolls back browser storage and permits later saves', async () => {
  const env = environment({ 'cytime.settings.v2': { theme: 'dark' }, 'cytime.content.v1': { notepad: 'keep' } })
  env.fail()
  await assert.rejects(replaceStoredData({ updates: { 'cytime.settings.v2': { theme: 'light' } } }, () => assert.fail('must not reload')))
  assert.equal(JSON.parse(localStorage.getItem('cytime.settings.v2')).theme, 'dark')
  assert.equal(env.native['cytime.settings.v2'].theme, 'dark')
  const scope = effectScope()
  try {
    const persist = scope.run(() => createBatchedPersist(() => persistDesktopValue('cytime.content.v1', { notepad: 'later' })))
    persist()
    await nextTick()
    await new Promise(resolve => setTimeout(resolve, 15))
    assert.equal(env.native['cytime.content.v1'].notepad, 'later')
  } finally { scope.stop() }
})

test('clear removes desktop, legacy, and cached app data while preserving unrelated browser data', async () => {
  const env = environment({ 'cytime.settings.v1': {}, 'cytime.content.v1': {}, 'cytime.weather-cache.v1:city': {}, unrelated: 'keep' })
  const cleanup = await replaceStoredData({ clear: true }, () => {})
  try {
    assert.equal(localStorage.getItem('cytime.content.v1'), null)
    assert.equal(localStorage.getItem('cytime.weather-cache.v1:city'), null)
    assert.equal(JSON.parse(localStorage.getItem('unrelated')), 'keep')
    assert.deepEqual(env.native, { unrelated: 'keep' })
  } finally { cleanup() }
})
