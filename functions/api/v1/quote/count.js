// 该文件由 scripts/sync-quote-data.mjs 自动生成，请勿手动修改。
// 语录内容请编辑 api/data/quotes.jsonc，然后运行 bun run sync:quotes 或 bun run build。
import { guardQuoteRequest } from '../../../../server/quoteAccess.js'

const counts = {"崩铁":1215,"幽默解压":211,"名人名言":1599,"人民日报":537}
const total = 3562
const categories = ["崩铁","幽默解压","名人名言","人民日报"]

export const onRequest = guardQuoteRequest((request, respond) => {
  const url = new URL(request.url)
  const requested = (url.searchParams.get('category') || '').trim()
  if (!requested) return respond({ total, categories: counts })
  if (requested.includes(',')) return respond({ error: '一次只能查询一个分类' }, 400)
  if (!categories.includes(requested)) return respond({ error: '分类不存在', category: requested }, 404)
  return respond({ category: requested, count: counts[requested] })
})
