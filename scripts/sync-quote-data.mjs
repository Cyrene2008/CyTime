// 将 api/data/quotes.jsonc 同步为 Cloudflare Pages Functions。
// 说明：functions/ 目录下每个 .js 都会成为路由，因此这里把数据直接内联进函数文件，
// 不创建共享数据模块，避免产生意外路由；API 说明页已迁移至 https://quote.cyrene.hk/，
// 本域名下的 /api 落地页统一 302 跳转过去。
// 用法：node scripts/sync-quote-data.mjs（bun run build 前会自动执行）
import { mkdirSync, readFileSync, writeFileSync, rmSync, rmdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseJsonc } from '../api/data/jsonc.js'

const source = fileURLToPath(new URL('../api/data/quotes.jsonc', import.meta.url))
const catalog = parseJsonc(readFileSync(source, 'utf8'))
const categories = Object.keys(catalog)
const counts = Object.fromEntries(categories.map(category => [category, Array.isArray(catalog[category]) ? catalog[category].length : 0]))
const total = Object.values(counts).reduce((sum, value) => sum + value, 0)

const header = [
  '// 该文件由 scripts/sync-quote-data.mjs 自动生成，请勿手动修改。',
  '// 语录内容请编辑 api/data/quotes.jsonc，然后运行 bun run sync:quotes 或 bun run build。'
].join('\n')

const landingBlock = `const DOCS_URL = 'https://quote.cyrene.hk/'

function landing() {
  return new Response(null, {
    status: 302,
    headers: {
      Location: DOCS_URL,
      'Cache-Control': 'no-store, max-age=0'
    }
  })
}`

const helpers = cache => `const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Accept, Content-Type',
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': '${cache}'
}
function respond(request, body, status = 200) {
  return new Response(request.method === 'HEAD' ? null : JSON.stringify(body), { status, headers })
}
function checkMethod(request) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
  if (!['GET', 'HEAD'].includes(request.method)) return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405, headers: { ...headers, Allow: 'GET, HEAD, OPTIONS' } })
  return null
}`

const quoteFile = `${header}
const quoteCatalog = ${JSON.stringify(catalog, null, 2)}
const categories = ${JSON.stringify(categories)}

${helpers('no-store, max-age=0')}

export async function onRequest(context) {
  const request = context.request
  const methodResponse = checkMethod(request)
  if (methodResponse) return methodResponse
  const url = new URL(context.request.url)
  const requested = (url.searchParams.get('category') || '')
    .split(',')
    .map(item => item.trim())
    .filter(item => categories.includes(item))
  const selected = requested.length ? [...new Set(requested)] : categories
  const size = selected.reduce((sum, category) => sum + quoteCatalog[category].length, 0)
  if (!size) return respond(request, { error: '暂无语录' }, 503)
  let index = Math.min(size - 1, Math.floor(Math.random() * size))
  let quote
  for (const category of selected) {
    if (index < quoteCatalog[category].length) { quote = quoteCatalog[category][index]; break }
    index -= quoteCatalog[category].length
  }
  return respond(request, { ...quote, category: selected, source: 'CyQuote' })
}
`

const categoriesFile = `${header}
const categories = ${JSON.stringify(categories)}

${helpers('public, max-age=300')}

export async function onRequest(context) {
  const methodResponse = checkMethod(context.request)
  return methodResponse || respond(context.request, { categories })
}
`

const countFile = `${header}
const counts = ${JSON.stringify(counts)}
const total = ${total}
const categories = ${JSON.stringify(categories)}

${helpers('public, max-age=300')}

export async function onRequest(context) {
  const request = context.request
  const methodResponse = checkMethod(request)
  if (methodResponse) return methodResponse
  const url = new URL(context.request.url)
  const requested = (url.searchParams.get('category') || '').trim()
  if (!requested) return respond(request, { total, categories: counts })
  if (requested.includes(',')) return respond(request, { error: '一次只能查询一个分类' }, 400)
  if (!categories.includes(requested)) return respond(request, { error: '分类不存在', category: requested }, 404)
  return respond(request, { category: requested, count: counts[requested] })
}
`

const landingFile = `${header}
${landingBlock}

export async function onRequest() {
  return landing()
}
`

const targets = [
  ['../functions/api/v1/quote/index.js', quoteFile],
  ['../functions/api/v1/quote/categories.js', categoriesFile],
  ['../functions/api/v1/quote/count.js', countFile],
  ['../functions/api/[[path]].js', landingFile]
]

for (const [relative, content] of targets) {
  const target = fileURLToPath(new URL(relative, import.meta.url))
  mkdirSync(dirname(target), { recursive: true })
  let current = ''
  try { current = readFileSync(target, 'utf8') } catch {}
  if (current.replace(/\r\n/g, '\n') !== content) writeFileSync(target, content)
}

const stale = fileURLToPath(new URL('../functions/api/data/quotes.js', import.meta.url))
try {
  rmSync(stale, { force: true })
  rmdirSync(dirname(stale))
} catch {}

console.log(`synced ${categories.length} categories + docs redirect -> functions/api/*`)
