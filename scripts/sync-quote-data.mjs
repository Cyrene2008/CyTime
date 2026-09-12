// 将 api/data/quotes.jsonc 同步为 Cloudflare Pages Functions 可用的数据模块。
// 用法：node scripts/sync-quote-data.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseJsonc } from '../api/data/jsonc.js'

const source = fileURLToPath(new URL('../api/data/quotes.jsonc', import.meta.url))
const target = fileURLToPath(new URL('../functions/api/data/quotes.js', import.meta.url))
const catalog = parseJsonc(readFileSync(source, 'utf8'))

mkdirSync(dirname(target), { recursive: true })
writeFileSync(target, [
  '// 该文件由 scripts/sync-quote-data.mjs 自动生成，请勿手动修改。',
  '// 语录内容请编辑 api/data/quotes.jsonc 后运行 bun run sync:quotes。',
  `export const quoteCatalog = ${JSON.stringify(catalog, null, 2)}`,
  '',
  'export const categories = Object.keys(quoteCatalog)',
  ''
].join('\n'))

console.log(`synced ${Object.keys(catalog).length} categories -> functions/api/data/quotes.js`)
