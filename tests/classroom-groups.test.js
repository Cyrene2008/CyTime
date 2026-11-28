import assert from 'node:assert/strict'
import { test } from 'node:test'
import { drawGroups, formatGroups, planGroupSizes, readGroupRoster } from '../src/services/classroomGroups.js'

test('pasted rosters drop empty lines without combining classmates with the same name', () => {
  const { people, duplicateNames } = readGroupRoster(' 张同学\r\n\r\n李同学 \n 张同学 \r 王同学\u2028\n')
  assert.equal(duplicateNames, 1)
  assert.deepEqual(people.map(person => person.name), ['张同学', '李同学', '张同学', '王同学'])
  assert.deepEqual(people.map(person => person.label), ['张同学（同名 1）', '李同学', '张同学（同名 2）', '王同学'])
  assert.equal(new Set(people.map(person => person.id)).size, 4)
})

test('generated labels do not collide with names that already contain notes', () => {
  const { people } = readGroupRoster('杨同学\n杨同学\n杨同学（同名 1）')
  assert.equal(new Set(people.map(person => person.label)).size, 3)
  assert.equal(people[2].label, people[2].name)
})

test('fixed group counts and maximum sizes both divide the whole class evenly', () => {
  assert.deepEqual(planGroupSizes(11, 'count', 4), [3, 3, 3, 2])
  assert.deepEqual(planGroupSizes(10, 'size', 4), [4, 3, 3])
  assert.deepEqual(planGroupSizes(8, 'size', 5), [4, 4])
  assert.deepEqual(planGroupSizes(2, 'size', 5), [2])
})

test('invalid requests cannot produce empty groups or drop participants', () => {
  for (const value of ['', 0, -2, 3.2, Infinity, NaN]) {
    assert.deepEqual(planGroupSizes(8, 'size', value), [])
  }
  assert.deepEqual(planGroupSizes(3, 'count', 4), [])
  assert.deepEqual(planGroupSizes(0, 'count', 1), [])
})

test('draws assign each roster row once without mutating the roster, and copies include same-name markers', () => {
  const { people } = readGroupRoster('张同学\n陈同学\n孙同学\n张同学\n周同学')
  const groups = drawGroups(people, 'count', 2, () => 0)
  assert.deepEqual(people.map(person => person.id), [1, 2, 3, 4, 5])
  assert.deepEqual(groups.flat().map(person => person.id), [2, 3, 4, 5, 1])
  assert.deepEqual(groups.map(group => group.length), [3, 2])
  assert.match(formatGroups(groups), /第 1 组（3 人）：陈同学、孙同学、张同学（同名 2）\n第 2 组（2 人）：周同学、张同学（同名 1）/)
})
