import { fetchJson } from './desktop.js'
import { quoteApiEndpoints, quoteApiOrder } from './quoteEndpoints.js'

const cyTimeClientHeader = { 'X-CyTime-Client': 'cytime-v1' }
const BLOCKED_TERMS = ['色情', '赌博', '毒品', '暴力恐怖']

async function fetchQuoteApi(preferred, signal, route, parse) {
  let lastError
  for (const id of quoteApiOrder(preferred)) {
    const endpoint = quoteApiEndpoints.find(item => item.id === id)
    const suffix = route(endpoint)
    if (suffix === null) continue
    const options = { timeoutMs: 4500 }
    if (endpoint.id === 'xishi') options.headers = cyTimeClientHeader
    try {
      return parse(await fetchJson(`https://${endpoint.host}${endpoint.path}${suffix}`, signal, options), endpoint)
    } catch (error) {
      if (signal?.aborted || error?.name === 'AbortError') throw error
      lastError = error
    }
  }
  throw lastError || new Error('语录服务暂不可用')
}

function quoteQuery(endpoint, categories) {
  // 只把该服务支持的分类发出去；一个都不支持时直接跳过，避免无意义的 404。
  const supported = endpoint.categories ? categories.filter(category => endpoint.categories.includes(category)) : categories
  if (categories.length && endpoint.categories && !supported.length) return null
  const query = new URLSearchParams(endpoint.id === 'xishu' ? { count: '1' } : { format: 'json' })
  if (endpoint.id === 'xishu') {
    for (const category of supported) query.append('category', category)
  } else if (supported.length) query.set('category', supported.join(','))
  return `?${query}`
}

export function fetchCloudQuote(signal, categories = [], preferred) {
  const selected = [...new Set(categories.filter(category => typeof category === 'string' && category.trim()).map(category => category.trim()))]
  return fetchQuoteApi(preferred, signal, endpoint => quoteQuery(endpoint, selected), (payload, endpoint) => {
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

// 昔枢只提供语录正文，分类列表和统计从支持这些接口的服务读取。
export function fetchQuoteCategories(signal, preferred) {
  return fetchQuoteApi(preferred, signal, endpoint => endpoint.catalog ? '/categories' : null, response => {
    if (!Array.isArray(response?.categories)) throw new Error('语录分类格式无效')
    return response.categories.filter(item => typeof item === 'string' && item.trim())
  })
}

export function fetchQuoteStats(signal, preferred) {
  return fetchQuoteApi(preferred, signal, endpoint => endpoint.catalog ? '/count' : null, response => {
    const { total, categories } = response || {}
    if (!Number.isInteger(total) || total < 0 || !categories || typeof categories !== 'object' || Array.isArray(categories)) throw new Error('语录统计格式无效')
    return { total, categories }
  })
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
