import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parse as parseYaml } from 'yaml'
import { analyzeScheduleImport, readScheduleFile, normalizeScheduleLessons, mergeSchedule, countNewScheduleLessons, scheduleConflictCount, isLessonOnDate, scheduleWeekParity } from '../src/services/schedule.js'
import { serializeSchedule } from '../src/services/cses.js'
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

test('conflict detection ignores adjoining classes', () => {
  assert.equal(scheduleConflictCount([lesson, { ...lesson, startAt: '08:45', endAt: '09:30' }]), 0)
  assert.equal(scheduleConflictCount([lesson, { ...lesson, startAt: '08:30', endAt: '09:15' }]), 1)
})

const cses = `version: 1
subjects:
  - name: 数学
    simplified_name: 数
    teacher: 李老师
    room: "101"
schedules:
  - name: 周日
    enable_day: 7
    weeks: odd
    classes:
      - subject: 数学
        start_time: "08:00:10"
        end_time: "08:45:20"
`

test('CSES v1 decodes Sunday, odd weeks, seconds, and subject metadata', async () => {
  const result = await readScheduleFile(file('课程表.YML', '\uFEFF' + cses))
  assert.deepEqual(result, {
    lessons: [{ weekday: 0, startAt: '08:00:10', endAt: '08:45:20', subject: '数学', room: '101', weeks: 'odd', teacher: '李老师', simplifiedName: '数' }],
    duplicates: 0
  })
})

test('CSES export round-trips different rooms for the same course with unique standard subject references', async () => {
  const source = [
    { ...lesson, subject: '物理,"实验"', room: '教室\n一楼', teacher: '张老师', simplifiedName: '物' },
    { ...lesson, subject: '物理,"实验"', weekday: 0, weeks: 'even', startAt: '08:00:05', room: '实验室', teacher: '李老师' }
  ]
  const serialized = serializeSchedule(source)
  const document = parseYaml(serialized)
  assert.equal(document.version, 1)
  assert.equal(new Set(document.subjects.map(item => item.name)).size, 2)
  assert.deepEqual(document.schedules.map(item => [item.enable_day, item.weeks, item.classes[0].start_time]), [[1, 'all', '08:00:00'], [7, 'even', '08:00:05']])
  assert.equal(document.subjects.find(item => item.name === document.schedules[1].classes[0].subject).room, '实验室')
  const parsed = await readScheduleFile(file('课程表.yaml', serialized))
  assert.equal(countNewScheduleLessons(source, parsed.lessons), 0)
  assert.deepEqual(parsed.lessons, source.map(({ id, ...item }) => ({ ...item, weeks: item.weeks || 'all' })))
})

test('CSES rejects invalid YAML, unknown versions or subjects, and invalid clock values', async () => {
  for (const [bad, error] of [
    ['version: [1', /YAML/],
    [cses.replace('version: 1', 'version: 2'), /v1/],
    [cses.replace('subjects:', 'subjects:\nsubjects:'), /YAML/],
    [cses.replace('enable_day: 7', 'enable_day: 0'), /enable_day/],
    [cses.replace('weeks: odd', 'weeks: summer'), /weeks/],
    [cses.replace('subject: 数学', 'subject: 语文'), /未定义的科目/],
    [cses.replace('08:00:10', '08:00:60'), /HH:MM:SS/],
    [cses.replace('08:45:20', '08:00:09'), /晚于/],
    ['version: 1\nsubjects: []\nschedules: []', /没有课程/]
  ]) {
    await assert.rejects(readScheduleFile(file('课程表.yaml', bad)), error)
  }
})

test('import preview reports only overlaps on the same effective week and preserves second boundaries', () => {
  const odd = { ...lesson, weeks: 'odd' }
  const even = { ...lesson, subject: '物理', weeks: 'even' }
  const all = { ...lesson, subject: '语文', startAt: '08:44:59', endAt: '08:45:01' }
  assert.equal(analyzeScheduleImport([odd], [even]).conflicts.length, 0)
  assert.deepEqual(analyzeScheduleImport([odd, even], [all]).conflicts.map(item => item.weeks).sort(), ['even', 'odd'])
  assert.equal(analyzeScheduleImport([odd, even], [all], 'replace').conflicts.length, 0)
  assert.equal(scheduleConflictCount([odd, { ...all, startAt: '08:45:00' }]), 0)
})

test('schedule week parity is based on the calendar week containing the semester start date', () => {
  const start = '2026-08-26'
  const dates = [new Date(2026, 7, 23), new Date(2026, 7, 24), new Date(2026, 7, 30), new Date(2026, 7, 31), new Date(2026, 8, 7)]
  assert.deepEqual(dates.map(day => scheduleWeekParity(day, start)), [null, 'odd', 'odd', 'even', 'odd'])
  assert.equal(isLessonOnDate(lesson, dates[3], ''), true)
  assert.equal(isLessonOnDate({ ...lesson, weeks: 'even' }, dates[3], ''), false)
  assert.equal(isLessonOnDate({ ...lesson, weeks: 'even' }, dates[3], start), true)
  assert.equal(isLessonOnDate({ ...lesson, weeks: 'odd' }, dates[3], start), false)
})

test('the import preview keeps the conflict total even after its example limit', () => {
  const many = Array.from({ length: 12 }, (_, index) => ({ ...lesson, subject: `课程 ${index + 1}` }))
  const preview = analyzeScheduleImport([], many)
  assert.equal(preview.conflictCount, 66)
  assert.equal(preview.conflicts.length, 50)
})

test('shared CSV handling preserves existing duty roster imports and exports', async () => {
  const members = [{ name: '张同学', enName: 'Zhang,"A"', gender: 'male' }]
  const exported = serializeRosterFile(members, 'csv', '测试名单')
  const parsed = await parseRosterFile('名单.csv', new TextEncoder().encode(exported))
  assert.deepEqual(parsed.members, members)
})
