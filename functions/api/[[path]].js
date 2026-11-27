export function onRequest({ request }) {
  const headers = {
    'Cache-Control': 'private, no-store',
    'Content-Type': 'application/json; charset=utf-8'
  }
  return new Response(request.method === 'HEAD' ? null : JSON.stringify({ error: 'Not Found' }), { status: 404, headers })
}
