import { reactive, watch } from 'vue'
import { defineStore } from 'pinia'
import { persistDesktopValue } from '../services/desktop'
import quoteData from '../data/quotes.jsonc'

const STORAGE_KEY = 'cytime.content.v1'

const { dailyQuotes, flameJourneyQuotes, quoteMetadata, universityMottos } = quoteData

const defaultContent = {
  importantDays: [
    { id: 'gaokao-2027', name: '2027 高考', date: '2027-06-07', recurring: false }
  ],
  quotes: [...dailyQuotes],
  quoteMetadata: { ...quoteMetadata },
  flameJourneyQuotes: [...flameJourneyQuotes],
  universityMottos: [...universityMottos],
  schedule: [],
  homework: []
}

function readContent() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    const universityMottos = defaultContent.universityMottos
    return {
      importantDays: Array.isArray(saved.importantDays) ? saved.importantDays : [...defaultContent.importantDays],
      quotes: Array.isArray(saved.quotes) && saved.quotes.length ? saved.quotes : [...defaultContent.quotes],
      quoteMetadata: { ...defaultContent.quoteMetadata, ...(saved.quoteMetadata && typeof saved.quoteMetadata === 'object' ? saved.quoteMetadata : {}) },
      flameJourneyQuotes: Array.isArray(saved.flameJourneyQuotes) && saved.flameJourneyQuotes.length ? saved.flameJourneyQuotes : [...defaultContent.flameJourneyQuotes],
      universityMottos,
      schedule: Array.isArray(saved.schedule) ? saved.schedule : [],
      homework: Array.isArray(saved.homework) ? saved.homework : []
    }
  } catch {
    return structuredClone(defaultContent)
  }
}

const id = prefix => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

export const useContentStore = defineStore('content', () => {
  const content = reactive(readContent())

  function persist() { localStorage.setItem(STORAGE_KEY, JSON.stringify(content)); persistDesktopValue(STORAGE_KEY, content).catch(() => {}) }
  function addImportantDay(name, date, recurring = false) {
    if (!name || !date) return
    content.importantDays.push({ id: id('day'), name, date, recurring })
    persist()
  }
  function removeImportantDay(item) {
    content.importantDays = content.importantDays.filter(day => day.id !== item.id)
    persist()
  }
  function addQuote(value, metadata = {}) {
    const quote = String(typeof value === 'object' ? value?.text : value || '').trim()
    if (!quote || content.quotes.includes(quote)) return
    content.quotes.push(quote)
    if (metadata.author || metadata.work) content.quoteMetadata[quote] = { author: metadata.author || '', work: metadata.work || '' }
    persist()
  }
  function addQuotes(values) {
    values.filter(Boolean).forEach(value => {
      const quote = typeof value === 'object' ? String(value.text || '').trim() : String(value).trim()
      if (!quote || content.quotes.includes(quote)) return
      content.quotes.push(quote)
      if (value.author || value.work) content.quoteMetadata[quote] = { author: value.author || '', work: value.work || '' }
    })
    persist()
  }
  function removeQuote(quote) {
    if (content.quotes.length <= 1) return
    content.quotes = content.quotes.filter(item => item !== quote)
    delete content.quoteMetadata[quote]
    persist()
  }
  function addLesson(lesson) {
    content.schedule.push({ id: id('lesson'), ...lesson })
    persist()
  }
  function updateLesson(lesson, patch) {
    Object.assign(lesson, patch)
    persist()
  }
  function removeLesson(lesson) {
    content.schedule = content.schedule.filter(item => item.id !== lesson.id)
    persist()
  }
  function addHomework(item) {
    if (!item.content?.trim()) return
    content.homework.push({ id: id('homework'), subject: item.subject || '其他', content: item.content.trim(), dueAt: item.dueAt || '', completed: false, createdAt: Date.now() })
    persist()
  }
  function updateHomework(item, patch) {
    if (!patch.content?.trim()) return
    Object.assign(item, { subject: patch.subject || '其他', content: patch.content.trim() })
    persist()
  }
  function removeHomework(item) {
    content.homework = content.homework.filter(entry => entry.id !== item.id)
    persist()
  }

  watch(content, persist, { deep: true })
  return { content, addImportantDay, removeImportantDay, addQuote, addQuotes, removeQuote, addLesson, updateLesson, removeLesson, addHomework, updateHomework, removeHomework }
})
