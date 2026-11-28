import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { changeClassroomFlow, classroomRemainingMs, readyClassroomFlow, restoreClassroomFlow, syncClassroomFlow } from '../src/services/classroomFlow.js'

const stages = [{ name: '独立思考', seconds: 5 }, { name: '分享', seconds: 12 }]

test('a finished stage waits for confirmation even if the teacher returns much later', () => {
  const running = changeClassroomFlow(readyClassroomFlow(stages), 'start', 1000)
  const pending = syncClassroomFlow(running, 6000)
  assert.equal(pending.status, 'awaiting')
  assert.equal(syncClassroomFlow(pending, 30000), pending)
  assert.equal(classroomRemainingMs(pending, 30000), 0)
  assert.equal(pending.index, 0)

  const next = changeClassroomFlow(pending, 'next', 30000)
  assert.equal(next.index, 1)
  assert.equal(next.deadline, 42000)
  assert.equal(classroomRemainingMs(next, 30000), 12000)
})

test('reload preserves elapsed or paused work without restarting or auto-advancing', () => {
  const running = changeClassroomFlow(readyClassroomFlow(stages), 'start', 1000)
  const persisted = JSON.parse(JSON.stringify(running))
  const restored = restoreClassroomFlow(persisted, 3250)
  assert.equal(classroomRemainingMs(restored, 3250), 2750)

  const paused = changeClassroomFlow(restored, 'pause', 3250)
  const restoredPaused = restoreClassroomFlow(JSON.parse(JSON.stringify(paused)), 20000)
  assert.equal(restoredPaused.status, 'paused')
  assert.equal(classroomRemainingMs(restoredPaused, 20000), 2750)
  assert.equal(changeClassroomFlow(restoredPaused, 'resume', 24000).deadline, 26750)

  const elapsed = restoreClassroomFlow(persisted, 20000)
  assert.equal(elapsed.status, 'awaiting')
  assert.equal(elapsed.index, 0)
})

test('teacher can advance early, confirm final completion, and return to the same plan', () => {
  const first = changeClassroomFlow(readyClassroomFlow(stages), 'start', 1000)
  const second = changeClassroomFlow(first, 'next', 2000)
  assert.equal(second.index, 1)
  assert.equal(second.deadline, 14000)
  const pending = syncClassroomFlow(second, 14000)
  assert.equal(pending.status, 'awaiting')
  const finished = changeClassroomFlow(pending, 'next', 14000)
  assert.equal(finished.status, 'complete')
  assert.deepEqual(changeClassroomFlow(finished, 'reset', 15000), readyClassroomFlow(stages))
})

test('bad saved deadlines reset state and malformed phases fall back to the first preset', () => {
  assert.deepEqual(restoreClassroomFlow({ stages, status: 'running', index: 1, deadline: 'later' }, 1000), readyClassroomFlow(stages))
  assert.deepEqual(restoreClassroomFlow({ stages: [{ name: ' ', seconds: 0 }] }, 1000), readyClassroomFlow())
})
