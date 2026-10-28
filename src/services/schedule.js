import { parseCsvRows, serializeCsv } from '../utils/csv.js'

export const scheduleWeekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
const weekdayNames = { 日: 0, 天: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tuesday: 2, wed: 3, wednesday: 3, thu: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6 }
const fieldNames = { weekday: ['weekday', 'day', '星期', '周几'], startAt: ['startat', 'start', '开始时间', '开始', '上课时间'], endAt: ['endat', 'end', '结束时间', '结束', '下课时间'], subject: ['subject', 'course', '课程', '课程名称', '科目'], room: ['room', '教室', '地点'] }
const keyOf = lesson => JSON.stringify([lesson.weekday, lesson.startAt, lesson.endAt, lesson.subject, lesson.room || ''])

function normalizeWeekday(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null
  if (value === null || value === undefined || String(value).trim() === '') return null
  const number = Number(value)
  if (Number.isInteger(number) && number >= 0 && number <= 7) return number % 7
  const name = String(value).trim().toLowerCase().replace(/^(星期|礼拜|周)/, '')
  return weekdayNames[name] ?? null
}
function normalizeTime(value) {
  const text = String(value ?? '').trim()
  const fraction = text !== '' ? Number(text) : NaN
  if (Number.isFinite(fraction) && fraction >= 0 && fraction < 1) {
    const minutes = Math.round(fraction * 1440)
    if (minutes >= 1440) return null
    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
  }
  const match = text.match(/^(\d{1,2}):(\d{1,2})(?::00)?$/)
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return null
  return `${match[1].padStart(2, '0')}:${match[2].padStart(2, '0')}`
}
function field(row, name) {
  return row[name.toLowerCase()] ?? fieldNames[name].map(key => row[key]).find(value => value !== undefined)
}

export function normalizeScheduleLessons(input, firstRow = 1) {
  if (!Array.isArray(input) || !input.length) throw new Error('文件中没有课程')
  const lessons = []
  const seen = new Set()
  let duplicates = 0
  input.forEach((row, index) => {
    const error = message => { throw new Error(`第 ${index + firstRow} 行：${message}`) }
    if (!row || typeof row !== 'object' || Array.isArray(row)) error('课程格式有误')
    const normalized = Object.fromEntries(Object.entries(row).map(([key, value]) => [key.trim().toLowerCase().replace(/\s/g, ''), value]))
    const weekday = normalizeWeekday(field(normalized, 'weekday'))
    const startAt = normalizeTime(field(normalized, 'startAt'))
    const endAt = normalizeTime(field(normalized, 'endAt'))
    const name = field(normalized, 'subject')
    const room = field(normalized, 'room')
    if (weekday === null) error('星期有误')
    if (!startAt || !endAt || startAt >= endAt) error('上课和下课时间有误')
    if (typeof name !== 'string' || !name.trim()) error('请填写课程名称')
    if (room !== undefined && typeof room !== 'string') error('教室格式有误')
    const lesson = { weekday, startAt, endAt, subject: name.trim(), room: (room || '').trim() }
    if (typeof row.id === 'string' && row.id) lesson.id = row.id
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

export function countNewScheduleLessons(current, incoming) {
  const seen = new Set(current.map(keyOf))
  let count = 0
  for (const lesson of incoming) {
    const key = keyOf(lesson)
    if (seen.has(key)) continue
    seen.add(key)
    count++
  }
  return count
}

export function mergeSchedule(current, incoming, replace = false, createId = () => `lesson-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`) {
  const result = replace ? [] : current.map(lesson => ({ ...lesson }))
  const seen = new Set(result.map(keyOf))
  const ids = new Set(result.map(lesson => lesson.id))
  for (const lesson of incoming) {
    const key = keyOf(lesson)
    if (seen.has(key)) continue
    const requested = lesson.id || createId()
    let id = requested
    let suffix = 1
    while (ids.has(id)) id = `${requested}-${suffix++}`
    ids.add(id)
    seen.add(key)
    result.push({ ...lesson, id })
  }
  return result.sort((a, b) => ((a.weekday + 6) % 7) - ((b.weekday + 6) % 7) || a.startAt.localeCompare(b.startAt) || a.subject.localeCompare(b.subject))
}

export function scheduleConflictCount(lessons) {
  let count = 0
  for (let weekday = 0; weekday < 7; weekday++) {
    const daily = lessons.filter(lesson => lesson.weekday === weekday).sort((a, b) => a.startAt.localeCompare(b.startAt))
    let active = []
    for (const lesson of daily) {
      active = active.filter(previous => previous.endAt > lesson.startAt)
      count += active.length
      active.push(lesson)
    }
  }
  return count
}

export function serializeSchedule(lessons) {
  return serializeCsv([['星期', '开始时间', '结束时间', '课程', '教室'], ...lessons.map(lesson => [scheduleWeekdays[lesson.weekday], lesson.startAt, lesson.endAt, lesson.subject, lesson.room || ''])])
}
