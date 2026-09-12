import { categories } from '../../data/quotes.js'

export async function onRequest() {
  return new Response(JSON.stringify({ categories }), {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store, max-age=0',
      'Content-Type': 'application/json; charset=utf-8'
    }
  })
}
