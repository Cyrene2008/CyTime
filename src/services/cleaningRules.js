export const periods = ['早上', '上午', '中午', '下午', '晚上']
export const weekOrder = [1, 2, 3, 4, 5, 6, 0]
export const dayNames = ['日', '一', '二', '三', '四', '五', '六']
export const job = (name = '', count = 1, gender = 'any') => ({ name, count, gender })
export const defaultRules = [
  { title: '晚间日常清洁', days: [...weekOrder], time: '晚上', jobs: [job('扫地', 2), job('拖地', 2, 'male')] },
  { title: '周四下午大扫除', days: [4], time: '下午', jobs: [job('扫地', 2), job('拖地', 2, 'male'), job('擦黑板'), job('抹', 1, 'male')] }
]

export function describeDays(days) {
  if (days.length === 7) return '每天'
  if (days.length === 5 && [1, 2, 3, 4, 5].every(d => days.includes(d))) return '周一至周五'
  if (days.length === 2 && days.includes(0) && days.includes(6)) return '周末'
  return '周' + weekOrder.filter(d => days.includes(d)).map(d => dayNames[d]).join('、')
}

export function sectionInfo(rule) {
  const when = describeDays(rule.days) + rule.time
  let id = 'cleaning-' + rule.time + '-' + weekOrder.filter(day => rule.days.includes(day)).join('')
  if (rule.time === '晚上' && rule.days.length === 7) id = 'cleaning-evening'
  if (rule.time === '下午' && rule.days.length === 1 && rule.days[0] === 4) id = 'cleaning-thursday'
  return { id, name: rule.title || when, mode: 'cleaning' }
}

export function checkRules(rules) {
  if (!Array.isArray(rules) || !rules.length) throw new Error('至少需要一个班次')
  const occupied = new Set()
  for (const [i, rule] of rules.entries()) {
    if (!periods.includes(rule?.time) || !Array.isArray(rule.days) || !rule.days.length ||
      rule.days.some(d => !Number.isInteger(d) || d < 0 || d > 6)) throw new Error(`班次 ${i + 1} 需要选择星期和时段`)
    if (typeof rule.title !== 'string') throw new Error('请填写有效的班次名称')
    for (const day of rule.days) {
      const key = day + rule.time
      if (occupied.has(key)) throw new Error(`周${dayNames[day]}${rule.time} 重复，请将同一时段的岗位放进一个班次`)
      occupied.add(key)
    }
    if (!Array.isArray(rule.jobs) || !rule.jobs.length) throw new Error('每个班次至少需要一个岗位')
    const names = new Set()
    for (const role of rule.jobs) {
      if (!role || typeof role.name !== 'string' || !role.name.trim() || role.name !== role.name.trim()) throw new Error('请填写岗位名称')
      if (names.has(role.name)) throw new Error(`同一班次的「${role.name}」重复，请合并人数`)
      names.add(role.name)
      if (!Number.isSafeInteger(role.count) || role.count < 1 || !['any', 'male', 'female'].includes(role.gender)) throw new Error(`请检查「${role.name}」的人数和参与范围`)
    }
  }
  const { total } = weeklyDemand(rules)
  if (!Number.isSafeInteger(total)) throw new Error('每周总人数超出可计算范围')
}

export function weeklyDemand(rules) {
  const sum = { total: 0, male: 0, female: 0, any: 0 }
  for (const rule of rules) for (const role of rule.jobs) {
    const slots = rule.days.length * role.count
    sum.total += slots
    sum[role.gender] += slots
  }
  return sum
}
