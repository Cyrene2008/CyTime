import { readFileSync } from 'node:fs'
import { parseJsonc } from '../../data/jsonc.js'

const catalog = parseJsonc(readFileSync(new URL('../../data/quotes.jsonc', import.meta.url), 'utf8'))

export default function handler(request, response) {
  response.setHeader('Access-Control-Allow-Origin', '*')
  response.setHeader('Cache-Control', 'no-store, max-age=0')
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  const counts = Object.fromEntries(Object.entries(catalog).map(([category, list]) => [category, list.length]))
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0)
  const requested = String(request.query?.category || '').trim()
  if (requested) {
    if (requested.includes(',')) return response.status(400).json({ error: '一次只能查询一个分类' })
    if (!(requested in counts)) return response.status(404).json({ error: '分类不存在', category: requested })
    return response.status(200).json({ category: requested, count: counts[requested] })
  }
  return response.status(200).json({ total, categories: counts })
}
