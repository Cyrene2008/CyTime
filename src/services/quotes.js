import { fetchJson } from './desktop.js'
import { normalizeQuoteEndpoint, quoteApiEndpoints, quoteApiOrder } from './quoteEndpoints.js'

const cyTimeClientHeader = { 'X-CyTime-Client': 'cytime-v1' }
const BLOCKED_TERMS = ['色情', '赌博', '毒品', '暴力恐怖']
const QUOTE_TIMEOUT_MS = 4500
const bundledCategories = new Set(quoteApiEndpoints.flatMap(item => item.categories))
const discoveredCatalogs = new Map()

function fetchQuoteEndpoint(endpoint, suffix, signal, timeoutMs = QUOTE_TIMEOUT_MS) {
  const options = { timeoutMs }
  if (endpoint.id === 'xishi') options.headers = cyTimeClientHeader
  return fetchJson(`https://${endpoint.host}${endpoint.path}${suffix}`, signal, options)
}

async function fetchQuoteApi(preferred, signal, route, parse) {
  let lastError
  for (const id of quoteApiOrder(preferred)) {
    const endpoint = quoteApiEndpoints.find(item => item.id === id)
    const suffix = route(endpoint)
    if (suffix === null) continue
    try {
      return parse(await fetchQuoteEndpoint(endpoint, suffix, signal), endpoint)
    } catch (error) {
      if (signal?.aborted || error?.name === 'AbortError') throw error
      lastError = error
    }
  }
  throw lastError || new Error('语录服务暂不可用')
}

function quoteQuery(endpoint, categories, preferred) {
  const catalog = discoveredCatalogs.get(endpoint.id)
  const known = catalog?.categories ?? endpoint.categories
  // 冷启动时，首选服务可以尝试用户曾选择过的新分类；已知属于备用站的分类直接交给备用站。
  const supported = categories.filter(category => known.includes(category) || (!catalog && endpoint.id === preferred && !bundledCategories.has(category)))
  if (categories.length && !supported.length) return null
  const query = new URLSearchParams(endpoint.id === 'xishu' ? { count: '1' } : { format: 'json' })
  if (endpoint.id === 'xishu') {
    for (const category of supported) query.append('category', category)
  } else if (supported.length) query.set('category', supported.join(','))
  return `?${query}`
}

export function fetchCloudQuote(signal, categories = [], preferred) {
  const selected = [...new Set(categories.filter(category => typeof category === 'string' && category.trim()).map(category => category.trim()))]
  const first = normalizeQuoteEndpoint(preferred)
  return fetchQuoteApi(first, signal, endpoint => quoteQuery(endpoint, selected, first), (payload, endpoint) => {
    const quote = typeof payload?.value === 'string' ? payload.value.trim() : ''
    if (!quote || BLOCKED_TERMS.some(term => quote.includes(term))) throw new Error('语录内容无效')
    // 备用服务会把不认识的分类过滤后当成“全库”；用响应里的 category 再确认一次。
    const returned = Array.isArray(payload?.category) ? payload.category.filter(item => typeof item === 'string') : []
    if (selected.length && !returned.some(category => selected.includes(category))) throw new Error('语录分类不匹配')
    return {
      text: quote,
      author: typeof payload.author === 'string' ? payload.author.trim() : '',
      work: typeof payload.from === 'string' ? payload.from.trim() : '',
      source: endpoint.id,
      sourceName: endpoint.label
    }
  })
}

function readCategories(payload) {
  return Array.isArray(payload?.categories) ? [...new Set(payload.categories.filter(item => typeof item === 'string' && item.trim()).map(item => item.trim()))] : []
}

function readStats(payload, field, categories) {
  const counts = payload?.[field]
  if (!Number.isInteger(payload?.total) || payload.total < 0 || !counts || typeof counts !== 'object' || Array.isArray(counts)) return null
  const pairs = Object.entries(counts)
  if (pairs.some(([, count]) => !Number.isInteger(count) || count < 0) || pairs.reduce((sum, [, count]) => sum + count, 0) !== payload.total) return null
  if (categories.length && (pairs.length !== categories.length || categories.some(category => !Object.hasOwn(counts, category)))) return null
  return { total: payload.total, counts: Object.fromEntries(pairs) }
}

export async function fetchQuoteCatalog(signal, preferred) {
  const endpoint = quoteApiEndpoints.find(item => item.id === normalizeQuoteEndpoint(preferred))
  const deadline = Date.now() + QUOTE_TIMEOUT_MS
  const optional = async suffix => {
    const timeoutMs = deadline - Date.now()
    signal?.throwIfAborted()
    if (timeoutMs <= 0) return null
    try { return await fetchQuoteEndpoint(endpoint, suffix, signal, timeoutMs) }
    catch (error) {
      if (signal?.aborted || error?.name === 'AbortError') throw error
      return null
    }
  }
  let categories, stats
  if (endpoint.id === 'xishu') {
    // 昔枢一次返回目录和计数。拆分的接口共用同一个请求时限。
    const response = await optional('/categories')
    categories = readCategories(response)
    stats = (categories.length ? readStats(response, 'counts', categories) : null)
      || readStats(await optional('/count'), 'categories', categories)
  } else {
    const [list, count] = await Promise.all([optional('/categories'), optional('/count')])
    categories = readCategories(list)
    stats = readStats(count, 'categories', categories)
  }
  if (!categories.length && stats) categories = Object.keys(stats.counts)
  if (!categories.length) return { categories: [...(discoveredCatalogs.get(endpoint.id)?.categories ?? endpoint.categories)], counts: {}, total: null }
  const result = { categories, counts: stats?.counts || {}, total: stats?.total ?? null }
  discoveredCatalogs.set(endpoint.id, result)
  return result
}

export async function readQuoteFile(file) {
  const text = await file.text()
  if (file.name.toLowerCase().endsWith('.json')) {
    const data = JSON.parse(text)
    const values = Array.isArray(data) ? data : data.quotes
    return (Array.isArray(values) ? values : []).map(item => {
      if (typeof item === 'string') return { text: item }
      return { text: item?.text, author: item?.author || item?.from_who, work: item?.work || item?.origin || item?.from }
    }).filter(item => item.text).map(item => ({ ...item, text: String(item.text).trim() }))
  }
  return text.split(/\r?\n/).map(item => item.trim()).filter(Boolean).map(item => ({ text: item }))
}
