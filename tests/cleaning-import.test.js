import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseRosterFile } from '../src/utils/dutyRoster.js'

const strict = { requireComplete: true, interactive: true }

test('manual cleaning mapping keeps optional English names empty unless a separate column is labeled', async () => {
  const mapping = { name: 0, gender: 1, start: 2, male: '1', female: '2' }
  const blank = await parseRosterFile('class.csv', '同学,编码,编号\n甲,1,1001\n乙,2,1002', { ...strict, mapping })
  assert.deepEqual(blank.members, [
    { name: '甲', gender: 'male', enName: '' },
    { name: '乙', gender: 'female', enName: '' }
  ])
  const reused = await parseRosterFile('class.csv', '同学,英文名\n甲,1', { ...strict, mapping })
  assert.equal(reused.members[0].enName, '')
  const explicit = await parseRosterFile('class.csv', '同学,编码,英文名\n甲,1,Alice', { ...strict, mapping })
  assert.equal(explicit.members[0].enName, 'Alice')
  const general = await parseRosterFile('general.csv', '甲,Alice,女')
  assert.deepEqual(general.members[0], { name: '甲', enName: 'Alice', gender: 'female' })
})

test('manual cleaning mapping with a title row still requires an explicit choice between known classes', async () => {
  const csv = '年级名单\n班级,同学,编码\n七班,甲,1\n八班,乙,2'
  const mapping = { name: 1, gender: 2, start: 3, male: '1', female: '2' }
  assert.equal((await parseRosterFile('grades.csv', csv, strict)).choice.kind, 'columns')
  const { choice } = await parseRosterFile('grades.csv', csv, { ...strict, mapping })
  assert.equal(choice.kind, 'class')
  assert.deepEqual(choice.classes, ['七班', '八班'])
  const chosen = await parseRosterFile('grades.csv', csv, { ...strict, mapping, className: '八班' })
  assert.deepEqual(chosen, { name: '八班', members: [{ name: '乙', enName: '', gender: 'female' }] })
  await assert.rejects(parseRosterFile('grades.csv', csv + '\n,丙,', { ...strict, mapping, className: '八班' }), /缺少班级名称/)
})
