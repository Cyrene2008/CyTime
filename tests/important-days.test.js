import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createBackup, parseBackup, prepareBackupRestore } from '../src/services/backup.js'
import { groupImportantDays, importantDayOccurrence, importantDayPreviews, importantDayStatus, normalizeImportantDay, normalizeImportantDays } from '../src/services/importantDays.js'

test('one-time days remain today for the whole date and count calendar dates in both directions', () => {
  const exam = { name: '考试', date: '2026-03-08' }
  assert.equal(importantDayStatus(importantDayOccurrence(exam, '2026-03-07').days), '还有 1 天')
  assert.equal(importantDayStatus(importantDayOccurrence(exam, '2026-03-08').days), '今天')
  assert.equal(importantDayStatus(importantDayOccurrence(exam, '2026-03-09').days), '已过去 1 天')
  assert.equal(importantDayOccurrence({ ...exam, date: '2026-11-02' }, '2026-11-01').days, 1)
  assert.equal(importantDayOccurrence({ ...exam, date: '2027-01-01' }, '2026-12-31').days, 1)
})

test('annual days use their first date and roll forward only after each anniversary', () => {
  const birthday = { name: '生日', date: '2030-06-10', recurring: true }
  assert.equal(importantDayOccurrence(birthday, '2029-05-01').occurrenceDate, '2030-06-10')
  assert.equal(importantDayOccurrence(birthday, '2031-06-10').days, 0)
  assert.equal(importantDayOccurrence(birthday, '2031-06-11').occurrenceDate, '2032-06-10')
})

test('a leap-day anniversary falls on February 28 in common years and returns to February 29', () => {
  const birthday = { name: '生日', date: '2024-02-29', recurring: true }
  assert.equal(importantDayOccurrence(birthday, '2027-02-27').occurrenceDate, '2027-02-28')
  assert.equal(importantDayOccurrence(birthday, '2027-02-28').days, 0)
  assert.equal(importantDayOccurrence(birthday, '2027-03-01').occurrenceDate, '2028-02-29')
  assert.equal(importantDayOccurrence(birthday, '2100-02-27').occurrenceDate, '2100-02-28')
  assert.equal(normalizeImportantDay({ ...birthday, date: '2100-02-29' }), null)
})

test('the clock previews pinned dates only on their occurrence day and omits elapsed days', () => {
  const entries = [
    { id: 'yesterday', date: '2026-06-01' },
    { id: 'older', date: '2026-05-01' },
    { id: 'future-pin', date: '2026-06-03', pinned: true },
    { id: 'today', date: '2026-06-02' },
    { id: 'annual-pin', date: '2025-06-02', recurring: true, pinned: true }
  ]
  const { upcoming, past } = groupImportantDays(entries, '2026-06-02')
  assert.deepEqual(upcoming.map(item => item.id), ['annual-pin', 'today', 'future-pin'])
  assert.deepEqual(past.map(item => item.id), ['yesterday', 'older'])
  assert.deepEqual(importantDayPreviews(upcoming).map(item => item.id), ['annual-pin'])
  const withoutTodaysPin = upcoming.filter(item => item.id !== 'annual-pin')
  assert.deepEqual(importantDayPreviews(withoutTodaysPin).map(item => item.id), ['today', 'future-pin'])
  assert.deepEqual(importantDayPreviews(groupImportantDays(entries, '2026-06-04').upcoming).map(item => item.id), ['annual-pin'])
})

test('backup restore preserves recurrence and pin flags and legacy records receive distinct editable IDs', () => {
  const oldDay = { name: '考试', date: '2026-11-08' }
  const days = [
    oldDay,
    { ...oldDay, id: 'day-legacy-1', name: '校运动会' },
    { ...oldDay, id: 'day-legacy-1', name: '学期结束' },
    { id: 'birthday', name: '生日', date: '2024-02-29', recurring: true, pinned: true }
  ]
  const backup = parseBackup(createBackup({ content: { importantDays: days } }))
  const restored = prepareBackupRestore({ content: { importantDays: [] } }, backup, ['importantDays'])
  const dates = restored.updates['cytime.content.v1'].importantDays
  assert.deepEqual(dates, days)
  const normalized = normalizeImportantDays(dates)
  assert.equal(normalized.length, 4)
  assert.equal(new Set(normalized.map(item => item.id)).size, 4)
  assert.equal(normalized[1].id, 'day-legacy-1')
  assert.deepEqual(normalized[3], days[3])
  assert.equal(normalized[0].recurring, false)
  assert.equal(normalized[0].pinned, false)
  assert.throws(() => parseBackup({ content: { importantDays: [{ ...oldDay, date: '2026-11-31' }] } }), /重要日/)
})
