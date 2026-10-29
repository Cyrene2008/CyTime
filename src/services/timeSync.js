import { fetchJson } from './desktop.js'

export const timeSourceOptions = [
  { value: 'auto', label: '自动选择' },
  { value: 'cytime', label: '昔时源' },
  { value: 'worldtimeapi', label: 'WorldTimeAPI' },
  { value: 'timeapi', label: 'TimeAPI' },
  { value: 'system', label: '电脑时间' }
]

const remoteSources = {
  cytime: async signal => {
    const data = await fetchJson('https://time.cyrene.hk/api/v1/time', signal)
    const value = Number(data?.timestamp)
    if (!Number.isFinite(value) || value <= 0) throw new Error('时间来源暂不可用')
    return value
  },
  worldtimeapi: async signal => {
    const data = await fetchJson('https://worldtimeapi.org/api/timezone/Etc/UTC', signal)
    const value = Number(data?.unixtime)
    if (!Number.isFinite(value) || value <= 0) throw new Error('时间来源暂不可用')
    return value * 1000
  },
  timeapi: async signal => {
    const data = await fetchJson('https://timeapi.io/api/Time/current/zone?timeZone=UTC', signal)
    const value = parseUtcDateTime(data?.dateTime)
    if (!Number.isFinite(value)) throw new Error('TimeAPI 未返回时间')
    return value
  }
}

export function parseUtcDateTime(value) {
  if (typeof value !== 'string' || !value.trim()) return NaN
  const text = value.trim()
  return Date.parse(/(?:z|[+-]\d{2}:?\d{2})$/i.test(text) ? text : `${text}Z`)
}

export async function fetchNetworkTime(source = 'auto', signal) {
  if (source === 'system') return Date.now()
  if (source === 'auto') {
    let lastError
    for (const key of ['cytime', 'worldtimeapi', 'timeapi']) {
      try { return await remoteSources[key](signal) } catch (error) { if (signal?.aborted || error?.name === 'AbortError') throw error; lastError = error }
    }
    throw lastError || new Error('没有可用的时间源')
  }
  const resolver = remoteSources[source]
  if (!resolver) throw new Error('未知的时间源')
  return resolver(signal)
}
