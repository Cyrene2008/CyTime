import { serializeCsv } from '../utils/csv.js'
import { weekdayIndex } from './duty.js'

const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

export function serializeDutyPreview(roster, rows, members) {
  const byId = new Map(members.map(member => [member.id, member.name]))
  return serializeCsv([
    ['日期', '星期', '名单', '轮换次数', '任务', '人员', '安排'],
    ...rows.flatMap(row => row.lines.map(line => [
      row.date, weekdays[weekdayIndex(row.date)] || '', roster.name,
      roster.mode === 'manual' ? '' : row.occurrence + 1, line.name,
      line.memberIds.map(id => byId.get(id) || '—').join('、'),
      line.extra ? '临时任务' : line.overridden ? '单日调整' : roster.mode === 'manual' ? '手动指定' : '自动轮换'
    ]))
  ])
}

export function serializeDutyStats(roster, rows) {
  return serializeCsv([
    ['名单', '姓名', '次数', '任务明细'],
    ...rows.map(row => [roster.name, row.member.name, row.total, Object.entries(row.chores).map(([name, count]) => `${name}×${count}`).join(' · ')])
  ])
}
