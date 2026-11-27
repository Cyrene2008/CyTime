// 将 api/data/quotes.jsonc 同步为 Cloudflare Pages Functions。
// 把语录数据内联进函数文件；访问规则由 functions/ 目录外的模块统一处理。
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

const guards = "import { guardQuoteRequest } from '../../../../server/quoteAccess.js'"

const quoteFile = `${header}
${guards}

const quoteCatalog = ${JSON.stringify(catalog, null, 2)}
const categories = ${JSON.stringify(categories)}

export const onRequest = guardQuoteRequest((request, respond) => {
  const url = new URL(request.url)
  const requested = (url.searchParams.get('category') || '')
    .split(',')
    .map(item => item.trim())
    .filter(item => categories.includes(item))
  const selected = requested.length ? [...new Set(requested)] : categories
  const size = selected.reduce((sum, category) => sum + quoteCatalog[category].length, 0)
  if (!size) return respond({ error: '暂无语录' }, 503)
  let index = Math.min(size - 1, Math.floor(Math.random() * size))
  let quote
  for (const category of selected) {
    if (index < quoteCatalog[category].length) { quote = quoteCatalog[category][index]; break }
    index -= quoteCatalog[category].length
  }
  return respond({ ...quote, category: selected, source: 'CyQuote' })
})
`

const categoriesFile = `${header}
${guards}

const categories = ${JSON.stringify(categories)}
export const onRequest = guardQuoteRequest((request, respond) => respond({ categories }))
`

const countFile = `${header}
${guards}

const counts = ${JSON.stringify(counts)}
const total = ${total}
const categories = ${JSON.stringify(categories)}

export const onRequest = guardQuoteRequest((request, respond) => {
  const url = new URL(request.url)
  const requested = (url.searchParams.get('category') || '').trim()
  if (!requested) return respond({ total, categories: counts })
  if (requested.includes(',')) return respond({ error: '一次只能查询一个分类' }, 400)
  if (!categories.includes(requested)) return respond({ error: '分类不存在', category: requested }, 404)
  return respond({ category: requested, count: counts[requested] })
})
`

const targets = [
  ['../functions/api/v1/quote/index.js', quoteFile],
  ['../functions/api/v1/quote/categories.js', categoriesFile],
  ['../functions/api/v1/quote/count.js', countFile]
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

console.log(`synced ${categories.length} quote categories -> functions/api/v1/quote`)
