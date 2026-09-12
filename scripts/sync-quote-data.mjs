// 将 api/data/quotes.jsonc 与 api/landing.html 同步为 Cloudflare Pages Functions。
// 说明：functions/ 目录下每个 .js 都会成为路由，因此这里把数据与页面直接内联进函数文件，
// 不创建共享数据模块，避免产生意外路由。
// 用法：node scripts/sync-quote-data.mjs（bun run build 前会自动执行）
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseJsonc } from '../api/data/jsonc.js'

const source = fileURLToPath(new URL('../api/data/quotes.jsonc', import.meta.url))
const catalog = parseJsonc(readFileSync(source, 'utf8'))
const categories = Object.keys(catalog)
const landingHtml = readFileSync(new URL('../api/landing.html', import.meta.url), 'utf8')

const header = [
  '// 该文件由 scripts/sync-quote-data.mjs 自动生成，请勿手动修改。',
  '// 语录内容请编辑 api/data/quotes.jsonc，说明页请编辑 api/landing.html，然后运行 bun run sync:quotes 或 bun run build。'
].join('\n')

const landingBlock = `const landingHtml = ${JSON.stringify(landingHtml)}

function landing() {
  return new Response(landingHtml, {
    headers: {
      'Cache-Control': 'no-store, max-age=0',
      'Content-Type': 'text/html; charset=utf-8'
    }
  })
}`

const jsonHeaders = `{
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store, max-age=0',
      'Content-Type': 'application/json; charset=utf-8'
    }`

const quoteFile = `${header}
const quoteCatalog = ${JSON.stringify(catalog, null, 2)}
const categories = ${JSON.stringify(categories)}

${landingBlock}

export async function onRequest(context) {
  if (context.request.method !== 'GET') return landing()
  const url = new URL(context.request.url)
  const requested = (url.searchParams.get('category') || '')
    .split(',')
    .map(item => item.trim())
    .filter(item => categories.includes(item))
  const selected = requested.length ? requested : categories
  const pool = selected.flatMap(category => quoteCatalog[category])
  const quote = pool[Math.floor(Math.random() * pool.length)]
  return new Response(JSON.stringify({ ...quote, category: selected, source: 'CyQuote' }), {
    headers: ${jsonHeaders}
  })
}
`

const categoriesFile = `${header}
const categories = ${JSON.stringify(categories)}

${landingBlock}

export async function onRequest(context) {
  if (context.request.method !== 'GET') return landing()
  return new Response(JSON.stringify({ categories }), {
    headers: ${jsonHeaders}
  })
}
`

const countFile = `${header}
const quoteCatalog = ${JSON.stringify(catalog, null, 2)}
const categories = ${JSON.stringify(categories)}

${landingBlock}

export async function onRequest(context) {
  if (context.request.method !== 'GET') return landing()
  const url = new URL(context.request.url)
  const requested = (url.searchParams.get('category') || '').trim()
  const counts = {}
  let total = 0
  for (const category of categories) {
    counts[category] = quoteCatalog[category].length
    total += counts[category]
  }
  const respond = (body, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: ${jsonHeaders}
  })
  if (!requested) return respond({ total, categories: counts })
  if (requested.includes(',')) return respond({ error: '一次只能查询一个分类' }, 400)
  if (!categories.includes(requested)) return respond({ error: '分类不存在', category: requested }, 404)
  return respond({ category: requested, count: counts[requested] })
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
  writeFileSync(target, content)
}

const stale = fileURLToPath(new URL('../functions/api/data/quotes.js', import.meta.url))
try {
  rmSync(stale, { force: true })
  rmSync(dirname(stale), { recursive: true, force: true })
} catch {}

console.log(`synced ${categories.length} categories + landing page -> functions/api/*`)
