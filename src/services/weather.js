import { fetchJson, isDesktop } from './desktop'

const WEATHER_ROOT = isDesktop() ? 'https://weatherapi.market.xiaomi.com/wtr-v3' : '/api/xiaomi-weather/wtr-v3'
const WEATHER_URL = `${WEATHER_ROOT}/weather/all`
const APP_KEY = 'weather20151024'
const SIGN = 'zUFJoAR2ZVrDy1vF3D07'

export async function fetchXiaomiWeather(cityNum = '101010100', signal) {
  const params = new URLSearchParams({
    latitude: '0',
    longitude: '0',
    locationKey: `weathercn:${cityNum}`,
    appKey: APP_KEY,
    sign: SIGN,
    isGlobal: 'false',
    locale: 'zh_cn',
    days: '5'
  })
  return fetchJson(`${WEATHER_URL}?${params}`, signal)
}

export async function searchXiaomiCities(query, signal) {
  const value = String(query || '').trim()
  if (!value) return []
  const params = new URLSearchParams({ name: value, appKey: APP_KEY, sign: SIGN, isGlobal: 'false', locale: 'zh_cn' })
  const data = await fetchJson(`${WEATHER_ROOT}/location/city/search?${params}`, signal)
  const results = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : Array.isArray(data?.cities) ? data.cities : []
  return results.map(item => ({
    name: item.name || '',
    affiliation: item.affiliation || '',
    locationKey: item.locationKey || item.key || ''
  })).filter(item => item.name && item.locationKey)
}

export function weatherLabel(code) {
  const labels = {
    0: '晴', 1: '多云', 2: '阴', 3: '阵雨', 4: '雷阵雨', 5: '雷阵雨伴冰雹',
    6: '雨夹雪', 7: '小雨', 8: '中雨', 9: '大雨', 10: '暴雨', 11: '大暴雨',
    12: '特大暴雨', 13: '阵雪', 14: '小雪', 15: '中雪', 16: '大雪', 17: '暴雪',
    18: '雾', 19: '冻雨', 20: '沙尘暴', 21: '小到中雨', 22: '中到大雨',
    23: '大到暴雨', 24: '暴雨到大暴雨', 25: '大暴雨到特大暴雨', 26: '小到中雪',
    27: '中到大雪', 28: '大到暴雪', 29: '浮尘', 30: '扬沙', 31: '强沙尘暴', 32: '霾'
  }
  return labels[Number(code)] || '天气未知'
}
