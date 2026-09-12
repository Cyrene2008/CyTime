// 该文件由 scripts/sync-quote-data.mjs 自动生成，请勿手动修改。
// 语录内容请编辑 api/data/quotes.jsonc 后运行 bun run sync:quotes 或 bun run build。
const categories = ["崩铁","名人名言","原神","学习","校园"]

export async function onRequest() {
  return new Response(JSON.stringify({ categories }), {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store, max-age=0',
      'Content-Type': 'application/json; charset=utf-8'
    }
  })
}
