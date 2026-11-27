import { parseCsvRows } from '../utils/csv.js'

export const scheduleWeekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
export const scheduleWeekTypes = { all: '每周', odd: '单周', even: '双周' }
const weekdayNames = { 日: 0, 天: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tuesday: 2, wed: 3, wednesday: 3, thu: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6 }
const fieldNames = { weekday: ['weekday', 'day', '星期', '周几'], startAt: ['startat', 'start', '开始时间', '开始', '上课时间'], endAt: ['endat', 'end', '结束时间', '结束', '下课时间'], subject: ['subject', 'course', '课程', '课程名称', '科目'], room: ['room', '教室', '地点'], weeks: ['weeks', '周次'], teacher: ['teacher', '教师'], simplifiedName: ['simplifiedname', 'simplified_name', '简称'] }
const lessonWeeks = lesson => lesson.weeks || 'all'
const keyOf = lesson => JSON.stringify([lesson.weekday, normalizeTime(lesson.startAt), normalizeTime(lesson.endAt), lesson.subject, lesson.room || '', lessonWeeks(lesson), lesson.teacher || '', lesson.simplifiedName || ''])
const maxConflictExamples = 50

function normalizeWeekday(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null
  if (value === null || value === undefined || String(value).trim() === '') return null
  const number = Number(value)
  if (Number.isInteger(number) && number >= 0 && number <= 7) return number % 7
  const name = String(value).trim().toLowerCase().replace(/^(星期|礼拜|周)/, '')
  return Object.hasOwn(weekdayNames, name) ? weekdayNames[name] : null
}
function normalizeTime(value) {
  const text = String(value ?? '').trim()
  const fraction = text !== '' ? Number(text) : NaN
  if (Number.isFinite(fraction) && fraction >= 0 && fraction < 1) {
    const minutes = Math.round(fraction * 1440)
    if (minutes >= 1440) return null
    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
  }
  const match = text.match(/^(\d{1,2}):(\d{1,2})(?::(\d{2}))?$/)
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59 || Number(match[3] || 0) > 59) return null
  const seconds = match[3] && match[3] !== '00' ? `:${match[3]}` : ''
  return `${match[1].padStart(2, '0')}:${match[2].padStart(2, '0')}${seconds}`
}
function field(row, name) {
  return row[name.toLowerCase()] ?? fieldNames[name].map(key => row[key]).find(value => value !== undefined)
}

export function lessonTimeToSeconds(time) {
  const [hour, minute, second = 0] = time.split(':').map(Number)
  return hour * 3600 + minute * 60 + second
}

export function scheduleWeekParity(date, weekOne) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekOne || '')) return null
  const anchor = new Date(`${weekOne}T00:00:00Z`)
  if (!Number.isFinite(anchor.getTime()) || anchor.toISOString().slice(0, 10) !== weekOne) return null
  const day = new Date(0)
  day.setUTCFullYear(date.getFullYear(), date.getMonth(), date.getDate())
  const weekStart = value => value.getTime() - ((value.getUTCDay() + 6) % 7) * 86400000
  const elapsed = (weekStart(day) - weekStart(anchor)) / (7 * 86400000)
  if (!Number.isFinite(elapsed) || elapsed < 0) return null
  return elapsed % 2 === 0 ? 'odd' : 'even'
}

export function isLessonOnDate(lesson, date, weekOne) {
  if (lesson.weekday !== date.getDay()) return false
  return lessonWeeks(lesson) === 'all' || lessonWeeks(lesson) === scheduleWeekParity(date, weekOne)
}

export function normalizeScheduleLesson(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('课程格式有误')
  const normalized = Object.fromEntries(Object.entries(row).map(([key, value]) => [key.trim().toLowerCase().replace(/\s/g, ''), value]))
  const weekday = normalizeWeekday(field(normalized, 'weekday'))
  const startAt = normalizeTime(field(normalized, 'startAt'))
  const endAt = normalizeTime(field(normalized, 'endAt'))
  const subject = field(normalized, 'subject')
  const room = field(normalized, 'room')
  const weeks = field(normalized, 'weeks')
  const teacher = field(normalized, 'teacher')
  const simplifiedName = field(normalized, 'simplifiedName')
  if (typeof subject !== 'string' || !subject.trim()) throw new Error('请填写课程名称')
  if (weekday === null) throw new Error('请选择有效的上课星期')
  if (!startAt || !endAt) throw new Error('请填写有效的上课和下课时间')
  if (startAt >= endAt) throw new Error('下课时间须晚于上课时间')
  if (room !== undefined && typeof room !== 'string') throw new Error('教室格式有误')
  if (weeks !== undefined && weeks !== '' && (typeof weeks !== 'string' || !Object.hasOwn(scheduleWeekTypes, weeks))) throw new Error('请选择有效的上课周次')
  if (teacher !== undefined && typeof teacher !== 'string') throw new Error('教师格式有误')
  if (simplifiedName !== undefined && typeof simplifiedName !== 'string') throw new Error('简称格式有误')
  const lesson = { weekday, startAt, endAt, subject: subject.trim(), room: (room || '').trim() }
  if (weeks) lesson.weeks = weeks
  if (typeof teacher === 'string') lesson.teacher = teacher.trim()
  if (typeof simplifiedName === 'string') lesson.simplifiedName = simplifiedName.trim()
  if (typeof row.id === 'string' && row.id) lesson.id = row.id
  return lesson
}

export function normalizeScheduleLessons(input, firstRow = 1) {
  if (!Array.isArray(input) || !input.length) throw new Error('文件中没有课程')
  const lessons = []
  const seen = new Set()
  let duplicates = 0
  input.forEach((row, index) => {
    let lesson
    try { lesson = normalizeScheduleLesson(row) }
    catch (error) { throw new Error(`第 ${index + firstRow} 行：${error.message}`) }
    const key = keyOf(lesson)
    if (seen.has(key)) { duplicates++; return }
    seen.add(key)
    lessons.push(lesson)
  })
  return { lessons, duplicates }
}

export async function readScheduleFile(file) {
  let text
  if (/\.xlsx?$/i.test(file.name)) {
    try {
      const XLSX = await import('xlsx')
      const workbook = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array', cellDates: false })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      if (!sheet) throw new Error('empty workbook')
      text = XLSX.utils.sheet_to_csv(sheet)
    } catch { throw new Error('无法读取 Excel 课程表') }
  } else text = await file.text()
  text = text.replace(/^\uFEFF/, '')
  if (/\.(?:ya?ml|cses)$/i.test(file.name)) {
    const { parseCsesSchedule } = await import('./cses.js')
    return normalizeScheduleLessons(parseCsesSchedule(text))
  }
  if (file.name.toLowerCase().endsWith('.json')) {
    let value
    try { value = JSON.parse(text) } catch { throw new Error('课程表文件格式有误') }
    return normalizeScheduleLessons(Array.isArray(value) ? value : value?.schedule ?? value?.content?.schedule)
  }
  const rows = parseCsvRows(text)
  if (!rows.length) throw new Error('文件中没有课程')
  const headers = rows[0].map(value => value.trim().toLowerCase().replace(/\s/g, ''))
  for (const name of ['weekday', 'startAt', 'endAt', 'subject']) {
    if (!fieldNames[name].some(key => headers.includes(key))) throw new Error('表头需要包含星期、开始时间、结束时间和课程名称')
  }
  return normalizeScheduleLessons(rows.slice(1).map(row => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? '']))), 2)
}

function planSchedule(current, incoming, replace) {
  const currentKeys = new Set(current.map(keyOf))
  const seen = replace ? new Set() : new Set(currentKeys)
  const accepted = []
  let added = 0
  for (const lesson of incoming) {
    const key = keyOf(lesson)
    if (seen.has(key)) continue
    seen.add(key)
    accepted.push(lesson)
    if (!currentKeys.has(key)) added++
  }
  // Each retained file row accounts for at most one old row, including in legacy schedules with duplicates.
  const removed = replace ? current.length - (accepted.length - added) : 0
  return { accepted, added, removed, duplicates: incoming.length - accepted.length }
}

export function countNewScheduleLessons(current, incoming) {
  return planSchedule(current, incoming, false).added
}

export const byLessonTime = (a, b) => ((a.weekday + 6) % 7) - ((b.weekday + 6) % 7) || lessonTimeToSeconds(a.startAt) - lessonTimeToSeconds(b.startAt) || a.subject.localeCompare(b.subject)

export function mergeSchedule(current, incoming, replace = false, createId = () => `lesson-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`) {
  const result = replace ? [] : current.map(lesson => ({ ...lesson }))
  const ids = new Set(result.map(lesson => lesson.id))
  for (const lesson of planSchedule(current, incoming, replace).accepted) {
    const requested = lesson.id || createId()
    let id = requested
    let suffix = 1
    while (ids.has(id)) id = `${requested}-${suffix++}`
    ids.add(id)
    result.push({ ...lesson, id })
  }
  return result.sort(byLessonTime)
}

function* overlappingPairs(sorted) {
  let active = []
  for (const lesson of sorted) {
    const start = lessonTimeToSeconds(lesson.startAt)
    active = active.filter(previous => previous.weekday === lesson.weekday && lessonTimeToSeconds(previous.endAt) > start)
    for (const first of active) {
      const firstWeeks = lessonWeeks(first)
      const secondWeeks = lessonWeeks(lesson)
      if (firstWeeks === 'all' || secondWeeks === 'all' || firstWeeks === secondWeeks) {
        yield { weekday: lesson.weekday, weeks: firstWeeks === 'all' ? secondWeeks : firstWeeks, first, second: lesson }
      }
    }
    active.push(lesson)
  }
}

export function analyzeScheduleImport(current, incoming, mode = 'merge') {
  const replace = mode === 'replace'
  const { accepted, added, removed, duplicates } = planSchedule(current, incoming, replace)
  const lessons = (replace ? accepted : [...current, ...accepted]).sort(byLessonTime)
  const inserted = new Set(accepted)
  const conflicts = []
  let conflictCount = 0
  if (accepted.length) {
    for (const pair of overlappingPairs(lessons)) {
      if (replace || inserted.has(pair.first) || inserted.has(pair.second)) {
        conflictCount++
        if (conflicts.length < maxConflictExamples) conflicts.push(pair)
      }
    }
  }
  return { lessons, added, removed, duplicates, conflicts, conflictCount }
}

export function scheduleConflictCount(lessons) {
  let count = 0
  for (const pair of overlappingPairs([...lessons].sort(byLessonTime))) count++
  return count
}
