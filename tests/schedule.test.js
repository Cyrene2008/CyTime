import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readScheduleFile, normalizeScheduleLessons, mergeSchedule, countNewScheduleLessons, serializeSchedule, scheduleConflictCount } from '../src/services/schedule.js'
import { parseRosterFile, serializeRosterFile } from '../src/utils/dutyRoster.js'

const lesson = { id: 'lesson-1', subject: '数学', weekday: 1, startAt: '08:00', endAt: '08:45', room: '教室' }
const file = (name, text) => ({ name, text: async () => text })

test('CSV imports normalize Chinese weekdays and times and remove repeated rows', async () => {
  const result = await readScheduleFile(file('课程.csv', '\uFEFF星期,开始时间,结束时间,课程,教室\r\n周一,8:00,8:45,数学,教室\r\n1,08:00,08:45,数学,教室'))
  assert.equal(result.lessons.length, 1)
  assert.equal(result.duplicates, 1)
  assert.deepEqual(result.lessons[0], { weekday: 1, startAt: '08:00', endAt: '08:45', subject: '数学', room: '教室' })
})

test('JSON imports accept complete CyTime backups and English field names', async () => {
  const result = await readScheduleFile(file('备份.json', JSON.stringify({ content: { schedule: [lesson] } })))
  assert.deepEqual(result.lessons, [lesson])
  const english = normalizeScheduleLessons([{ day: 'Sunday', start: '9:00', end: '9:45', course: 'English' }])
  assert.equal(english.lessons[0].weekday, 0)
})

test('append preserves existing entries, skips duplicates, and gives new courses unique ids', () => {
  const current = [{ ...lesson }, { ...lesson, id: 'lesson-duplicate' }]
  const incoming = [lesson, { ...lesson, id: 'lesson-1', subject: '英语', weekday: 2 }]
  const merged = mergeSchedule(current, incoming)
  assert.equal(merged.length, 3)
  assert.equal(countNewScheduleLessons(current, incoming), 1)
  assert.equal(new Set(merged.map(item => item.id)).size, 3)
  assert.equal(merged[0].id, 'lesson-1')
  assert.equal(current.length, 2)
  assert.equal(mergeSchedule(current, [incoming[1]], true).length, 1)
})

test('Excel imports accept spreadsheet time values without loading the workbook into the UI', async () => {
  const XLSX = await import('xlsx')
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['星期', '开始时间', '结束时间', '课程', '教室'], ['周三', 8 / 24, 8.75 / 24, '物理', '教室']]), '课程表')
  const bytes = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })
  const result = await readScheduleFile({ name: '课程表.xlsx', arrayBuffer: async () => bytes })
  assert.equal(result.lessons[0].startAt, '08:00')
  assert.equal(result.lessons[0].endAt, '08:45')
  assert.equal(result.lessons[0].subject, '物理')
})

test('bad headers, missing weekdays, and reversed lesson times are rejected', async () => {
  await assert.rejects(readScheduleFile(file('bad.csv', '姓名,时间\n数学,8:00')))
  assert.throws(() => normalizeScheduleLessons([{ ...lesson, weekday: '' }]))
  assert.throws(() => normalizeScheduleLessons([{ ...lesson, startAt: '24:00' }]))
  assert.throws(() => normalizeScheduleLessons([{ ...lesson, endAt: '07:00' }]))
})

test('CSV export round-trips course text and conflict detection ignores adjoining classes', async () => {
  const source = [{ ...lesson, subject: '数学,"测试"', room: '教室\n一楼' }]
  const parsed = await readScheduleFile(file('课程表.csv', serializeSchedule(source)))
  assert.equal(parsed.lessons[0].subject, source[0].subject)
  assert.equal(parsed.lessons[0].room, source[0].room)
  assert.equal(scheduleConflictCount([lesson, { ...lesson, startAt: '08:45', endAt: '09:30' }]), 0)
  assert.equal(scheduleConflictCount([lesson, { ...lesson, startAt: '08:30', endAt: '09:15' }]), 1)
})

test('shared CSV handling preserves existing duty roster imports and exports', async () => {
  const members = [{ name: '张同学', enName: 'Zhang,"A"', gender: 'male' }]
  const exported = serializeRosterFile(members, 'csv', '测试名单')
  const parsed = await parseRosterFile('名单.csv', new TextEncoder().encode(exported))
  assert.deepEqual(parsed.members, members)
})
