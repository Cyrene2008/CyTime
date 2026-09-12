import { categories, quoteCatalog } from '../../data/quotes.js'

export async function onRequest(context) {
  const url = new URL(context.request.url)
  const requested = (url.searchParams.get('category') || '')
    .split(',')
    .map(item => item.trim())
    .filter(item => categories.includes(item))
  const selected = requested.length ? requested : categories
  const pool = selected.flatMap(category => quoteCatalog[category])
  const quote = pool[Math.floor(Math.random() * pool.length)]
  return new Response(JSON.stringify({ ...quote, category: selected, source: 'CyTime Quote API' }), {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store, max-age=0',
      'Content-Type': 'application/json; charset=utf-8'
    }
  })
}
