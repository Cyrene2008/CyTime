import { readFileSync } from 'node:fs'
import { parseJsonc } from '../../data/jsonc.js'

const catalog = parseJsonc(readFileSync(new URL('../../data/quotes.jsonc', import.meta.url), 'utf8'))
const categories = Object.keys(catalog)

export default function handler(request, response) {
  const requested = String(request.query?.category || '').split(',').map(item => item.trim()).filter(item => categories.includes(item))
  const selectedCategories = requested.length ? requested : categories
  const pool = selectedCategories.flatMap(category => catalog[category])
  const quote = pool[Math.floor(Math.random() * pool.length)]
  response.setHeader('Access-Control-Allow-Origin', '*')
  response.setHeader('Cache-Control', 'no-store, max-age=0')
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.status(200).json({ ...quote, category: selectedCategories, source: 'CyTime Quote API' })
}
