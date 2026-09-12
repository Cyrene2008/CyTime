import { fetchJson } from './desktop'

export const timeSourceOptions = [
  { value: 'auto', label: '自动（根据网络选择）' },
  { value: 'cytime', label: 'CyTime API' },
  { value: 'worldtimeapi', label: 'WorldTimeAPI' },
  { value: 'timeapi', label: 'TimeAPI.io' },
  { value: 'system', label: '系统时间（不同步）' }
]

const remoteSources = {
  cytime: async signal => {
    const data = await fetchJson('https://time.cyrene.hk/api/v1/time', signal)
    const value = Number(data?.timestamp)
    if (!Number.isFinite(value)) throw new Error('CyTime 时间服务未返回时间戳')
    return value
  },
  worldtimeapi: async signal => {
    const data = await fetchJson('https://worldtimeapi.org/api/timezone/Etc/UTC', signal)
    const value = Number(data?.unixtime)
    if (!Number.isFinite(value)) throw new Error('WorldTimeAPI 未返回时间')
    return value * 1000
  },
  timeapi: async signal => {
    const data = await fetchJson('https://timeapi.io/api/Time/current/zone?timeZone=UTC', signal)
    const value = Date.parse(data?.dateTime)
    if (!Number.isFinite(value)) throw new Error('TimeAPI 未返回时间')
    return value
  }
}

export async function fetchNetworkTime(source = 'auto', signal) {
  if (source === 'system') return Date.now()
  if (source === 'auto') {
    let lastError
    for (const key of ['cytime', 'worldtimeapi', 'timeapi']) {
      try { return await remoteSources[key](signal) } catch (error) { lastError = error }
    }
    throw lastError || new Error('没有可用的时间源')
  }
  const resolver = remoteSources[source]
  if (!resolver) throw new Error('未知的时间源')
  return resolver(signal)
}
