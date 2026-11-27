import { guardQuoteRequest } from '../../../../server/quoteAccess.js'

export const onRequest = guardQuoteRequest(async (request, respond, env) => {
  const kv = env?.QUOTES
  if (!kv) return respond({ error: '语录数据未配置' }, 503)
  const meta = await kv.get('meta', { type: 'json' })
  if (!meta || typeof meta !== 'object' || !meta.categories || typeof meta.categories !== 'object') {
    return respond({ error: '语录数据未配置' }, 503)
  }
  return respond({ categories: Object.keys(meta.categories) })
})
