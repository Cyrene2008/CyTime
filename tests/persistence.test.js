import assert from 'node:assert/strict'
import { test } from 'node:test'
import { effectScope, nextTick, reactive, watch } from 'vue'
import { createBatchedPersist } from '../src/services/persistence.js'

globalThis.window = new EventTarget()

test('compound actions and the deep watcher save only the final complete state once', async () => {
  const scope = effectScope()
  const state = reactive({ members: [], selected: '' })
  const snapshots = []
  const persist = scope.run(() => {
    const save = createBatchedPersist(() => snapshots.push(JSON.parse(JSON.stringify(state))))
    watch(state, save, { deep: true })
    return save
  })
  try {
    for (let index = 0; index < 20; index++) {
      state.members.push(`member-${index}`)
      persist()
    }
    state.selected = 'member-19'
    persist()
    assert.equal(snapshots.length, 0)
    await nextTick()
    assert.equal(snapshots.length, 1)
    assert.equal(snapshots[0].members.length, 20)
    assert.equal(snapshots[0].selected, 'member-19')
    await nextTick()
    assert.equal(snapshots.length, 1)
  } finally {
    scope.stop()
  }
})

test('direct nested edits remain covered by automatic persistence', async () => {
  const scope = effectScope()
  const state = reactive({ task: { memberIds: [] } })
  const snapshots = []
  scope.run(() => watch(state, createBatchedPersist(() => snapshots.push([...state.task.memberIds])), { deep: true }))
  try {
    state.task.memberIds.push('member-1', 'member-2')
    await nextTick()
    await nextTick()
    assert.deepEqual(snapshots, [['member-1', 'member-2']])
  } finally {
    scope.stop()
  }
})

test('leaving the page flushes the latest pending save synchronously', async () => {
  const scope = effectScope()
  let value = 'initial'
  const snapshots = []
  const persist = scope.run(() => createBatchedPersist(() => snapshots.push(value)))
  try {
    persist()
    value = 'latest'
    persist()
    window.dispatchEvent(new Event('pagehide'))
    assert.deepEqual(snapshots, ['latest'])
    await nextTick()
    assert.deepEqual(snapshots, ['latest'])
  } finally {
    scope.stop()
  }
})

test('disposing the store scope flushes pending changes without a duplicate queued save', async () => {
  const scope = effectScope()
  const snapshots = []
  const persist = scope.run(() => createBatchedPersist(() => snapshots.push('final')))
  persist()
  scope.stop()
  assert.deepEqual(snapshots, ['final'])
  await nextTick()
  window.dispatchEvent(new Event('pagehide'))
  assert.deepEqual(snapshots, ['final'])
})

test('changes in later update cycles are saved separately', async () => {
  const scope = effectScope()
  const snapshots = []
  let value = 'first'
  const persist = scope.run(() => createBatchedPersist(() => snapshots.push(value)))
  try {
    persist()
    await nextTick()
    value = 'second'
    persist()
    await nextTick()
    assert.deepEqual(snapshots, ['first', 'second'])
  } finally {
    scope.stop()
  }
})
