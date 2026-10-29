// 线上（Cloudflare Pages）小米天气反向代理：与 Vite Dev Server 的 /api/xiaomi-weather 代理保持一致。
// 语录等接口请勿放此目录，避免与 functions/api/[[path]].js 说明页路由混淆。
const UPSTREAM = 'https://weatherapi.market.xiaomi.com'
const PREFIX = '/api/xiaomi-weather'

export async function onRequest(context) {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS', 'Access-Control-Allow-Headers': 'Accept, Content-Type' }
  if (context.request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
  if (!['GET', 'HEAD'].includes(context.request.method)) return new Response('Method Not Allowed', { status: 405, headers: { ...headers, Allow: 'GET, HEAD, OPTIONS' } })
  const url = new URL(context.request.url)
  const path = url.pathname.slice(PREFIX.length)
  if (!path.startsWith('/wtr-v3/')) {
    return new Response('Not Found', { status: 404, headers })
  }
  const upstream = await fetch(`${UPSTREAM}${path}${url.search}`, {
    headers: { Accept: 'application/json' }
  })
  if (context.request.method === 'HEAD') await upstream.body?.cancel()
  return new Response(context.request.method === 'HEAD' ? null : upstream.body, {
    status: upstream.status,
    headers: {
      ...headers,
      'Cache-Control': 'no-store, max-age=0',
      'Content-Type': upstream.headers.get('Content-Type') || 'application/json; charset=utf-8'
    }
  })
}
