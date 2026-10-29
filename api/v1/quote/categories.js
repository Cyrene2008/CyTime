import { readFileSync } from 'node:fs'
import { parseJsonc } from '../../data/jsonc.js'

const catalog = parseJsonc(readFileSync(new URL('../../data/quotes.jsonc', import.meta.url), 'utf8'))
const categories = Object.keys(catalog)

export default function handler(request, response) {
  const method = request.method || 'GET'
  response.setHeader('Access-Control-Allow-Origin', '*')
  response.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
  response.setHeader('Access-Control-Allow-Headers', 'Accept, Content-Type')
  response.setHeader('Cache-Control', 'public, max-age=300')
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  if (method === 'OPTIONS') return response.status(204).end()
  if (!['GET', 'HEAD'].includes(method)) { response.setHeader('Allow', 'GET, HEAD, OPTIONS'); return response.status(405).json({ error: 'Method Not Allowed' }) }
  return method === 'HEAD' ? response.status(200).end() : response.status(200).json({ categories })
}
