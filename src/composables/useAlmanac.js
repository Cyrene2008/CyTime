import { ref, watch } from 'vue'

let lunarModule = null
const cache = new Map()

function loadLunar() {
  if (!lunarModule) lunarModule = import('lunar-javascript')
  return lunarModule
}

function buildAlmanac(Solar, date) {
  const lunar = Solar.fromDate(date).getLunar()
  const yi = (lunar.getDayYi() || []).filter(Boolean)
  const ji = (lunar.getDayJi() || []).filter(Boolean)
  const festivals = [...lunar.getFestivals(), ...lunar.getOtherFestivals()].filter(Boolean)
  return {
    lunarText: `农历${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}`,
    festival: festivals[0] || lunar.getJieQi() || '',
    ganZhi: `${lunar.getYearInGanZhi()}年 ${lunar.getYearShengXiao()}`,
    yi,
    ji
  }
}

export function useAlmanac(getDate) {
  const almanac = ref(null)
  let disposed = false

  watch(() => getDate().toDateString(), async () => {
    const date = getDate()
    const key = date.toDateString()
    if (cache.has(key)) {
      almanac.value = cache.get(key)
      return
    }
    try {
      const { Solar } = await loadLunar()
      const value = buildAlmanac(Solar, date)
      if (cache.size > 16) cache.clear()
      cache.set(key, value)
      if (!disposed) almanac.value = value
    } catch {
      if (!disposed) almanac.value = null
    }
  }, { immediate: true })

  return { almanac, dispose: () => { disposed = true } }
}
