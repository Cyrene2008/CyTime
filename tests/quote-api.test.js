import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { parseJsonc } from '../api/data/jsonc.js'
import { onRequest as quoteWorker } from '../functions/api/v1/quote/index.js'
import { onRequest as countWorker } from '../functions/api/v1/quote/count.js'
import { onRequest as categoriesWorker } from '../functions/api/v1/quote/categories.js'
import { onRequest as apiRoot } from '../functions/api/index.js'
import { onRequest as missingApiWorker } from '../functions/api/[[path]].js'
import { onRequest as timeWorker } from '../functions/api/v1/time.js'
import { onRequest as weatherWorker } from '../functions/api/xiaomi-weather/[[path]].js'

const catalog = parseJsonc(readFileSync(new URL('../api/data/quotes.jsonc', import.meta.url), 'utf8'))
const categories = Object.keys(catalog)
const appOrigin = 'https://time.cyrene.hk'
const marker = { 'X-CyTime-Client': 'cytime-v1' }
const appHeaders = { ...marker, 'Sec-Fetch-Site': 'same-origin' }
const request = (path, method = 'GET', headers = appHeaders, target = appOrigin, env) => ({
  request: new Request(`${target}${path}`, { method, headers }),
  env
})
const protectedRoutes = [
  ['/api/v1/quote', quoteWorker],
  ['/api/v1/quote/categories', categoriesWorker],
  ['/api/v1/quote/count', countWorker]
]

test('generated quote metadata matches the canonical catalog', async () => {
  const expected = Object.fromEntries(categories.map(category => [category, catalog[category].length]))
  const total = Object.values(expected).reduce((sum, count) => sum + count, 0)
  assert.deepEqual((await (await categoriesWorker(request('/api/v1/quote/categories'))).json()).categories, categories)
  assert.deepEqual(await (await countWorker(request('/api/v1/quote/count'))).json(), { total, categories: expected })
})

test('random selection crosses category boundaries with per-quote weighting and ignores repeated filters', async () => {
  const selected = categories.filter(category => catalog[category].length).slice(0, 2)
  assert.equal(selected.length, 2)
  const total = selected.reduce((sum, category) => sum + catalog[category].length, 0)
  const old = Math.random
  try {
    Math.random = () => 0
    const first = await quoteWorker(request(`/api/v1/quote?category=${encodeURIComponent(selected.join(','))}`))
    assert.equal((await first.json()).value, catalog[selected[0]][0].value)
    Math.random = () => (catalog[selected[0]].length + 0.5) / total
    const response = await quoteWorker(request(`/api/v1/quote?category=${encodeURIComponent([...selected, selected[0]].join(','))}`))
    const body = await response.json()
    assert.equal(body.value, catalog[selected[1]][0].value)
    assert.deepEqual(body.category, selected)
    assert.match(response.headers.get('Cache-Control'), /no-store/)
  } finally { Math.random = old }
})

test('counts reject nonexistent and multiple categories without accepting inherited object keys', async () => {
  const missing = await countWorker(request('/api/v1/quote/count?category=__proto__'))
  assert.equal(missing.status, 404)
  assert.equal(missing.headers.get('Cache-Control'), 'private, no-store')
  assert.equal((await countWorker(request(`/api/v1/quote/count?category=${encodeURIComponent(categories.join(','))}`))).status, 400)
})

test('each quote route accepts same-origin client requests and CORS from trusted site and desktop origins', async () => {
  for (const [path, handler] of protectedRoutes) {
    const sameOrigin = await handler(request(path))
    assert.equal(sameOrigin.status, 200)
    assert.equal(sameOrigin.headers.get('Access-Control-Allow-Origin'), null)
    assert.equal(sameOrigin.headers.get('Cache-Control'), 'private, no-store')
    for (const Origin of ['https://cytime.pages.dev', 'http://tauri.localhost', 'https://tauri.localhost', 'tauri://localhost']) {
      const result = await handler(request(path, 'GET', { ...marker, Origin }))
      assert.equal(result.status, 200)
      assert.equal(result.headers.get('Access-Control-Allow-Origin'), Origin)
      assert.match(result.headers.get('Vary'), /\bOrigin\b/i)
      assert.equal(result.headers.get('Cache-Control'), 'private, no-store')
    }
    const head = await handler(request(path, 'HEAD'))
    assert.equal(head.status, 200)
    assert.equal(await head.text(), '')
    assert.equal((await handler(request(path, 'POST'))).status, 405)
  }
})

test('quote routes deny unlisted origins, navigation, and requests missing the client marker', async () => {
  for (const [path, handler] of protectedRoutes) {
    for (const headers of [
      {},
      marker,
      { 'Sec-Fetch-Site': 'same-origin' },
      { ...marker, 'Sec-Fetch-Site': 'same-site' },
      { ...marker, 'Sec-Fetch-Site': 'none' },
      { 'X-CyTime-Client': 'wrong', Origin: appOrigin },
      { ...marker, Origin: 'null', 'Sec-Fetch-Site': 'same-origin' },
      { ...marker, Origin: 'https://another.cyrene.hk' },
      { ...marker, Origin: 'https://preview.cytime.pages.dev' }
    ]) {
      const denial = await handler(request(path, 'GET', headers))
      assert.equal(denial.status, 403)
      assert.equal(denial.headers.get('Access-Control-Allow-Origin'), null)
      assert.equal(denial.headers.get('Cache-Control'), 'private, no-store')
    }
    assert.equal((await handler(request(path, 'GET', appHeaders, 'https://unlisted.example'))).status, 403)
    const head = await handler(request(path, 'HEAD', {}))
    assert.equal(head.status, 403)
    assert.equal(await head.text(), '')
  }
})

test('CORS preflight requires a trusted origin, an allowed method, and the client marker header', async () => {
  const Origin = 'http://tauri.localhost'
  const headers = {
    Origin,
    'Access-Control-Request-Method': 'GET',
    'Access-Control-Request-Headers': 'X-CyTime-Client, accept'
  }
  for (const [path, handler] of protectedRoutes) {
    const preflight = await handler(request(path, 'OPTIONS', headers))
    assert.equal(preflight.status, 204)
    assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), Origin)
    assert.equal(preflight.headers.get('Access-Control-Allow-Methods'), 'GET, HEAD')
    assert.match(preflight.headers.get('Access-Control-Allow-Headers'), /X-CyTime-Client/)
    assert.equal(preflight.headers.get('Cache-Control'), 'private, no-store')
    for (const override of [
      { Origin: 'https://example.test' },
      { 'Access-Control-Request-Method': 'POST' },
      { 'Access-Control-Request-Headers': 'Accept' },
      { 'Access-Control-Request-Headers': 'X-CyTime-Client, Authorization' }
    ]) {
      const denial = await handler(request(path, 'OPTIONS', { ...headers, ...override }))
      assert.equal(denial.status, 403)
      assert.equal(denial.headers.get('Access-Control-Allow-Origin'), null)
    }
    assert.equal((await handler(request(path, 'OPTIONS', {}))).status, 403)
  }
})

test('only explicitly configured preview and local origins are accepted', async () => {
  const path = '/api/v1/quote'
  const env = { CYTIME_QUOTE_EXTRA_ORIGINS: 'https://preview.cytime.pages.dev, http://localhost:5173 https://*.example.test https://allow.example.test/path null' }
  for (const Origin of ['https://preview.cytime.pages.dev', 'http://localhost:5173']) {
    const crossOrigin = await quoteWorker(request(path, 'GET', { ...marker, Origin }, appOrigin, env))
    assert.equal(crossOrigin.status, 200)
    assert.equal(crossOrigin.headers.get('Access-Control-Allow-Origin'), Origin)
    assert.equal((await quoteWorker(request(path, 'GET', appHeaders, Origin, env))).status, 200)
  }
  for (const Origin of ['http://localhost:5174', 'https://extra.example.test', 'https://allow.example.test', 'null']) {
    assert.equal((await quoteWorker(request(path, 'GET', { ...marker, Origin }, appOrigin, env))).status, 403)
  }
})

test('the API root and retired paths return 404 without redirecting', async () => {
  for (const [path, handler] of [['/api', apiRoot], ['/api/quote', missingApiWorker], ['/api/v1/removed', missingApiWorker]]) {
    const result = await handler(request(path))
    assert.equal(result.status, 404)
    assert.equal(result.headers.get('Location'), null)
    assert.equal(result.headers.get('Cache-Control'), 'private, no-store')
    assert.equal(await (await handler(request(path, 'HEAD'))).text(), '')
  }
})

test('time endpoint returns a current timestamp with no caching and an empty HEAD body', async () => {
  const before = Date.now()
  const response = await timeWorker(request('/api/v1/time'))
  const body = await response.json()
  assert.ok(body.timestamp >= before && body.timestamp <= Date.now())
  assert.match(response.headers.get('Cache-Control'), /no-store/)
  assert.equal(await (await timeWorker(request('/api/v1/time', 'HEAD'))).text(), '')
})

test('weather proxy forwards the response stream and handles preflight without an upstream request', async () => {
  const original = globalThis.fetch
  let calls = 0
  globalThis.fetch = async url => { calls++; assert.ok(String(url).startsWith('https://weatherapi.market.xiaomi.com/wtr-v3/')); return Response.json({ current: { weather: 0 } }) }
  try {
    assert.equal((await weatherWorker(request('/api/xiaomi-weather/wtr-v3/weather/all', 'OPTIONS'))).status, 204)
    assert.equal(calls, 0)
    const response = await weatherWorker(request('/api/xiaomi-weather/wtr-v3/weather/all'))
    assert.deepEqual(await response.json(), { current: { weather: 0 } })
    assert.equal((await weatherWorker(request('/api/xiaomi-weather/not-allowed'))).status, 404)
    assert.equal(await (await weatherWorker(request('/api/xiaomi-weather/wtr-v3/weather/all', 'HEAD'))).text(), '')
  } finally { globalThis.fetch = original }
})
