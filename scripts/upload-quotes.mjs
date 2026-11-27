// 将私有语录 JSONC 上传到 Cloudflare KV（不写入仓库）。
// 用法：bun run quotes:upload -- "D:\private\quotes.jsonc" <namespace-id>
// 也可以设置 QUOTES_KV_ID 环境变量，省略第二个参数。
import { execSync } from 'node:child_process'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseJsonc } from '../api/data/jsonc.js'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const positional = args.filter(arg => arg !== '--dry-run')
const source = positional[0]
const namespaceId = positional[1] || process.env.QUOTES_KV_ID
if (!source) {
  console.error('用法: bun run quotes:upload -- <quotes.jsonc> <namespace-id> [--dry-run]')
  process.exit(1)
}
if (!dryRun && !namespaceId) {
  console.error('缺少 KV 命名空间 ID：请传入第二个参数，或设置 QUOTES_KV_ID。')
  process.exit(1)
}

const catalog = parseJsonc(readFileSync(source, 'utf8'))
if (!catalog || typeof catalog !== 'object' || Array.isArray(catalog)) {
  console.error('语录文件格式无效：顶层必须是分类对象。')
  process.exit(1)
}

const counts = {}
const entries = []
for (const [category, list] of Object.entries(catalog)) {
  if (!Array.isArray(list)) {
    console.error(`分类「${category}」不是数组。`)
    process.exit(1)
  }
  const quotes = list.map((item, index) => {
    if (!item || typeof item.value !== 'string' || !item.value.trim()) {
      console.error(`分类「${category}」第 ${index + 1} 条缺少 value。`)
      process.exit(1)
    }
    return {
      value: item.value.trim(),
      author: typeof item.author === 'string' ? item.author : '',
      from: typeof item.from === 'string' ? item.from : ''
    }
  })
  if (!quotes.length) continue
  counts[category] = quotes.length
  entries.push({ key: `category:${category}`, value: JSON.stringify(quotes) })
}

if (!entries.length) {
  console.error('没有可上传的语录。')
  process.exit(1)
}

const total = Object.values(counts).reduce((sum, count) => sum + count, 0)
const meta = { total, categories: counts, updatedAt: new Date().toISOString() }
entries.unshift({ key: 'meta', value: JSON.stringify(meta) })

console.log(`准备上传 ${total} 条语录，共 ${Object.keys(counts).length} 个分类：${Object.keys(counts).join('、')}`)
if (dryRun) {
  console.log('[dry-run] 未写入 Cloudflare KV。')
  process.exit(0)
}

const temp = join(tmpdir(), `cytime-quotes-${process.pid}-${Date.now()}.json`)
writeFileSync(temp, JSON.stringify(entries), 'utf8')
try {
  execSync(`bunx wrangler kv bulk put "${temp}" --namespace-id="${namespaceId}"`, { stdio: 'inherit' })
  console.log('语录已写入 Cloudflare KV。')
} finally {
  rmSync(temp, { force: true })
}
