// 该文件由 scripts/sync-quote-data.mjs 自动生成，请勿手动修改。
// 语录内容请编辑 api/data/quotes.jsonc，然后运行 bun run sync:quotes 或 bun run build。
import { guardQuoteRequest } from '../../../../server/quoteAccess.js'

const categories = ["崩铁","幽默解压","名人名言","人民日报"]
export const onRequest = guardQuoteRequest((request, respond) => respond({ categories }))
