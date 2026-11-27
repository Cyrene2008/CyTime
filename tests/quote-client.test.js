import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createPinia } from 'pinia'
import { nextTick } from 'vue'
import { fetchCloudQuote, fetchQuoteCategories, fetchQuoteStats } from '../src/services/quotes.js'
import { prepareBackupRestore } from '../src/services/backup.js'
import { useSettingsStore } from '../src/stores/settings.js'

test('the three providers fall back in order on invalid data or HTTP failure', async t => {
  const calls = []
  t.mock.method(globalThis, 'fetch', async (input, options) => {
    const url = new URL(input)
    calls.push([url, options])
    if (url.hostname === 'api.cyrene.hk') return Response.json({ value: ' ' })
    if (url.hostname === 'quote.cyrene.hk') return new Response(null, { status: 503 })
    return Response.json({ value: ' 懂得休息，才有余力前行。 ', author: ' 作者 ', from: '' })
  })

  const quote = await fetchCloudQuote(undefined, ['崩铁', '幽默解压', '崩铁'])
  assert.deepEqual(quote, { text: '懂得休息，才有余力前行。', author: '作者', work: '', source: 'xishi', sourceName: '昔时' })
  assert.deepEqual(calls.map(([url]) => url.hostname), ['api.cyrene.hk', 'quote.cyrene.hk', 'time.cyrene.hk'])
  assert.deepEqual(calls.map(([url]) => url.pathname), ['/v1/quote', '/api/v1/quote', '/api/v1/quote'])
  assert.deepEqual(calls[0][0].searchParams.getAll('category'), ['崩铁', '幽默解压'])
  assert.equal(calls[1][0].searchParams.get('category'), '崩铁,幽默解压')
  assert.equal(calls[1][0].searchParams.get('format'), 'json')
  assert.equal(calls[0][1].headers, undefined)
  assert.equal(calls[1][1].headers, undefined)
  assert.equal(new Headers(calls[2][1].headers).get('X-CyTime-Client'), 'cytime-v1')
})

test('formerly unsupported metadata is fetched from the first compatible service', async t => {
  const calls = []
  t.mock.method(globalThis, 'fetch', async input => {
    const url = new URL(input)
    calls.push(url)
    if (url.pathname.endsWith('/categories')) return Response.json({ categories: ['崩铁'] })
    return Response.json({ total: 2, categories: { 崩铁: 2 } })
  })

  assert.deepEqual(await fetchQuoteCategories(), ['崩铁'])
  assert.deepEqual(await fetchQuoteStats(), { total: 2, categories: { 崩铁: 2 } })
  assert.deepEqual(calls.map(url => url.hostname), ['quote.cyrene.hk', 'quote.cyrene.hk'])
  assert.deepEqual(calls.map(url => url.pathname), ['/api/v1/quote/categories', '/api/v1/quote/count'])
})

test('cancelled requests never contact backup providers', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', () => new Promise(() => {}))
  const controller = new AbortController()
  const result = fetchCloudQuote(controller.signal)
  controller.abort()
  await assert.rejects(result, { name: 'AbortError' })
  assert.equal(fetch.mock.callCount(), 1)
  await assert.rejects(fetchCloudQuote(controller.signal), { name: 'AbortError' })
  assert.equal(fetch.mock.callCount(), 1)
})

test('choosing 昔时 on desktop sends the required marker through the WebView', async t => {
  const originalWindow = globalThis.window
  try {
    globalThis.window = { __TAURI_INTERNALS__: { invoke: () => assert.fail('昔时 requires WebView headers') } }
    const fetch = t.mock.method(globalThis, 'fetch', async (_url, { headers }) => {
      assert.equal(new Headers(headers).get('X-CyTime-Client'), 'cytime-v1')
      return Response.json({ value: '来自昔时' })
    })
    assert.equal((await fetchCloudQuote(undefined, [], 'xishi')).sourceName, '昔时')
    assert.equal(fetch.mock.callCount(), 1)
  } finally {
    if (originalWindow === undefined) delete globalThis.window
    else globalThis.window = originalWindow
  }
})

test('legacy settings migrate and sync once while a later explicit preference survives reload', async () => {
  const original = { window: globalThis.window, document: globalThis.document, localStorage: globalThis.localStorage }
  const writes = []
  const disk = new Map([['cytime.settings.v1', JSON.stringify({ quoteApiEndpoint: 'server', quoteSources: { hitokoto: { enabled: true } }, quoteCloudEnabled: false, dateFontSize: 18 })]])
  try {
    globalThis.window = {
      addEventListener() {},
      removeEventListener() {},
      __TAURI_INTERNALS__: { invoke: async (command, args) => { writes.push([command, args]) } }
    }
    globalThis.document = { documentElement: { classList: { toggle() {} }, style: { setProperty() {}, removeProperty() {} }, dataset: {} } }
    globalThis.localStorage = { getItem: key => disk.get(key), setItem: (key, value) => disk.set(key, value) }
    const installed = useSettingsStore(createPinia())
    await nextTick()
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(installed.settings.quoteApiEndpoint, 'xishu')
    assert.equal(installed.settings.quoteSources, undefined)
    assert.equal(installed.settings.quoteCloudEnabled, false)
    assert.equal(installed.settings.dateFontSize, 18)
    const diskSettings = JSON.parse(disk.get('cytime.settings.v2'))
    assert.equal(diskSettings.quoteApiEndpoint, 'xishu')
    assert.equal(writes[0][0], 'storage_write')
    assert.equal(writes[0][1].key, 'cytime.settings.v2')
    assert.equal(writes[0][1].value.quoteApiRevision, diskSettings.quoteApiRevision)
    installed.update({ quoteApiEndpoint: 'xiyan' })
    await nextTick()
    installed.$dispose()

    const reloaded = useSettingsStore(createPinia())
    assert.equal(reloaded.settings.quoteApiEndpoint, 'xiyan')
    reloaded.$dispose()
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(writes.length, 2)
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete globalThis[key]
      else globalThis[key] = value
    }
  }
})

test('restoring an old backup cannot reintroduce retired providers, but a new backup preserves a selection', () => {
  const current = { settings: { quoteApiEndpoint: 'xiyan', quoteApiRevision: 1, dateFontSize: 20 } }
  const restore = settings => prepareBackupRestore(current, { settings }, ['settings']).updates['cytime.settings.v2']
  assert.deepEqual(restore({ quoteApiEndpoint: 'cf', quoteCloudSource: 'hitokoto', quoteApiCategories: ['崩铁'] }), {
    quoteApiEndpoint: 'xishu', quoteApiRevision: 1, dateFontSize: 20, quoteApiCategories: ['崩铁']
  })
  assert.equal(restore({ quoteApiEndpoint: 'xishi', quoteApiRevision: 1 }).quoteApiEndpoint, 'xishi')
  assert.equal(restore({ dateFontSize: 24 }).quoteApiEndpoint, 'xiyan')
})
