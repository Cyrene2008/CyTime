import { guardQuoteRequest } from '../../../../server/quoteAccess.js'

export const onRequest = guardQuoteRequest(async (request, respond, env) => {
  const kv = env?.QUOTES
  if (!kv) return respond({ error: '语录数据未配置' }, 503)
  const meta = await kv.get('meta', { type: 'json' })
  if (!meta || typeof meta !== 'object' || !meta.categories || typeof meta.categories !== 'object') {
    return respond({ error: '语录数据未配置' }, 503)
  }

  const categories = Object.keys(meta.categories)
  const total = Number.isInteger(meta.total)
    ? meta.total
    : Object.values(meta.categories).reduce((sum, count) => sum + (Number.isInteger(count) ? count : 0), 0)
  const requested = (new URL(request.url).searchParams.get('category') || '').trim()
  if (!requested) return respond({ total, categories: meta.categories })
  if (requested.includes(',')) return respond({ error: '一次只能查询一个分类' }, 400)
  if (!categories.includes(requested)) return respond({ error: '分类不存在', category: requested }, 404)
  return respond({ category: requested, count: meta.categories[requested] })
})
