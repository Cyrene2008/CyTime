import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cleaningSections, updateCleaningPlans, validCleaningPlans } from '../src/services/cleaning.js'
import { applicableDate, dateAdd, nextDutyDate, resolveDay, weekdayIndex } from '../src/services/duty.js'
import { serializeCleaningWeek } from '../src/services/dutyExport.js'
import { parseCsvRows } from '../src/utils/csv.js'
import { parseRosterFile, serializeRosterFile } from '../src/utils/dutyRoster.js'
import { parseBackup } from '../src/services/backup.js'

function roster(males, females) {
  return { name: '测试班', members: ['male', 'female'].flatMap((gender, k) =>
    Array.from({ length: [males, females][k] }, (_, i) => ({ name: gender + i, gender }))) }
}

function checkDays(plans, start, length) {
  const last = new Map()
  for (let n = 0; n < length; n++) {
    const date = dateAdd(start, n)
    const sections = cleaningSections(plans, date)
    const plan = plans.findLast(p => p.start <= date)
    const all = new Set([...plan.male, ...plan.female])
    assert.deepEqual(sections.map(s => s.roster.name), weekdayIndex(date) === 4 ? ['周四下午大扫除', '晚间日常清洁'] : ['晚间日常清洁'])
    for (const section of sections) {
      const big = section.roster.id === 'cleaning-thursday'
      assert.deepEqual(section.lines.map(line => [line.name, line.names.length]),
        big ? [['扫地', 2], ['拖地', 2], ['擦黑板', 1], ['抹', 1]] : [['扫地', 2], ['拖地', 2]])
      for (const line of section.lines) for (const name of line.names) {
        assert.ok(all.has(name))
        if (line.name === '拖地' || line.name === '抹') assert.ok(plan.male.includes(name))
        assert.ok(!last.has(name) || n - last.get(name) >= 7, '两次值日至少相隔七个日期')
        last.set(name, n)
      }
    }
  }
  return last.size
}

test('all slots and cooldown hold at minimum staffing, at either gender extreme and on every starting weekday', () => {
  for (let i = 0; i < 7; i++) {
    const start = dateAdd('2027-12-27', i)
    for (const [m, f] of [[35, 9], [17, 17], [17, 43], [33, 1], [34, 0], [39, 0]]) {
      const plans = updateCleaningPlans([], roster(m, f), start)
      assert.ok(validCleaningPlans(plans))
      assert.equal(checkDays(plans, start, 90), m + f)
      assert.deepEqual(cleaningSections(plans, dateAdd(start, -1)), [])
    }
  }
})

test('duplicate imports preserve the rotation and a membership change respects the previous six days', () => {
  const start = '2028-02-24'
  const input = roster(35, 9)
  const initial = updateCleaningPlans([], input, start)
  const replacement = roster(35, 9)
  replacement.members[0].name = '新同学'
  input.members.reverse()
  assert.equal(updateCleaningPlans(initial, input, dateAdd(start, 20)), initial)
  for (let n = 1; n <= 8; n++) {
    const next = updateCleaningPlans(initial, replacement, dateAdd(start, n))
    assert.equal(next.length, 2)
    assert.deepEqual(cleaningSections(next, dateAdd(start, n - 1)), cleaningSections(initial, dateAdd(start, n - 1)))
    checkDays(next, start, 100)
  }
})

test('unknown gender, ambiguous names and impossible staffing fail before a roster is changed', () => {
  const date = '2026-12-01'
  const plans = updateCleaningPlans([], roster(17, 17), date)
  for (const input of [roster(16, 50), roster(17, 16)]) assert.throws(() => updateCleaningPlans(plans, input, date), /34 人/)
  const bad = roster(35, 9)
  bad.members.at(-1).gender = ''
  assert.throws(() => updateCleaningPlans(plans, bad, date), /性别/)
  bad.members.at(-1).name = bad.members[0].name
  assert.throws(() => updateCleaningPlans(plans, bad, date), /重名/)
  assert.equal(plans.length, 1)
  assert.throws(() => updateCleaningPlans(plans, roster(35, 9), '2026-11-31'), /日期/)
})

test('a tight handover either matches everyone safely or reports a shortage without changing history', () => {
  const start = '2026-12-03'
  const initial = updateCleaningPlans([], roster(34, 0), start)
  const nextDay = dateAdd(start, 1)
  const previousNames = cleaningSections(initial, start).flatMap(s => s.lines.flatMap(l => l.names))
  const replacement = roster(17, 17)
  replacement.members.slice(0, 17).forEach((p, i) => { p.name = i < 10 ? previousNames[i] : '新生' + i })
  assert.throws(() => updateCleaningPlans(initial, replacement, nextDay), /交接/)
  assert.equal(checkDays(initial, start, 14), 34)
})

test('blackboard date navigation honors the start, weekends, Thursdays and independent manual rosters', () => {
  const start = '2026-12-03'
  const cleaningPlans = updateCleaningPlans([], roster(35, 9), start)
  const duty = { cleaningPlans, rosters: [], schoolDays: [], holidays: [start], skipWeekends: true }
  assert.equal(nextDutyDate(duty, '2025-01-01', 1), start)
  assert.equal(nextDutyDate(duty, start, -1), null)
  assert.equal(nextDutyDate(duty, '2026-12-04', 1), '2026-12-05')
  assert.ok(applicableDate(duty, '2026-12-05'))
  assert.equal(resolveDay(duty, start).length, 2)
  assert.equal(resolveDay(duty, '2026-12-05').length, 1)
  const manual = { id: 'other', name: '其他值日', mode: 'manual', chores: [] }
  duty.rosters.push(manual)
  assert.equal(resolveDay(duty, '2026-12-04', '2026-12-03').at(-1).roster, manual)
})

test('imports a BOM, arbitrary columns, blank name rows and headerless name/gender pairs', async () => {
  const csv = '\uFEFF名单名称,中文名,性别,日常（当前轮）,是否在下一轮免做清洁,大扫除\r\n测试班,甲,男,拖,是,抹\r\n测试班,,,,,\r\n测试班,乙,女,扫,,黑板'
  const imported = await parseRosterFile('test.csv', new TextEncoder().encode(csv))
  assert.equal(imported.name, '测试班')
  assert.deepEqual(imported.members.map(p => [p.name, p.gender]), [['甲', 'male'], ['乙', 'female']])
  const cp936 = Buffer.from('d0d5c3fb2cd0d4b1f00abcd72cc5ae', 'hex')
  assert.equal((await parseRosterFile('gbk.csv', cp936)).members[0].gender, 'female')
  const pairs = await parseRosterFile('test.csv', '甲,女\n乙,男生')
  assert.deepEqual(pairs.members.map(p => p.gender), ['female', 'male'])
})

test('backup round-trips cleaning plans, accepts older data and rejects invalid slot counts', () => {
  const plans = updateCleaningPlans([], roster(35, 9), '2026-12-03')
  const backup = data => ({ content: { duty: data } })
  assert.deepEqual(parseBackup(backup({ cleaningPlans: plans })).content.duty.cleaningPlans, plans)
  assert.deepEqual(parseBackup(backup({})).content.duty, {})
  plans[0].femaleSlots[1] = 10
  assert.throws(() => parseBackup(backup({ cleaningPlans: plans })), /清洁排班/)
})

test('Excel workbooks with reordered columns feed the same scheduler as a two-column CSV', async () => {
  const XLSX = await import('xlsx')
  const source = roster(35, 9)
  const rows = [['性别', '姓名'], ...source.members.map(p => [p.gender === 'male' ? '男' : '女', p.name])]
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), '班级名单')
  for (const format of ['xlsx', 'xls']) {
    const bytes = XLSX.write(book, { type: 'buffer', bookType: format === 'xls' ? 'biff8' : 'xlsx' })
    const excel = await parseRosterFile('class.' + format, bytes)
    assert.equal(checkDays(updateCleaningPlans([], excel, '2026-11-28'), '2026-11-28', 14), 44)
  }
})

test('strict imports keep class-only placeholders, distinguish missing pupils, and preserve dotted filenames', async () => {
  const strict = (name, csv) => parseRosterFile(name, csv, { requireComplete: true })
  const csv = '名单名称,中文名,性别\n八班,,\n八班,甲,男'
  assert.equal((await strict('roster.2027.02.csv', csv)).name, '八班')
  assert.equal((await strict('roster.2027.02.csv', '姓名,性别\n甲,女')).name, 'roster.2027.02')
  await assert.rejects(strict('a.csv', csv + '\n八班,,女'), /缺少姓名/)
  await assert.rejects(strict('a.csv', csv + '\n九班,乙,男'), /多个名单/)
  await assert.rejects(strict('a.csv', '姓名,英文名\n甲,A'), /缺少性别列/)
  await assert.rejects(strict('a.csv', '姓名,中文名,性别\n甲,乙,女'), /表头重复/)
  const json = serializeRosterFile([{ name: '未知', gender: '' }], 'json')
  assert.equal((await strict('a.json', json)).members[0].gender, '')
  await assert.rejects(strict('a.json', '[{"性别":"女"}]'), /缺少姓名/)
  // General-purpose duty rosters also support name-only files.
  assert.equal((await parseRosterFile('a.csv', '姓名\n甲')).members[0].name, '甲')
})

test('inserting, replacing and cancelling a future change preserve history and recheck later handovers', () => {
  const start = '2028-02-15'
  const a = roster(35, 9)
  const b = roster(36, 9)
  const c = roster(35, 10)
  let plans = updateCleaningPlans([], a, start)
  plans = updateCleaningPlans(plans, c, '2028-03-02')
  const original = structuredClone(plans)
  plans = updateCleaningPlans(plans, b, '2028-02-29')
  assert.deepEqual(plans.map(p => p.start), [start, '2028-02-29', '2028-03-02'])
  assert.deepEqual(plans[0], original[0])
  assert.ok(validCleaningPlans(plans))
  checkDays(plans, start, 60)
  plans = updateCleaningPlans(plans, a, '2028-02-29')
  assert.deepEqual(plans.map(p => p.start), [start, '2028-03-02'])
  checkDays(plans, start, 60)
  const earlier = updateCleaningPlans([original[0]], a, '2028-02-14')
  assert.deepEqual(earlier.map(p => p.start), ['2028-02-14'])
})

test('rejects backup queues that double-book a pupil at a boundary even if each roster is valid on its own', () => {
  const original = updateCleaningPlans([], roster(34, 0), '2026-12-03')
  const copied = { ...original[0], start: '2026-12-04' }
  assert.ok(validCleaningPlans([copied]))
  assert.throws(() => parseBackup({ content: { duty: { cleaningPlans: [...original, copied] } } }), /清洁排班/)
})

test('weekly exports keep cell-shaped names as text and preserve CSV punctuation', () => {
  const rows = [{ date: '2026-12-03', section: { roster: { name: '晚间日常清洁' },
    lines: [{ name: '扫地', names: ['+7', '乙'] }, { name: '拖地', names: ['甲,乙', '丙"丁'] }] } }]
  const result = parseCsvRows(serializeCleaningWeek(rows))
  assert.deepEqual(result[1], ['2026-12-03', '周四', '晚间日常清洁', '扫地', "'+7、乙"])
  assert.equal(result[2].at(-1), '甲,乙、丙"丁')
})

test('UTF-16 Excel text exports and the first worksheet use the same roster fields', async () => {
  const csv = '中文名,性别\r\n甲,女'
  const bytes = Buffer.from('\ufeff' + csv, 'utf16le')
  const strict = { requireComplete: true }
  for (const encoded of [bytes, Buffer.from(bytes).swap16()]) {
    const result = await parseRosterFile('class.csv', encoded, strict)
    assert.deepEqual(result.members[0], { name: '甲', enName: '', gender: 'female' })
  }
  const XLSX = await import('xlsx')
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['姓名', '性别'], ['甲', '女']]), '当前班级')
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['姓名', '性别'], ['乙', '男']]), '其他班级')
  const result = await parseRosterFile('class.xlsx', XLSX.write(workbook, { type: 'buffer' }), strict)
  assert.deepEqual(result.members.map(p => p.name), ['甲'])
})

test('small-file imports work without a worker and respect a dismissed file selection', async () => {
  const { readCleaningRoster } = await import('../src/services/cleaningImport.js')
  const file = new File(['姓名,性别\n甲,女'], 'class.csv')
  const controller = new AbortController()
  assert.equal((await readCleaningRoster(file, controller.signal)).members[0].gender, 'female')
  controller.abort()
  await assert.rejects(readCleaningRoster(file, controller.signal), { name: 'AbortError' })
})
