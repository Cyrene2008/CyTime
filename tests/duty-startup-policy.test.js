import assert from 'node:assert/strict'
import { test } from 'node:test'
import { countOccurrences, occurrenceIndex, rosterApplies, setStartupRotationPolicy, createOccurrenceResolver } from '../src/services/duty.js'
import { parseBackup } from '../src/services/backup.js'

function fixture(required = false) {
  const roster = { id: 'r1', name: '日常值日', mode: 'auto', enabled: true, weekdays: [], memberIds: [], offset: 0, chores: [{ id: 'c1', name: '扫地', slots: 1 }] }
  return {
    members: [{ id: 'm1', name: '甲' }], rosters: [roster],
    schoolDays: ['2026-10-26', '2026-10-27', '2026-10-28'], activeDays: ['2026-10-26', '2026-10-28'],
    freezeUnstartedDays: required, rotationPolicyStart: '2026-10-26', startupFreezeRules: { '2026-10-26': required },
    holidays: [], skipWeekends: false, anchors: {}, overrides: {}
  }
}

test('default-off policy advances by valid calendar dates', () => {
  const duty = fixture()
  assert.equal(duty.freezeUnstartedDays, false)
  assert.equal(countOccurrences(duty, duty.rosters[0], '2026-10-28', '2026-10-28'), 3)
  assert.equal(rosterApplies(duty, duty.rosters[0], '2026-10-27', '2026-10-28'), true)
})

test('enabled policy does not advance on an unopened day even if the school day was manually added', () => {
  const duty = fixture(true)
  assert.equal(occurrenceIndex(duty, duty.rosters[0], '2026-10-27', '2026-10-28'), occurrenceIndex(duty, duty.rosters[0], '2026-10-26', '2026-10-28'))
  assert.equal(rosterApplies(duty, duty.rosters[0], '2026-10-27', '2026-10-28'), false)
  assert.equal(countOccurrences(duty, duty.rosters[0], '2026-10-28', '2026-10-28'), 2)
})

test('future previews remain predictions but later unopened dates do not become rotations', () => {
  const duty = fixture(true)
  duty.schoolDays = ['2026-10-26', '2026-10-29']
  duty.activeDays = ['2026-10-26']
  assert.equal(occurrenceIndex(duty, duty.rosters[0], '2026-10-29', '2026-10-26'), 3)
  duty.activeDays.push('2026-10-29')
  assert.equal(occurrenceIndex(duty, duty.rosters[0], '2026-10-29', '2026-10-29'), 1)
})

test('changing the policy preserves the current index and retains earlier policy intervals', () => {
  const duty = fixture()
  const roster = duty.rosters[0]
  const current = occurrenceIndex(duty, roster, '2026-10-28', '2026-10-28')
  duty.anchors.r1 = { '2026-11-05': 10 }
  setStartupRotationPolicy(duty, true, '2026-10-28')
  assert.equal(occurrenceIndex(duty, roster, '2026-10-28', '2026-10-28'), current)
  assert.equal(occurrenceIndex(duty, roster, '2026-10-30', '2026-10-30'), current)
  setStartupRotationPolicy(duty, false, '2026-10-31')
  assert.equal(occurrenceIndex(duty, roster, '2026-10-30', '2026-10-31'), current)
  assert.equal(occurrenceIndex(duty, roster, '2026-11-01', '2026-11-01'), current + 2)
  assert.equal(duty.anchors.r1['2026-11-05'], 10)
})

test('old recorded-day histories keep their indices when the policy is first enabled', () => {
  const duty = fixture()
  delete duty.rotationPolicyStart
  delete duty.startupFreezeRules
  delete duty.freezeUnstartedDays
  duty.schoolDays = ['2026-10-26', '2026-10-28']
  const previous = occurrenceIndex(duty, duty.rosters[0], '2026-10-28', '2026-10-28')
  setStartupRotationPolicy(duty, true, '2026-10-28')
  assert.equal(occurrenceIndex(duty, duty.rosters[0], '2026-10-28', '2026-10-28'), previous)
  assert.deepEqual(createOccurrenceResolver(duty, duty.rosters[0], '2026-10-29').dates, ['2026-10-26', '2026-10-28'])
})

test('startup policy and real activity dates survive backup round trips', () => {
  const duty = fixture(true)
  assert.deepEqual(parseBackup(JSON.stringify({ content: { duty } })).content.duty.activeDays, duty.activeDays)
  assert.throws(() => parseBackup({ content: { duty: { ...duty, activeDays: ['not-a-date'] } } }))
})
