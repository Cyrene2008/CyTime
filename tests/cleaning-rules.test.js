import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseCleaningText } from '../src/services/cleaningText.js'
import { weeklyDemand } from '../src/services/cleaningRules.js'
import { cleaningSections, updateCleaningPlans, validCleaningPlans } from '../src/services/cleaning.js'
import { applicableDate, dateAdd, nextDutyDate, weekdayIndex } from '../src/services/duty.js'
import { parseRosterFile } from '../src/utils/dutyRoster.js'

const users = n => ({ members: Array.from({ length: n }, (_, i) => ({ name: '成员' + i, gender: i % 2 ? 'male' : 'female' })) })
const interactive = { requireComplete: true, interactive: true }

test('Chinese weekday ranges, headcounts, explicit gender and global restrictions require complete recognition', () => {
  const rules = parseCleaningText('周一至周五晚上：扫地、拖地各两人。每周四下午：一名女生擦黑板。女生不拖地')
  assert.deepEqual(weeklyDemand(rules), { total: 21, male: 10, female: 1, any: 10 })
  assert.deepEqual(parseCleaningText('周五到周一中午：倒垃圾一人')[0].days, [1, 5, 6, 0])
  assert.deepEqual(parseCleaningText('周一、三上午：2名男生拖地')[0].days, [1, 3])
  for (const line of ['工作日晚上：扫地2人，仅单周', '工作日晚上扫地1人。下雨取消', '每天上午扫地1人。女生不抹', '每天晚上：扫地1人（仅女生）。女生不扫地', '周末上午扫地0人', '每天晚上扫地1人。周四晚上扫地2人']) {
    assert.throws(() => parseCleaningText(line))
  }
})

test('custom rules satisfy every slot, share cooldown and navigate over days without a shift', () => {
  const rules = parseCleaningText('工作日晚上：扫地1人，拖地1人（仅男生）\n周四下午：擦黑板2人（仅女生）')
  const plan = updateCleaningPlans([], users(16), '2027-02-25', rules)
  const duty = { cleaningPlans: plan, rosters: [] }
  assert.equal(nextDutyDate(duty, '2027-02-26', 1), '2027-03-01')
  assert.equal(nextDutyDate(duty, '2027-03-01', -1), '2027-02-26')
  assert.equal(applicableDate(duty, '2027-02-27'), false)
  const last = new Map()
  const people = new Map(users(16).members.map(p => [p.name, p.gender]))
  for (let i = 0; i < 400; i++) {
    const date = dateAdd(plan[0].start, i)
    const sections = cleaningSections(plan, date)
    assert.equal(sections.length, [0,6].includes(weekdayIndex(date)) ? 0 : weekdayIndex(date) === 4 ? 2 : 1)
    for (const s of sections) for (const line of s.lines) {
      assert.equal(line.names.length, line.name === '擦黑板' ? 2 : 1)
      for (const name of line.names) {
        assert.ok(!last.has(name) || i - last.get(name) >= 7)
        if (line.name === '擦黑板') assert.equal(people.get(name), 'female')
        if (line.name === '拖地') assert.equal(people.get(name), 'male')
        last.set(name, i)
      }
    }
  }
  assert.equal(last.size, 16)
})

test('one unrestricted slot rotates through everyone and keeps its history after a rule-only change', () => {
  const input = users(6)
  const start = '2026-12-04'
  const rules = parseCleaningText('周五下午：整理讲台1人')
  const plan = updateCleaningPlans([], input, start, rules)
  const names = Array.from({ length: 6 }, (_, i) => cleaningSections(plan, dateAdd(start, 7*i))[0].lines[0].names[0])
  assert.equal(new Set(names).size, 6)
  rules[0].jobs[0].count = 3
  assert.equal(cleaningSections(plan, start)[0].lines[0].names.length, 1)
  const next = updateCleaningPlans(plan, input, dateAdd(start, 1), parseCleaningText('周末上午：擦桌子1人（仅女生）'))
  assert.ok(validCleaningPlans(next))
  assert.deepEqual(cleaningSections(next, start), cleaningSections(plan, start))
  assert.ok(!cleaningSections(next, dateAdd(start, 1))[0].lines[0].names.includes(names[0]))
})

test('older backups resolve the same assignments and overlapping rule blocks are rejected', () => {
  const current = updateCleaningPlans([], users(44), '2026-11-28')
  const old = structuredClone(current)
  delete old[0].rules
  for (let i=0; i<70; i++) assert.deepEqual(cleaningSections(old,dateAdd(old[0].start,i)),cleaningSections(current,dateAdd(old[0].start,i)))
  assert.ok(validCleaningPlans(old))
  current[0].rules.push(current[0].rules[0])
  assert.equal(validCleaningPlans(current), false)
})

test('recognizes semicolon and tab delimiters, titles, repeated headers, totals, and quoted data', async () => {
  for (const sep of [';', '\t']) {
    const input = ['2027年花名册', ['学生姓名','性别'].join(sep), ['"A,B"','Ｆ'].join(sep),
      ['学生姓名','性别'].join(sep), ['乙','男'].join(sep), ['合计2人',''].join(sep)].join('\r\n')
    const result = await parseRosterFile('class.csv',input,interactive)
    assert.deepEqual(result.members.map(p=>[p.name,p.gender]),[['A,B','female'],['乙','male']])
  }
})

test('maps unfamiliar columns and explicit gender codes, preserves leading zeros and distinguishes repeated names', async () => {
  const input = '学生标签,类别,编号\n甲,2,001\n甲,1,002'
  assert.equal((await parseRosterFile('x.csv',input,interactive)).choice.kind,'columns')
  const mapping = { name:0,gender:1,extra:2,start:2,male:'1',female:'2' }
  const result = await parseRosterFile('x.csv',input,{...interactive,mapping})
  assert.deepEqual(result.members.map(p=>[p.name,p.gender]),[['甲（001）','female'],['甲（002）','male']])
  await assert.rejects(parseRosterFile('x.csv',input,{...interactive,mapping:{...mapping,male:'2'}}), /需同时填写/)
  await assert.rejects(parseRosterFile('x.csv',input+'\n乙,3,003',{...interactive,mapping}), /第 4 行/)
  for (const sep of [';', '\t']) {
    const custom = input.replaceAll(',',sep)
    assert.deepEqual((await parseRosterFile('x.csv',custom,interactive)).choice.used, [0,1,2])
    assert.deepEqual((await parseRosterFile('x.csv',custom,{...interactive,mapping})).members,result.members)
  }
})

test('auto-selects a roster behind a cover or requests the intended class sheet across workbook formats', async () => {
  const XLSX = await import('xlsx')
  for (const [ext,bookType] of [['xlsx','xlsx'],['xls','biff8'],['xlsb','xlsb'],['xlsm','xlsm'],['ods','ods']]) {
    const book = XLSX.utils.book_new()
    for (const [name,rows] of [['封面',[['测试名单']]],['一班',[['名单'],[],['编号','学生姓名','性别'],[1,'甲','女']]]]) {
      XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet(rows),name)
    }
    const bytes = () => XLSX.write(book,{type:'buffer',bookType})
    assert.equal((await parseRosterFile('a.'+ext,bytes(),interactive)).members[0].name,'甲')
    XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['姓名','性别'],['乙','男']]),'二班')
    const data = bytes()
    assert.equal((await parseRosterFile('a.'+ext,data,interactive)).choice.kind,'sheet')
    assert.equal((await parseRosterFile('a.'+ext,data,{...interactive,sheetName:'二班'})).members[0].name,'乙')
  }
})

test('vertical class merges apply only inside their range and mixed classes require explicit selection', async () => {
  const XLSX = await import('xlsx')
  const book = XLSX.utils.book_new()
  const sheet = XLSX.utils.aoa_to_sheet([['班级','姓名','性别'],['一班','甲','女'],[null,'乙','男'],['二班','丙','男']])
  sheet['!merges'] = [XLSX.utils.decode_range('A2:A3')]
  XLSX.utils.book_append_sheet(book,sheet,'学生')
  const bytes = XLSX.write(book,{type:'buffer',bookType:'xlsx'})
  assert.deepEqual((await parseRosterFile('班级.xlsx',bytes,interactive)).choice.classes,['一班','二班'])
  const one = await parseRosterFile('班级.xlsx',bytes,{...interactive,className:'一班'})
  assert.deepEqual(one.members.map(p=>p.name),['甲','乙'])
})

test('adding or removing an identifying column carries over a plain-name duty, while distinct student numbers stay independent', () => {
  const one = name => ({ members: [{ name, gender: 'male' }] })
  const fri = parseCleaningText('周五下午扫地1人')
  const sat = parseCleaningText('周六上午扫地1人')
  for (const [from, to] of [['同学','同学（01）'],['同学（01）','同学']]) {
    const plan = updateCleaningPlans([],one(from),'2026-12-04',fri)
    assert.throws(() => updateCleaningPlans(plan,one(to),'2026-12-05',sat), /交接/)
  }
  const plan = updateCleaningPlans([],one('同学（01）'),'2026-12-04',fri)
  assert.ok(validCleaningPlans(updateCleaningPlans(plan,one('同学（02）'),'2026-12-05',sat)))
})

test('gender-column class lists can have titles, a serial number, uneven lengths and repeated headings', async () => {
  const input = '学生花名册\n序号;女生姓名;男生名单\n1;小甲;小乙\n2;;小丙\n序号;女生姓名;男生名单\n3;;小丁'
  const roster = await parseRosterFile('class.csv', input, interactive)
  assert.deepEqual(roster.members.map(p=>[p.name,p.gender]), [
    ['小乙','male'],['小甲','female'],['小丙','male'],['小丁','male']
  ])
  await assert.rejects(parseRosterFile('class.csv',input+'\n4;小乙;',interactive), /重名/)
})
