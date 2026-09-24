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
  homework: [],
  homeworkHistory: []
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
      homework: Array.isArray(saved.homework) ? saved.homework : [],
      homeworkHistory: Array.isArray(saved.homeworkHistory) ? saved.homeworkHistory : []
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
  function removeQuotes(values) {
    const removing = new Set(values)
    const remaining = content.quotes.filter(item => !removing.has(item))
    if (!remaining.length) return
    content.quotes = remaining
    removing.forEach(value => delete content.quoteMetadata[value])
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
    content.homework.push({ id: id('homework'), subject: item.subject || '其他', content: item.content.trim(), startAt: item.startAt || '', dueAt: item.dueAt || '', completed: false, createdAt: Date.now() })
    persist()
  }
  function updateHomework(item, patch) {
    if (!patch.content?.trim()) return
    Object.assign(item, { subject: patch.subject || '其他', content: patch.content.trim(), startAt: patch.startAt ?? item.startAt ?? '', dueAt: patch.dueAt ?? item.dueAt ?? '' })
    persist()
  }
  function removeHomework(item, { toHistory = false, reason = 'manual' } = {}) {
    if (toHistory) addToHistory(item, reason)
    content.homework = content.homework.filter(entry => entry.id !== item.id)
    persist()
  }
  function addToHistory(item, reason = 'auto') {
    content.homeworkHistory.push({
      id: id('hw-hist'), subject: item.subject, content: item.content,
      startAt: item.startAt || '', dueAt: item.dueAt || '',
      completed: item.completed, createdAt: item.createdAt,
      removedAt: Date.now(), reason
    })
    persist()
  }
  function stampMs(value) {
    const [date = '', time = '00:00'] = String(value || '').split('T')
    const [y, mo, d] = date.split('-').map(Number)
    const [h = 0, mi = 0] = time.split(':').map(Number)
    if (!y || !mo || !d) return NaN
    return new Date(y, mo - 1, d, h, mi).getTime()
  }
  function archivePastHomework() {
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const past = content.homework.filter(item => {
      if (!item.dueAt) return false
      const ms = stampMs(item.dueAt)
      return Number.isFinite(ms) && ms < todayStart.getTime()
    })
    if (!past.length) return
    past.forEach(item => addToHistory(item, 'auto'))
    const ids = new Set(past.map(e => e.id))
    content.homework = content.homework.filter(item => !ids.has(item.id))
    persist()
  }
  function clearHomeworkHistory() { content.homeworkHistory = []; persist() }
  function restoreHomework(historyItem) {
    if (!historyItem?.content?.trim()) return
    content.homework.push({
      id: id('homework'),
      subject: historyItem.subject || '其他',
      content: String(historyItem.content).trim(),
      startAt: historyItem.startAt || '',
      dueAt: historyItem.dueAt || '',
      completed: Boolean(historyItem.completed),
      createdAt: Date.now()
    })
    content.homeworkHistory = content.homeworkHistory.filter(entry => entry.id !== historyItem.id)
    persist()
  }
  function removeHistoryItems(ids) {
    const removing = new Set(ids)
    if (!removing.size) return
    content.homeworkHistory = content.homeworkHistory.filter(entry => !removing.has(entry.id))
    persist()
  }

  watch(content, persist, { deep: true })
  return { content, addImportantDay, removeImportantDay, addQuote, addQuotes, removeQuote, removeQuotes, addLesson, updateLesson, removeLesson, addHomework, updateHomework, removeHomework, archivePastHomework, clearHomeworkHistory, restoreHomework, removeHistoryItems }
})
