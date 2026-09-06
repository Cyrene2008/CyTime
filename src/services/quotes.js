export const quoteSourceOptions = {
  hitokoto: { label: '一言', language: '中文', description: '综合短句与名人语录', url: 'https://v1.hitokoto.cn/?encode=json' },
  jinrishici: { label: '今日诗词', language: '中文', description: '古诗词与作者出处', url: 'https://v1.jinrishici.com/all.json' },
  poetry: { label: '诗泉', language: '中文', description: '随机古诗词与朝代作者', url: 'https://poetry.palemoky.com/api/poems/random?lang=zh-Hans' },
  vvhan: { label: 'VVHAN 智慧语录', language: '中文', description: '励志与学习短句', url: 'https://api.vvhan.com/api/wisdom?type=json' },
  xygeng: { label: '一言一语', language: '中文', description: '随机语录与作品信息', url: 'https://api.xygeng.cn/one' },
  adviceSlip: { label: 'Advice Slip', language: 'English', description: '英文建议与生活提示', url: 'https://api.adviceslip.com/advice' }
}

const BLOCKED_TERMS = ['色情', '赌博', '毒品', '暴力恐怖']

export async function fetchCloudQuote(source = 'hitokoto', signal) {
  const sourceConfig = quoteSourceOptions[source] || quoteSourceOptions.hitokoto
  const data = await fetchJson(sourceConfig.url, signal)
  const payload = data?.data && typeof data.data === 'object' ? data.data : data
  const quote = String(payload.hitokoto || payload.content || payload.quote || payload.text || payload.advice || payload.slip?.advice || payload.poem || '').trim()
  if (!quote) throw new Error('Empty quote response')
  if (BLOCKED_TERMS.some(term => quote.includes(term))) throw new Error('Unsafe quote response')
  return {
    text: quote,
    author: String(payload.from_who || payload.author || payload.creator || '').trim(),
    work: String(payload.origin || payload.from || payload.book || payload.title || '').trim(),
    source,
    sourceName: sourceConfig.label
  }
}

export async function readQuoteFile(file) {
  const text = await file.text()
  if (file.name.toLowerCase().endsWith('.json')) {
    const data = JSON.parse(text)
    const values = Array.isArray(data) ? data : data.quotes
    return (Array.isArray(values) ? values : []).map(item => {
      if (typeof item === 'string') return { text: item }
      return { text: item?.text, author: item?.author || item?.from_who, work: item?.work || item?.origin || item?.from }
    }).filter(item => item.text).map(item => ({ ...item, text: String(item.text).trim() }))
  }
  return text.split(/\r?\n/).map(item => item.trim()).filter(Boolean).map(item => ({ text: item }))
}
import { fetchJson } from './desktop'
