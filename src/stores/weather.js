import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { fetchXiaomiWeather, weatherLabel } from '../services/weather'

const CACHE_KEY = 'cytime.weather-cache.v1'

export const useWeatherStore = defineStore('weather', () => {
  const data = ref(null)
  const loading = ref(false)
  const error = ref('')
  const updatedAt = ref(0)
  const current = computed(() => data.value?.current || null)
  const forecast = computed(() => data.value?.forecastDaily || null)
  const currentLabel = computed(() => weatherLabel(current.value?.weather))

  function readCache(cityNum) {
    try {
      const cached = JSON.parse(localStorage.getItem(`${CACHE_KEY}:${cityNum}`) || 'null')
      if (cached?.data) {
        data.value = cached.data
        updatedAt.value = cached.updatedAt || 0
      }
    } catch {}
  }

  async function refresh(cityNum = '101010100', force = false) {
    readCache(cityNum)
    if (!force && updatedAt.value && Date.now() - updatedAt.value < 10 * 60 * 1000) return
    loading.value = true
    error.value = ''
    try {
      const next = await fetchXiaomiWeather(cityNum)
      data.value = next
      updatedAt.value = Date.now()
      localStorage.setItem(`${CACHE_KEY}:${cityNum}`, JSON.stringify({ data: next, updatedAt: updatedAt.value }))
    } catch {
      error.value = data.value ? '天气数据已过期' : '天气暂不可用'
    } finally {
      loading.value = false
    }
  }

  return { data, loading, error, updatedAt, current, forecast, currentLabel, refresh }
})
