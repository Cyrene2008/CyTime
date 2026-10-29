import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createPinia } from 'pinia'
import { fetchJson } from '../src/services/desktop.js'
import { fetchXiaomiWeather, locateWeatherCity } from '../src/services/weather.js'
import { fetchNetworkTime, parseUtcDateTime } from '../src/services/timeSync.js'
import { useWeatherStore } from '../src/stores/weather.js'

const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }
const weather = temperature => ({ current: { weather: 0, temperature: { value: temperature } } })
class MemoryStorage {
  values = new Map()
  getItem(key) { return this.values.get(key) ?? null }
  setItem(key, value) { this.values.set(key, value) }
}
async function environment(run) {
  const original = { window: globalThis.window, fetch: globalThis.fetch, storage: globalThis.localStorage }
  delete globalThis.window
  globalThis.localStorage = new MemoryStorage()
  try { await run() }
  finally {
    if (original.window === undefined) delete globalThis.window
    else globalThis.window = original.window
    globalThis.fetch = original.fetch
    if (original.storage === undefined) delete globalThis.localStorage
    else globalThis.localStorage = original.storage
  }
}

test('cancelled desktop requests reject promptly and late replies do not trigger browser fallback', () => environment(async () => {
  const request = deferred()
  let fallbacks = 0
  globalThis.window = { __TAURI_INTERNALS__: { invoke: () => request.promise } }
  globalThis.fetch = async () => { fallbacks++; return Response.json({}) }
  const controller = new AbortController()
  const response = fetchJson('https://time.cyrene.hk/api/v1/time', controller.signal)
  controller.abort()
  await assert.rejects(response, { name: 'AbortError' })
  request.resolve({ timestamp: 1 })
  await Promise.resolve()
  assert.equal(fallbacks, 0)
}))

test('failed native requests can use browser fallback and pre-cancelled requests are never sent', () => environment(async () => {
  let nativeCalls = 0
  globalThis.window = { __TAURI_INTERNALS__: { invoke: async () => { nativeCalls++; throw new Error('unavailable') } } }
  globalThis.fetch = async () => Response.json({ value: 42 })
  assert.deepEqual(await fetchJson('https://time.cyrene.hk/api/v1/quote'), { value: 42 })
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(fetchJson('https://time.cyrene.hk/api/v1/time', controller.signal), { name: 'AbortError' })
  assert.equal(nativeCalls, 1)
}))

test('request timeout bounds a stalled fetch without waiting for a body response', () => environment(async () => {
  const original = globalThis.setTimeout
  globalThis.setTimeout = (callback, duration, ...args) => {
    if (duration === 12000) { queueMicrotask(callback); return 0 }
    return original(callback, duration, ...args)
  }
  globalThis.fetch = () => new Promise(() => {})
  try { await assert.rejects(fetchJson('https://time.cyrene.hk/api/v1/time'), { name: 'TimeoutError' }) }
  finally { globalThis.setTimeout = original }
}))

test('concurrent weather refreshes share a request and retain zero temperatures', () => environment(async () => {
  const request = deferred()
  let calls = 0
  globalThis.fetch = () => { calls++; return request.promise }
  const store = useWeatherStore(createPinia())
  try {
    const first = store.refresh('101')
    const second = store.refresh('101', true)
    request.resolve(Response.json(weather(0)))
    const results = await Promise.all([first, second])
    assert.deepEqual(results[0], results[1])
    await store.refresh('101')
    assert.equal(calls, 1)
    assert.equal(store.current.temperature.value, 0)
  } finally { store.$dispose() }
}))

test('switching weather cities ignores a late response from the previous city', () => environment(async () => {
  const first = deferred()
  const second = deferred()
  globalThis.fetch = url => new URL(url, 'https://example.test').searchParams.get('locationKey') === 'weathercn:101' ? first.promise : second.promise
  const store = useWeatherStore(createPinia())
  try {
    const old = store.refresh('101')
    const current = store.refresh('102')
    second.resolve(Response.json(weather(20)))
    await current
    first.resolve(Response.json(weather(99)))
    await old
    assert.equal(store.current.temperature.value, 20)
    assert.equal(store.loading, false)
  } finally { store.$dispose() }
}))

test('a fresh cache for one city cannot suppress the first request for another city', () => environment(async () => {
  localStorage.setItem('cytime.weather-cache.v1:101', JSON.stringify({ data: weather(10), updatedAt: Date.now() }))
  let calls = 0
  globalThis.fetch = async () => { calls++; return Response.json(weather(22)) }
  const store = useWeatherStore(createPinia())
  try {
    await store.refresh('101')
    assert.equal(calls, 0)
    await store.refresh('102')
    assert.equal(calls, 1)
    assert.equal(store.current.temperature.value, 22)
  } finally { store.$dispose() }
}))

test('weather endpoints follow runtime desktop detection rather than import-time detection', () => environment(async () => {
  let url = ''
  globalThis.window = { __TAURI_INTERNALS__: { invoke: async (_command, args) => { url = args.url; return weather(5) } } }
  await fetchXiaomiWeather('101')
  assert.ok(url.startsWith('https://weatherapi.market.xiaomi.com/wtr-v3/'))
}))

test('UTC date strings without offsets stay UTC in a non-UTC device timezone', () => {
  const original = process.env.TZ
  process.env.TZ = 'Asia/Shanghai'
  try {
    assert.equal(parseUtcDateTime('2026-10-28T08:00:00'), Date.parse('2026-10-28T08:00:00Z'))
    assert.equal(parseUtcDateTime('2026-10-28T08:00:00+08:00'), Date.parse('2026-10-28T00:00:00Z'))
    assert.ok(Number.isNaN(parseUtcDateTime('')))
  } finally { if (original === undefined) delete process.env.TZ; else process.env.TZ = original }
})

test('cancelled time and location requests do not start additional providers or geolocation', () => environment(async () => {
  let calls = 0
  globalThis.fetch = () => { calls++; return new Promise(() => {}) }
  const first = new AbortController()
  const time = fetchNetworkTime('auto', first.signal)
  first.abort()
  await assert.rejects(time, { name: 'AbortError' })
  const second = new AbortController()
  const location = locateWeatherCity(second.signal)
  second.abort()
  await assert.rejects(location, { name: 'AbortError' })
  assert.equal(calls, 2)
}))
