import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dateAdd, isDateString, weekdayIndex, countOccurrences, occurrenceIndex, createOccurrenceResolver, nextRosterDate, nextDutyDate, resolveRosterDay, dutyStats } from '../src/services/duty.js'
import { serializeDutyPreview, serializeDutyStats } from '../src/services/dutyExport.js'
import { parseCsvRows } from '../src/utils/csv.js'

function fixture() {
  const members = [{ id: 'm1', name: '甲同学', gender: 'male' }, { id: 'm2', name: '乙同学', gender: 'female' }, { id: 'm3', name: '丙同学', gender: 'male' }]
  const roster = { id: 'r1', name: '日常值日', enabled: true, mode: 'auto', weekdays: [], memberIds: [], chores: [{ id: 'c1', name: '扫地', slots: 1, phase: 0, genderRule: 'any', noRepeat: true }], offset: 0 }
  return { members, rosters: [roster], schoolDays: ['2026-10-26', '2026-10-27', '2026-10-28'], holidays: [], skipWeekends: false, overrides: {}, anchors: {} }
}

test('invalid calendar dates are rejected and leap days advance correctly', () => {
  assert.equal(isDateString('2026-02-30'), false)
  assert.equal(weekdayIndex('invalid'), -1)
  assert.equal(dateAdd('2026-02-30', 1), null)
  assert.equal(dateAdd('2024-02-28', 1), '2024-02-29')
  assert.equal(dateAdd('2024-02-29', 1), '2024-03-01')
})

test('future occurrence counting respects weekdays, holidays, and DST calendar days', () => {
  const originalTZ = process.env.TZ
  process.env.TZ = 'America/New_York'
  try {
    const duty = fixture()
    duty.schoolDays = ['2026-03-06']
    duty.skipWeekends = true
    duty.holidays = ['2026-03-09', '2026-03-09']
    assert.equal(dateAdd('2026-03-07', 1), '2026-03-08')
    assert.equal(countOccurrences(duty, duty.rosters[0], '2026-03-10', '2026-03-06'), 2)
    duty.rosters[0].weekdays = [2]
    assert.equal(countOccurrences(duty, duty.rosters[0], '2026-03-10', '2026-03-06'), 1)
  } finally {
    if (originalTZ === undefined) delete process.env.TZ
    else process.env.TZ = originalTZ
  }
})

test('batch occurrence resolution matches individual resolution across historical and future anchors', () => {
  const duty = fixture()
  const roster = duty.rosters[0]
  roster.offset = -4
  duty.skipWeekends = true
  duty.holidays = ['2026-11-02']
  duty.anchors = { r1: { '2026-10-27': 3, '2026-11-05': 8 } }
  const resolver = createOccurrenceResolver(duty, roster, '2026-10-28')
  for (let date = '2026-10-26'; date <= '2026-11-12'; date = dateAdd(date, 1)) {
    assert.equal(resolver.indexAt(date), occurrenceIndex(duty, roster, date, '2026-10-28'))
    assert.deepEqual(resolveRosterDay(duty, roster, date, '2026-10-28', resolver.indexAt(date)).lines, resolveRosterDay(duty, roster, date, '2026-10-28').lines)
  }
})

test('historical navigation finds recorded school days across gaps longer than 400 days', () => {
  const duty = fixture()
  duty.schoolDays = ['2024-01-02', '2026-10-28']
  assert.equal(nextRosterDate(duty, duty.rosters[0], '2026-10-28', -1, '2026-10-28'), '2024-01-02')
  assert.equal(nextDutyDate(duty, '2024-01-02', 1, '2026-10-28'), '2026-10-28')
})

test('statistics include all historical records instead of stopping after 400 calendar days', () => {
  const duty = fixture()
  duty.schoolDays = Array.from({ length: 500 }, (_, index) => dateAdd('2024-01-01', index * 2))
  const stats = dutyStats(duty, duty.rosters[0], '2024-01-01', '2026-10-28')
  assert.equal([...stats.values()].reduce((sum, value) => sum + value.total, 0), 500)
})

test('fractional slot inputs and large occurrence indices resolve to valid members', () => {
  const duty = fixture()
  const roster = duty.rosters[0]
  roster.chores[0].slots = 2.5
  roster.chores[0].phase = 0.5
  assert.equal(resolveRosterDay(duty, roster, '2026-10-28', '2026-10-28', 1).lines[0].memberIds.length, 3)
  roster.chores[0].slots = 2
  roster.chores[0].phase = 1
  const index = Number.MAX_SAFE_INTEGER - 1
  const expected = Number((BigInt(index) * 2n + 1n) % 3n)
  const line = resolveRosterDay(duty, roster, '2026-10-28', '2026-10-28', index).lines[0]
  assert.equal(line.memberIds[0], duty.members[expected].id)
})

test('exported schedules preserve manual and temporary tasks and zero-count members', () => {
  const duty = fixture()
  const roster = duty.rosters[0]
  duty.overrides['2026-10-28'] = { r1: [{ choreId: 'c1', memberIds: ['m2'] }, { choreId: 'extra', name: '临时,"加项"', memberIds: ['m3'] }] }
  const rows = [{ date: '2026-10-28', ...resolveRosterDay(duty, roster, '2026-10-28', '2026-10-28') }]
  const csv = parseCsvRows(serializeDutyPreview(roster, rows, duty.members))
  assert.equal(csv.length, 3)
  assert.equal(csv[1][5], '乙同学')
  assert.equal(csv[1][6], '单日调整')
  assert.equal(csv[2][4], '临时,"加项"')
  assert.equal(csv[2][6], '临时任务')
  assert.equal(parseCsvRows(serializeDutyStats(roster, [{ member: duty.members[0], total: 0, chores: {} }]))[1][2], '0')
})
