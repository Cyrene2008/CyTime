import { readFileSync } from 'node:fs'
import { parseJsonc } from '../../data/jsonc.js'

const catalog = parseJsonc(readFileSync(new URL('../../data/quotes.jsonc', import.meta.url), 'utf8'))
const categories = Object.keys(catalog)

export default function handler(request, response) {
  const method = request.method || 'GET'
  response.setHeader('Access-Control-Allow-Origin', '*')
  response.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
  response.setHeader('Access-Control-Allow-Headers', 'Accept, Content-Type')
  response.setHeader('Cache-Control', 'no-store, max-age=0')
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  if (method === 'OPTIONS') return response.status(204).end()
  if (!['GET', 'HEAD'].includes(method)) { response.setHeader('Allow', 'GET, HEAD, OPTIONS'); return response.status(405).json({ error: 'Method Not Allowed' }) }
  const requested = String(request.query?.category || '').split(',').map(item => item.trim()).filter(item => categories.includes(item))
  const selectedCategories = requested.length ? [...new Set(requested)] : categories
  const size = selectedCategories.reduce((sum, category) => sum + catalog[category].length, 0)
  if (!size) return response.status(503).json({ error: '暂无语录' })
  if (method === 'HEAD') return response.status(200).end()
  let index = Math.min(size - 1, Math.floor(Math.random() * size))
  let quote
  for (const category of selectedCategories) {
    if (index < catalog[category].length) { quote = catalog[category][index]; break }
    index -= catalog[category].length
  }
  response.status(200).json({ ...quote, category: selectedCategories, source: 'CyTime Quote API' })
}
