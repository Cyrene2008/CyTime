import { reactive, watch } from 'vue'
import { defineStore } from 'pinia'
import { persistDesktopValue } from '../services/desktop'
import { localDateStr, countOccurrences } from '../services/duty'
import { sortMembersPinyin } from '../utils/dutyRoster'
import quoteData from '../data/quotes.jsonc'

const STORAGE_KEY = 'cytime.content.v1'

const { dailyQuotes, flameJourneyQuotes, quoteMetadata, universityMottos } = quoteData

const defaultDuty = () => ({
  members: [],
  rosters: [],
  schoolDays: [],
  overrides: {},
  anchors: {},
  skipWeekends: false,
  holidays: []
})

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
  homeworkHistory: [],
  duty: defaultDuty()
}

function normalizeDuty(saved) {
  const duty = { ...defaultDuty(), ...(saved && typeof saved === 'object' ? saved : {}) }
  if (!Array.isArray(duty.members)) duty.members = []
  if (!Array.isArray(duty.rosters)) duty.rosters = []
  if (!Array.isArray(duty.schoolDays)) duty.schoolDays = []
  if (!duty.overrides || typeof duty.overrides !== 'object') duty.overrides = {}
  if (!duty.anchors || typeof duty.anchors !== 'object') duty.anchors = {}
  if (!Array.isArray(duty.holidays)) duty.holidays = []
  return duty
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
      homeworkHistory: Array.isArray(saved.homeworkHistory) ? saved.homeworkHistory : [],
      duty: normalizeDuty(saved.duty)
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

  function recordSchoolDay(dateStr = localDateStr()) {
    if (!dateStr || content.duty.schoolDays.includes(dateStr)) return false
    content.duty.schoolDays.push(dateStr)
    content.duty.schoolDays.sort()
    persist()
    return true
  }
  function updateDuty(patch) {
    Object.assign(content.duty, patch)
    persist()
  }
  function sortMembers() {
    content.duty.members = sortMembersPinyin(content.duty.members)
  }
  function addMember(member) {
    const name = String(member?.name || '').trim()
    if (!name) return null
    const entry = {
      id: id('member'),
      name,
      enName: String(member.enName || '').trim(),
      gender: member.gender === 'female' ? 'female' : member.gender === 'male' ? 'male' : ''
    }
    content.duty.members.push(entry)
    sortMembers()
    persist()
    return entry
  }
  function updateMember(member, patch) {
    if (patch.name !== undefined) member.name = String(patch.name).trim() || member.name
    if (patch.enName !== undefined) member.enName = String(patch.enName).trim()
    if (patch.gender !== undefined) member.gender = patch.gender
    sortMembers()
    persist()
  }
  function removeMember(member) {
    content.duty.members = content.duty.members.filter(item => item.id !== member.id)
    content.duty.rosters.forEach(roster => {
      roster.memberIds = (roster.memberIds || []).filter(memberId => memberId !== member.id)
      ;(roster.chores || []).forEach(chore => { if (chore.queue) chore.queue = chore.queue.filter(memberId => memberId !== member.id) })
    })
    persist()
  }
  function importMembers(list) {
    let added = 0
    const existing = new Set(content.duty.members.map(member => member.name))
    for (const item of list || []) {
      const name = String(item?.name || '').trim()
      if (!name || existing.has(name)) continue
      existing.add(name)
      content.duty.members.push({
        id: id('member'),
        name,
        enName: String(item.enName || '').trim(),
        gender: item.gender === 'female' ? 'female' : item.gender === 'male' ? 'male' : ''
      })
      added++
    }
    if (added) sortMembers()
    persist()
    return added
  }
  function addRoster(name) {
    const roster = { id: id('roster'), name: String(name || '').trim() || '新名单', enabled: true, weekdays: [], memberIds: [], chores: [], offset: 0 }
    content.duty.rosters.push(roster)
    persist()
    return roster
  }
  function updateRoster(roster, patch) {
    Object.assign(roster, patch)
    persist()
  }
  function removeRoster(roster) {
    content.duty.rosters = content.duty.rosters.filter(item => item.id !== roster.id)
    Object.keys(content.duty.overrides).forEach(date => {
      if (content.duty.overrides[date]) delete content.duty.overrides[date][roster.id]
    })
    delete content.duty.anchors[roster.id]
    persist()
  }
  function addChore(roster, chore) {
    const entry = {
      id: id('chore'),
      name: String(chore?.name || '').trim() || '新任务',
      slots: Math.max(1, Number(chore?.slots) || 1),
      genderRule: ['no-female', 'no-male'].includes(chore?.genderRule) ? chore.genderRule : 'any',
      phase: Number(chore?.phase) || 0,
      noRepeat: chore?.noRepeat !== false,
      queue: Array.isArray(chore?.queue) ? [...chore.queue] : []
    }
    roster.chores.push(entry)
    persist()
    return entry
  }
  function updateChore(chore, patch) {
    Object.assign(chore, patch)
    persist()
  }
  function removeChore(roster, chore) {
    roster.chores = roster.chores.filter(item => item.id !== chore.id)
    Object.keys(content.duty.overrides).forEach(date => {
      const byRoster = content.duty.overrides[date]
      if (byRoster?.[roster.id]) byRoster[roster.id] = byRoster[roster.id].filter(entry => entry.choreId !== chore.id)
    })
    persist()
  }
  function setOverride(dateStr, rosterId, entries) {
    if (!dateStr || !rosterId) return
    if (!content.duty.overrides[dateStr]) content.duty.overrides[dateStr] = {}
    content.duty.overrides[dateStr][rosterId] = entries
    persist()
  }
  function clearOverride(dateStr, rosterId) {
    const byRoster = content.duty.overrides[dateStr]
    if (!byRoster) return
    delete byRoster[rosterId]
    if (!Object.keys(byRoster).length) delete content.duty.overrides[dateStr]
    persist()
  }
  function setRosterOffset(roster, delta) {
    roster.offset = Number(roster.offset || 0) + delta
    persist()
  }
  function setRosterAnchor(roster, dateStr, index) {
    if (!dateStr) return
    if (!content.duty.anchors[roster.id]) content.duty.anchors[roster.id] = {}
    content.duty.anchors[roster.id][dateStr] = Math.max(0, Number(index) || 0)
    persist()
  }
  function clearRosterAnchor(roster, dateStr) {
    const byRoster = content.duty.anchors[roster.id]
    if (!byRoster) return
    delete byRoster[dateStr]
    if (!Object.keys(byRoster).length) delete content.duty.anchors[roster.id]
    persist()
  }
  function reanchorRoster(roster) {
    const count = countOccurrences(content.duty, roster, localDateStr())
    roster.offset = 1 - count
    persist()
  }

  watch(content, persist, { deep: true })
  return { content, addImportantDay, removeImportantDay, addQuote, addQuotes, removeQuote, removeQuotes, addLesson, updateLesson, removeLesson, addHomework, updateHomework, removeHomework, archivePastHomework, clearHomeworkHistory, restoreHomework, removeHistoryItems, recordSchoolDay, updateDuty, addMember, updateMember, removeMember, importMembers, addRoster, updateRoster, removeRoster, addChore, updateChore, removeChore, setOverride, clearOverride, setRosterOffset, reanchorRoster, setRosterAnchor, clearRosterAnchor }
})
