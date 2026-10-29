import { computed, onScopeDispose, ref } from 'vue'
import { defineStore } from 'pinia'
import { fetchXiaomiWeather, weatherLabel } from '../services/weather.js'

const CACHE_KEY = 'cytime.weather-cache.v1'

export const useWeatherStore = defineStore('weather', () => {
  const data = ref(null)
  const loading = ref(false)
  const error = ref('')
  const updatedAt = ref(0)
  let city = ''
  let pending = null
  let controller = null
  let generation = 0
  const current = computed(() => data.value?.current || null)
  const forecast = computed(() => data.value?.forecastDaily || null)
  const currentLabel = computed(() => weatherLabel(current.value?.weather))

  function readCache(cityNum) {
    try {
      const cached = JSON.parse(localStorage.getItem(`${CACHE_KEY}:${cityNum}`) || 'null')
      if (cached?.data) {
        data.value = cached.data
        const timestamp = Number(cached.updatedAt)
        updatedAt.value = Number.isFinite(timestamp) && timestamp > 0 && timestamp <= Date.now() ? timestamp : 0
      }
    } catch {}
  }

  function refresh(cityNum = '101010100', force = false) {
    const nextCity = String(cityNum || '').trim()
    if (!/^\d+$/.test(nextCity)) return Promise.resolve(null)
    if (city === nextCity && pending) return pending
    if (city !== nextCity) {
      controller?.abort()
      generation++
      pending = null
      loading.value = false
      error.value = ''
      city = nextCity
      data.value = null
      updatedAt.value = 0
      readCache(nextCity)
    }
    if (!force && updatedAt.value && Date.now() - updatedAt.value < 10 * 60 * 1000) return Promise.resolve(data.value)
    const request = ++generation
    controller?.abort()
    const signal = new AbortController()
    controller = signal
    loading.value = true
    error.value = ''
    pending = (async () => {
      try {
        const next = await fetchXiaomiWeather(nextCity, signal.signal)
        if (request !== generation || signal.signal.aborted) return null
        data.value = next
        updatedAt.value = Date.now()
        localStorage.setItem(`${CACHE_KEY}:${nextCity}`, JSON.stringify({ data: next, updatedAt: updatedAt.value }))
        return next
      } catch (failure) {
        if (request === generation && failure?.name !== 'AbortError') error.value = data.value ? '天气暂未更新' : '天气暂不可用'
        return null
      } finally {
        if (request === generation) { loading.value = false; pending = null }
      }
    })()
    return pending
  }

  onScopeDispose(() => { generation++; controller?.abort() })

  return { data, loading, error, updatedAt, current, forecast, currentLabel, refresh }
})
