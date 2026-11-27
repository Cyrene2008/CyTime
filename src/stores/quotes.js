import { onScopeDispose, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { useContentStore } from './content'
import { useSettingsStore } from './settings'
import { fetchCloudQuote } from '../services/quotes'

export const useQuotesStore = defineStore('quotes', () => {
  const contentStore = useContentStore()
  const settingsStore = useSettingsStore()
  const current = ref('')
  const source = ref('local')
  const metadata = ref({ source: 'local', sourceName: '本地语录', author: '', work: '' })
  let rotationTimer
  let requestController
  let generation = 0
  let started = false
  const weight = value => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0

  function resolveApiCategories(settings) {
    const selected = Array.isArray(settings.quoteApiCategories) ? settings.quoteApiCategories.filter(Boolean) : []
    if (!settings.quoteApiCategoryWeightsEnabled || selected.length < 2) return selected
    const weights = selected.map(category => weight(settings.quoteApiCategoryWeights?.[category] ?? 1))
    const total = weights.reduce((sum, weight) => sum + weight, 0)
    if (!total) return selected
    let target = Math.random() * total
    for (let index = 0; index < selected.length; index += 1) {
      target -= weights[index]
      if (target < 0) return [selected[index]]
    }
    return [selected[selected.length - 1]]
  }

  async function refresh() {
    const request = ++generation
    requestController?.abort()
    const controller = new AbortController()
    requestController = controller
    const settings = settingsStore.settings
    const localSources = [
      { id: 'daily', name: '日常励志', quotes: contentStore.content.quotes, weight: settings.quoteLocalSources?.daily?.weight ?? settings.quoteLocalWeight, enabled: settings.quoteLocalSources?.daily?.enabled ?? true },
      { id: 'flameJourney', name: '逐火篇章', quotes: contentStore.content.flameJourneyQuotes, weight: settings.quoteLocalSources?.flameJourney?.weight ?? 2, enabled: settings.quoteLocalSources?.flameJourney?.enabled ?? true },
      { id: 'university', name: '大学校训', quotes: contentStore.content.universityMottos, weight: settings.quoteLocalSources?.university?.weight ?? 2, enabled: settings.quoteLocalSources?.university?.enabled ?? true }
    ].filter(item => item.enabled && item.quotes.length && weight(item.weight) > 0)
    const localWeight = localSources.reduce((sum, item) => sum + weight(item.weight), 0)
    const cloudWeight = settings.quoteCloudEnabled ? weight(settings.quoteCloudWeight) : 0
    const useCloud = cloudWeight > 0 && Math.random() * (localWeight + cloudWeight) >= localWeight
    if (useCloud) {
      const apiCategories = resolveApiCategories(settings)
      try {
        const result = await fetchCloudQuote(controller.signal, apiCategories, settings.quoteApiEndpoint)
        if (request !== generation || controller.signal.aborted) return
        current.value = result.text
        source.value = 'cloud'
        metadata.value = { source: 'cloud', sourceName: result.sourceName, author: result.author, work: result.work }
        return
      } catch (error) {
        if (request !== generation || controller.signal.aborted || error?.name === 'AbortError') return
      }
    }
    if (request !== generation || controller.signal.aborted) return
    if (localSources.length) {
      const totalWeight = localSources.reduce((sum, item) => sum + weight(item.weight), 0)
      let target = Math.random() * totalWeight
      const selected = localSources.find(item => (target -= weight(item.weight)) < 0) || localSources[0]
      const normalize = quote => typeof quote === 'string' ? { text: quote, work: '' } : quote
      const choices = selected.quotes.map(normalize).filter(quote => quote.text !== current.value)
      const next = (choices.length ? choices : selected.quotes.map(normalize))[Math.floor(Math.random() * (choices.length || selected.quotes.length))]
      current.value = next.text
      source.value = selected.id
      const savedMeta = contentStore.content.quoteMetadata?.[next.text] || {}
      const localMetadata = selected.id === 'daily'
        ? savedMeta
        : selected.id === 'flameJourney'
          ? { author: savedMeta.author || '德谬歌', work: savedMeta.work || 'HSR' }
          : { work: next.work || savedMeta.work || '' }
      metadata.value = { source: selected.id, sourceName: selected.name, author: localMetadata.author || '', work: localMetadata.work || '' }
    }
  }

  function start() {
    if (started) return
    started = true
    refresh()
    if (settingsStore.settings.quoteRotation) rotationTimer = window.setInterval(refresh, Math.max(30, Number(settingsStore.settings.quoteInterval) || 600) * 1000)
  }

  function stop() {
    started = false
    generation++
    window.clearInterval(rotationTimer)
    rotationTimer = undefined
    requestController?.abort()
  }

  watch(() => [settingsStore.settings.quoteRotation, settingsStore.settings.quoteInterval, settingsStore.settings.quoteCloudEnabled, settingsStore.settings.quoteCloudWeight, settingsStore.settings.quoteLocalSources, settingsStore.settings.quoteApiCategories, settingsStore.settings.quoteApiCategoryWeights, settingsStore.settings.quoteApiCategoryWeightsEnabled, settingsStore.settings.quoteApiEndpoint], () => {
    if (!started) return
    stop()
    start()
  }, { deep: true })

  onScopeDispose(stop)
  return { current, source, metadata, refresh, start, stop }
})
