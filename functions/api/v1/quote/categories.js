// 该文件由 scripts/sync-quote-data.mjs 自动生成，请勿手动修改。
// 语录内容请编辑 api/data/quotes.jsonc，然后运行 bun run sync:quotes 或 bun run build。
const categories = ["崩铁","幽默解压","名人名言","人民日报"]

const DOCS_URL = 'https://quote.cyrene.hk/'

function landing() {
  return new Response(null, {
    status: 302,
    headers: {
      Location: DOCS_URL,
      'Cache-Control': 'no-store, max-age=0'
    }
  })
}

export async function onRequest(context) {
  if (context.request.method !== 'GET') return landing()
  return new Response(JSON.stringify({ categories }), {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store, max-age=0',
      'Content-Type': 'application/json; charset=utf-8'
    }
  })
}
