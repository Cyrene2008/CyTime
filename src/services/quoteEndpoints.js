// 静态分类只用于离线、未升级的服务以及尚未取得目录时。
export const quoteApiEndpoints = [
  { id: 'xishu', label: '昔枢', host: 'api.cyrene.hk', path: '/v1/quote', categories: ['人民日报', '名人名言', '崩铁', '英语'] },
  { id: 'xiyan', label: '昔言', host: 'quote.cyrene.hk', path: '/api/v1/quote', categories: ['人民日报', '名人名言', '崩铁', '幽默解压'] },
  { id: 'xishi', label: '昔时', host: 'time.cyrene.hk', path: '/api/v1/quote', categories: ['人民日报', '名人名言', '崩铁', '幽默解压'] }
]

export const defaultQuoteApiEndpoint = quoteApiEndpoints[0].id
export const quoteApiRevision = 1

export function normalizeQuoteEndpoint(id) {
  return quoteApiEndpoints.some(endpoint => endpoint.id === id) ? id : defaultQuoteApiEndpoint
}

export function quoteApiOrder(preferred) {
  const first = normalizeQuoteEndpoint(preferred)
  return [first, ...quoteApiEndpoints.map(endpoint => endpoint.id).filter(id => id !== first)]
}

export function migrateQuoteSettings(settings) {
  const { quoteSources: _sources, quoteCloudSource: _source, ...preserved } = settings || {}
  return {
    ...preserved,
    quoteApiEndpoint: preserved.quoteApiRevision === quoteApiRevision ? normalizeQuoteEndpoint(preserved.quoteApiEndpoint) : defaultQuoteApiEndpoint,
    quoteApiRevision
  }
}
