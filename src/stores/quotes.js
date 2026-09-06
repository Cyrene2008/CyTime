import { ref, watch } from 'vue'
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

  async function refresh() {
    const settings = settingsStore.settings
    const localSources = [
      { id: 'daily', name: '日常励志', quotes: contentStore.content.quotes, weight: settings.quoteLocalSources?.daily?.weight ?? settings.quoteLocalWeight, enabled: settings.quoteLocalSources?.daily?.enabled ?? true },
      { id: 'flameJourney', name: '逐火篇章', quotes: contentStore.content.flameJourneyQuotes, weight: settings.quoteLocalSources?.flameJourney?.weight ?? 2, enabled: settings.quoteLocalSources?.flameJourney?.enabled ?? true },
      { id: 'university', name: '大学校训', quotes: contentStore.content.universityMottos, weight: settings.quoteLocalSources?.university?.weight ?? 2, enabled: settings.quoteLocalSources?.university?.enabled ?? true }
    ].filter(item => item.enabled && item.quotes.length && Number(item.weight) > 0)
    const localWeight = localSources.reduce((sum, item) => sum + Number(item.weight), 0)
    const sources = Object.entries(settings.quoteSources || {}).filter(([, option]) => option?.enabled && Number(option.weight) > 0)
    const cloudWeight = settings.quoteCloudEnabled ? Math.max(0, Number(settings.quoteCloudWeight) || 0) : 0
    const useCloud = sources.length > 0 && cloudWeight > 0 && Math.random() * (localWeight + cloudWeight) >= localWeight
    if (useCloud) {
      requestController?.abort()
      requestController = new AbortController()
      const available = [...sources]
      const totalWeight = available.reduce((sum, [, option]) => sum + Math.max(0, Number(option.weight) || 0), 0)
      let target = Math.random() * totalWeight
      const selected = available.find(([, option]) => (target -= Math.max(0, Number(option.weight) || 0)) < 0)?.[0]
      const ordered = [selected, ...available.map(([id]) => id).filter(id => id !== selected)]
      for (const sourceId of ordered) {
        try {
          const result = await fetchCloudQuote(sourceId, requestController.signal)
          current.value = result.text
          source.value = 'cloud'
          metadata.value = { source: 'cloud', sourceName: result.sourceName, author: result.author, work: result.work }
          return
        } catch (error) {
          if (error?.name === 'AbortError') return
        }
      }
    }
    if (localSources.length) {
      const totalWeight = localSources.reduce((sum, item) => sum + Number(item.weight), 0)
      let target = Math.random() * totalWeight
      const selected = localSources.find(item => (target -= Number(item.weight)) < 0) || localSources[0]
      const normalize = quote => typeof quote === 'string' ? { text: quote, work: '' } : quote
      const choices = selected.quotes.map(normalize).filter(quote => quote.text !== current.value)
      const next = (choices.length ? choices : selected.quotes.map(normalize))[Math.floor(Math.random() * (choices.length || selected.quotes.length))]
      current.value = next.text
      source.value = selected.id
      const localMetadata = selected.id === 'daily' ? contentStore.content.quoteMetadata?.[next.text] || {} : { work: next.work || '' }
      metadata.value = { source: selected.id, sourceName: selected.name, author: localMetadata.author || '', work: localMetadata.work || '' }
    }
  }

  function start() {
    if (rotationTimer) return
    refresh()
    if (settingsStore.settings.quoteRotation) rotationTimer = window.setInterval(refresh, Math.max(30, Number(settingsStore.settings.quoteInterval) || 600) * 1000)
  }

  function stop() {
    window.clearInterval(rotationTimer)
    rotationTimer = undefined
    requestController?.abort()
  }

  watch(() => [settingsStore.settings.quoteRotation, settingsStore.settings.quoteInterval, settingsStore.settings.quoteCloudEnabled, settingsStore.settings.quoteLocalSources, settingsStore.settings.quoteSources], () => {
    if (!rotationTimer && !settingsStore.settings.quoteRotation) return
    stop()
    start()
  }, { deep: true })

  return { current, source, metadata, refresh, start, stop }
})
