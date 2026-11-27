import { guardQuoteRequest } from '../../../../server/quoteAccess.js'

function categoryCounts(meta) {
  if (!meta || typeof meta !== 'object' || !meta.categories || typeof meta.categories !== 'object') return null
  const entries = Object.entries(meta.categories)
    .filter(([name, count]) => typeof name === 'string' && name.trim() && Number.isInteger(count) && count > 0)
  if (!entries.length) return null
  return new Map(entries)
}

export const onRequest = guardQuoteRequest(async (request, respond, env) => {
  const kv = env?.QUOTES
  if (!kv) return respond({ error: '语录数据未配置' }, 503)
  const meta = await kv.get('meta', { type: 'json' })
  const counts = categoryCounts(meta)
  if (!counts) return respond({ error: '语录数据未配置' }, 503)

  const raw = new URL(request.url).searchParams.getAll('category')
    .flatMap(value => value.split(','))
    .map(value => value.trim())
    .filter(Boolean)
  const requested = [...new Set(raw)]
  if (requested.length && !requested.some(category => counts.has(category))) {
    return respond({ error: '分类不存在' }, 404)
  }
  const selected = requested.length ? requested.filter(category => counts.has(category)) : [...counts.keys()]

  const total = selected.reduce((sum, category) => sum + counts.get(category), 0)
  let index = Math.floor(Math.random() * total)
  let category = selected[selected.length - 1]
  for (const name of selected) {
    if (index < counts.get(name)) { category = name; break }
    index -= counts.get(name)
  }

  const quotes = await kv.get(`category:${category}`, { type: 'json' })
  if (!Array.isArray(quotes) || !quotes.length) return respond({ error: '暂无语录' }, 503)
  const quote = quotes[Math.floor(Math.random() * quotes.length)]
  if (!quote || typeof quote.value !== 'string' || !quote.value.trim()) return respond({ error: '暂无语录' }, 503)

  return respond({
    value: quote.value.trim(),
    author: typeof quote.author === 'string' ? quote.author : '',
    from: typeof quote.from === 'string' ? quote.from : '',
    category: selected,
    source: 'CyQuote'
  })
})
