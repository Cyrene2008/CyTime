// 该文件由 scripts/sync-quote-data.mjs 自动生成，请勿手动修改。
// 语录内容请编辑 api/data/quotes.jsonc，然后运行 bun run sync:quotes 或 bun run build。
const categories = ["崩铁","幽默解压","名人名言","人民日报"]

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Accept, Content-Type',
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'public, max-age=300'
}
function respond(request, body, status = 200) {
  return new Response(request.method === 'HEAD' ? null : JSON.stringify(body), { status, headers })
}
function checkMethod(request) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
  if (!['GET', 'HEAD'].includes(request.method)) return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405, headers: { ...headers, Allow: 'GET, HEAD, OPTIONS' } })
  return null
}

export async function onRequest(context) {
  const methodResponse = checkMethod(context.request)
  return methodResponse || respond(context.request, { categories })
}
