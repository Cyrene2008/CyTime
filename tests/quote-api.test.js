import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { parseJsonc } from '../api/data/jsonc.js'
import quoteHandler from '../api/v1/quote/index.js'
import countHandler from '../api/v1/quote/count.js'
import categoriesHandler from '../api/v1/quote/categories.js'
import { onRequest as quoteWorker } from '../functions/api/v1/quote/index.js'
import { onRequest as countWorker } from '../functions/api/v1/quote/count.js'
import { onRequest as categoriesWorker } from '../functions/api/v1/quote/categories.js'
import { onRequest as timeWorker } from '../functions/api/v1/time.js'
import { onRequest as weatherWorker } from '../functions/api/xiaomi-weather/[[path]].js'

const catalog = parseJsonc(readFileSync(new URL('../api/data/quotes.jsonc', import.meta.url), 'utf8'))
const categories = Object.keys(catalog)
function server(handler, query = {}, method = 'GET') {
  const response = { code: 200, headers: {}, body: null, setHeader(key, value) { this.headers[key] = value }, status(code) { this.code = code; return this }, json(body) { this.body = body; return this }, end() { return this } }
  handler({ query, method }, response)
  return response
}
const request = (path, method = 'GET') => ({ request: new Request(`https://example.test${path}`, { method }) })

test('generated and server quote metadata match the canonical catalog', async () => {
  const expected = Object.fromEntries(categories.map(category => [category, catalog[category].length]))
  const total = Object.values(expected).reduce((sum, count) => sum + count, 0)
  assert.deepEqual(server(categoriesHandler).body.categories, categories)
  assert.deepEqual((await (await categoriesWorker(request('/api/v1/quote/categories'))).json()).categories, categories)
  assert.deepEqual(server(countHandler).body, { total, categories: expected })
  assert.deepEqual(await (await countWorker(request('/api/v1/quote/count'))).json(), { total, categories: expected })
})

test('random selection crosses category boundaries with per-quote weighting and ignores repeated filters', async () => {
  const selected = categories.filter(category => catalog[category].length).slice(0, 2)
  assert.equal(selected.length, 2)
  const total = selected.reduce((sum, category) => sum + catalog[category].length, 0)
  const old = Math.random
  try {
    Math.random = () => 0
    assert.equal(server(quoteHandler, { category: selected.join(',') }).body.value, catalog[selected[0]][0].value)
    Math.random = () => (catalog[selected[0]].length + 0.5) / total
    const response = await quoteWorker(request(`/api/v1/quote?category=${encodeURIComponent([...selected, selected[0]].join(','))}`))
    const body = await response.json()
    assert.equal(body.value, catalog[selected[1]][0].value)
    assert.deepEqual(body.category, selected)
    assert.match(response.headers.get('Cache-Control'), /no-store/)
  } finally { Math.random = old }
})

test('counts reject nonexistent and multiple categories without accepting inherited object keys', async () => {
  assert.equal(server(countHandler, { category: '__proto__' }).code, 404)
  assert.equal(server(countHandler, { category: categories.join(',') }).code, 400)
  assert.equal((await countWorker(request('/api/v1/quote/count?category=missing'))).status, 404)
  assert.equal((await countWorker(request(`/api/v1/quote/count?category=${encodeURIComponent(categories.join(','))}`))).status, 400)
})

test('quote endpoints support HEAD and CORS preflight and reject unsupported methods', async () => {
  for (const handler of [quoteHandler, countHandler, categoriesHandler]) {
    assert.equal(server(handler, {}, 'HEAD').body, null)
    assert.equal(server(handler, {}, 'OPTIONS').code, 204)
    assert.equal(server(handler, {}, 'POST').code, 405)
  }
  for (const handler of [quoteWorker, countWorker, categoriesWorker]) {
    const head = await handler(request('/api/v1/quote', 'HEAD'))
    assert.equal(head.status, 200)
    assert.equal(await head.text(), '')
    const preflight = await handler(request('/api/v1/quote', 'OPTIONS'))
    assert.equal(preflight.status, 204)
    assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), '*')
    assert.equal((await handler(request('/api/v1/quote', 'POST'))).status, 405)
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
