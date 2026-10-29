export async function onRequest(context) {
  const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Accept, Content-Type',
      'Cache-Control': 'no-store, max-age=0',
      'Content-Type': 'application/json; charset=utf-8'
  }
  if (context.request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
  if (!['GET', 'HEAD'].includes(context.request.method)) return new Response('Method Not Allowed', { status: 405, headers: { ...headers, Allow: 'GET, HEAD, OPTIONS' } })
  return new Response(context.request.method === 'HEAD' ? null : JSON.stringify({ timestamp: Date.now(), source: 'CyTime' }), {
    headers
  })
}
