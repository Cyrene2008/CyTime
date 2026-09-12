// 将 api/data/quotes.jsonc 同步为 Cloudflare Pages Functions。
// 说明：functions/ 目录下每个 .js 都会成为路由，因此这里把数据直接内联进函数文件，
// 不创建共享数据模块，避免产生意外路由。
// 用法：node scripts/sync-quote-data.mjs（bun run build 前会自动执行）
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseJsonc } from '../api/data/jsonc.js'

const source = fileURLToPath(new URL('../api/data/quotes.jsonc', import.meta.url))
const catalog = parseJsonc(readFileSync(source, 'utf8'))
const categories = Object.keys(catalog)

const header = [
  '// 该文件由 scripts/sync-quote-data.mjs 自动生成，请勿手动修改。',
  '// 语录内容请编辑 api/data/quotes.jsonc 后运行 bun run sync:quotes 或 bun run build。'
].join('\n')

const quoteFile = `${header}
const quoteCatalog = ${JSON.stringify(catalog, null, 2)}
const categories = ${JSON.stringify(categories)}

export async function onRequest(context) {
  const url = new URL(context.request.url)
  const requested = (url.searchParams.get('category') || '')
    .split(',')
    .map(item => item.trim())
    .filter(item => categories.includes(item))
  const selected = requested.length ? requested : categories
  const pool = selected.flatMap(category => quoteCatalog[category])
  const quote = pool[Math.floor(Math.random() * pool.length)]
  return new Response(JSON.stringify({ ...quote, category: selected, source: 'CyTime Quote API' }), {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store, max-age=0',
      'Content-Type': 'application/json; charset=utf-8'
    }
  })
}
`

const categoriesFile = `${header}
const categories = ${JSON.stringify(categories)}

export async function onRequest() {
  return new Response(JSON.stringify({ categories }), {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store, max-age=0',
      'Content-Type': 'application/json; charset=utf-8'
    }
  })
}
`

const targets = [
  ['../functions/api/v1/quote/index.js', quoteFile],
  ['../functions/api/v1/quote/categories.js', categoriesFile]
]

for (const [relative, content] of targets) {
  const target = fileURLToPath(new URL(relative, import.meta.url))
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, content)
}

const stale = fileURLToPath(new URL('../functions/api/data/quotes.js', import.meta.url))
try {
  const { rmSync } = await import('node:fs')
  rmSync(stale, { force: true })
  rmSync(dirname(stale), { recursive: true, force: true })
} catch {}

console.log(`synced ${categories.length} categories -> functions/api/v1/quote/*`)
