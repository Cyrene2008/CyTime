import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createTimerLap, normalizeTimerLaps, formatLapDuration, serializeTimerLaps } from '../src/services/timerLaps.js'
import { parseCsvRows, serializeCsv, fileNamePart } from '../src/utils/csv.js'

test('laps record cumulative and split times without zero or negative segments', () => {
  const first = createTimerLap([], 12.3, 1000)
  const second = createTimerLap([first], 19.85, 2000)
  assert.equal(first.split, 12.3)
  assert.ok(Math.abs(second.split - 7.55) < 0.000001)
  assert.equal(createTimerLap([first, second], 19.85), null)
  assert.equal(createTimerLap([first, second], 18), null)
  assert.equal(createTimerLap([], Infinity), null)
})

test('restored laps discard invalid ordering and rebuild correct splits and unique ids', () => {
  const values = [{ id: 'same', elapsed: 10, split: -5 }, { elapsed: 8 }, { id: 'same', elapsed: 15 }, null, { elapsed: Infinity }, { elapsed: 20 }]
  const laps = normalizeTimerLaps(values)
  assert.deepEqual(laps.map(lap => lap.split), [10, 5, 5])
  assert.equal(new Set(laps.map(lap => lap.id)).size, 3)
  assert.equal(values[0].split, -5)
})

test('hundredth-second formatting handles minute and hour boundaries', () => {
  assert.equal(formatLapDuration(61.235), '00:01:01.23')
  assert.equal(formatLapDuration(3600), '01:00:00.00')
  assert.equal(formatLapDuration(0), '00:00:00.00')
  assert.equal(formatLapDuration(NaN), '00:00:00.00')
})

test('CSV export preserves all laps and labels containing commas, quotes, and newlines', () => {
  const label = '数学,"练习"\n第二组'
  const laps = [createTimerLap([], 10, 1000)]
  laps.push(createTimerLap(laps, 15, 2000))
  const csv = serializeTimerLaps({ label, laps })
  const rows = parseCsvRows(csv)
  assert.ok(csv.startsWith('\uFEFF'))
  assert.equal(rows.length, 3)
  assert.equal(rows[2][1], '00:00:05.00')
  assert.equal(rows[2][4], label)
  assert.deepEqual(parseCsvRows(serializeCsv([['姓名', '备注'], ['张同学', '逗号,换行\n引号"']])), [['姓名', '备注'], ['张同学', '逗号,换行\n引号"']])
  assert.equal(fileNamePart('课程/计时?'), '课程_计时_')
})
