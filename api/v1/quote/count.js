import { readFileSync } from 'node:fs'
import { parseJsonc } from '../../data/jsonc.js'

const catalog = parseJsonc(readFileSync(new URL('../../data/quotes.jsonc', import.meta.url), 'utf8'))
const counts = Object.fromEntries(Object.entries(catalog).map(([category, list]) => [category, list.length]))
const total = Object.values(counts).reduce((sum, value) => sum + value, 0)

export default function handler(request, response) {
  const method = request.method || 'GET'
  response.setHeader('Access-Control-Allow-Origin', '*')
  response.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
  response.setHeader('Access-Control-Allow-Headers', 'Accept, Content-Type')
  response.setHeader('Cache-Control', 'public, max-age=300')
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  if (method === 'OPTIONS') return response.status(204).end()
  if (!['GET', 'HEAD'].includes(method)) { response.setHeader('Allow', 'GET, HEAD, OPTIONS'); return response.status(405).json({ error: 'Method Not Allowed' }) }
  const respond = (body, status = 200) => method === 'HEAD' ? response.status(status).end() : response.status(status).json(body)
  const requested = String(request.query?.category || '').trim()
  if (requested) {
    if (requested.includes(',')) return respond({ error: '一次只能查询一个分类' }, 400)
    if (!Object.hasOwn(counts, requested)) return respond({ error: '分类不存在', category: requested }, 404)
    return respond({ category: requested, count: counts[requested] })
  }
  return respond({ total, categories: counts })
}
