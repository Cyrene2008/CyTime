import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseBackup, createBackup, availableBackupGroups, prepareBackupRestore } from '../src/services/backup.js'

const lesson = { id: 'lesson-1', subject: '数学', weekday: 1, startAt: '08:00', endAt: '08:45', room: '' }

test('version 2 backups remain readable and new backups preserve metadata and content', () => {
  const old = { version: 2, settings: { theme: 'dark-peach' }, content: { schedule: [lesson], notepad: '笔记' }, time: { countdowns: [], timers: [] } }
  assert.deepEqual(parseBackup(JSON.stringify(old)), old)
  const backup = createBackup(old, '26.0.7')
  assert.equal(backup.version, 3)
  assert.equal(backup.appVersion, '26.0.7')
  assert.ok(Number.isFinite(Date.parse(backup.exportedAt)))
  assert.deepEqual(parseBackup(JSON.stringify(backup)).content, old.content)
  assert.equal(old.version, 2)
})

test('selective restore replaces only selected content and preserves existing settings and notes', () => {
  const current = { settings: { theme: 'dark-peach' }, content: { schedule: [], notepad: '保留的笔记', homework: [] }, time: { timers: [] } }
  const backup = parseBackup({ content: { schedule: [lesson], notepad: '备份笔记' }, settings: { theme: 'light-peach' } })
  const result = prepareBackupRestore(current, backup, ['schedule'])
  assert.deepEqual(result.updates['cytime.content.v1'].schedule, [lesson])
  assert.equal(result.updates['cytime.content.v1'].notepad, '保留的笔记')
  assert.equal(result.updates['cytime.settings.v2'], undefined)
  assert.deepEqual(current.content.schedule, [])
})

test('partial settings restore merges preferences and removes obsolete v1 settings', () => {
  const backup = parseBackup({ settings: { theme: 'light-peach' } })
  const result = prepareBackupRestore({ settings: { theme: 'dark-peach', uiScale: 120 } }, backup, ['settings'])
  assert.deepEqual(result.updates['cytime.settings.v2'], { theme: 'light-peach', uiScale: 120 })
  assert.deepEqual(result.removeKeys, ['cytime.settings.v1'])
})

test('empty content can be restored and unavailable groups cannot be selected', () => {
  const backup = parseBackup({ content: { schedule: [] } })
  assert.deepEqual(availableBackupGroups(backup).map(group => group.id), ['schedule'])
  assert.deepEqual(prepareBackupRestore({ content: { schedule: [lesson] } }, backup, ['schedule']).updates['cytime.content.v1'].schedule, [])
  assert.throws(() => prepareBackupRestore({}, backup, ['settings']))
})

test('malformed backups and invalid lesson times are rejected before restoration', () => {
  for (const value of ['not-json', '{}', '{"content":[]}', '{"settings":{"theme":null}}']) assert.throws(() => parseBackup(value))
  assert.throws(() => parseBackup({ content: { schedule: [{ ...lesson, startAt: '25:00' }] } }))
  assert.throws(() => parseBackup({ content: { schedule: [{ ...lesson, endAt: '07:00' }] } }))
  assert.throws(() => parseBackup({ content: { duty: { rosters: [{ id: 'r', name: '名单', chores: [], memberIds: 'invalid' }] } } }))
})

test('legacy date-only homework deadlines are accepted', () => {
  const backup = parseBackup({ content: { homework: [{ content: '练习', startAt: '', dueAt: '2026-10-28' }] } })
  assert.equal(backup.content.homework[0].dueAt, '2026-10-28')
})

test('CSES lesson weeks, second precision, and the reference date survive a selective backup restore', () => {
  const entry = { ...lesson, weeks: 'even', startAt: '08:00:10', endAt: '08:00:30', teacher: '陈老师' }
  const content = { schedule: [entry], scheduleWeekOne: '2026-09-01' }
  const backup = parseBackup(createBackup({ content }))
  const result = prepareBackupRestore({ content: { schedule: [], notepad: '保留' } }, backup, ['schedule'])
  assert.deepEqual(result.updates['cytime.content.v1'], { ...content, notepad: '保留' })
  const legacy = parseBackup({ content: { schedule: [lesson] } })
  assert.equal(prepareBackupRestore({ content }, legacy, ['schedule']).updates['cytime.content.v1'].scheduleWeekOne, '')
  assert.throws(() => parseBackup({ content: { scheduleWeekOne: '2026-09-31' } }), /第 1 周/)
  assert.throws(() => parseBackup({ content: { schedule: [{ ...entry, endAt: '08:00' }] } }), /课程表/)
})
