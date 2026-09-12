// 线上（Cloudflare Pages）小米天气反向代理：与 Vite Dev Server 的 /api/xiaomi-weather 代理保持一致。
// 语录等接口请勿放此目录，避免与 functions/api/[[path]].js 说明页路由混淆。
const UPSTREAM = 'https://weatherapi.market.xiaomi.com'
const PREFIX = '/api/xiaomi-weather'

export async function onRequest(context) {
  if (context.request.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405 })
  }
  const url = new URL(context.request.url)
  const path = url.pathname.slice(PREFIX.length)
  if (!path.startsWith('/wtr-v3/')) {
    return new Response('Not Found', { status: 404 })
  }
  const upstream = await fetch(`${UPSTREAM}${path}${url.search}`, {
    headers: { Accept: 'application/json' }
  })
  const body = await upstream.arrayBuffer()
  return new Response(body, {
    status: upstream.status,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store, max-age=0',
      'Content-Type': upstream.headers.get('Content-Type') || 'application/json; charset=utf-8'
    }
  })
}
