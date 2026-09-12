export async function onRequest(context) {
  if (context.request.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405 })
  }
  return new Response(JSON.stringify({ timestamp: Date.now(), source: 'CyTime' }), {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store, max-age=0',
      'Content-Type': 'application/json; charset=utf-8'
    }
  })
}
