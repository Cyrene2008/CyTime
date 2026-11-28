import { dateAdd, isDateString, weekdayIndex } from '../utils/dutyDate.js'
import { checkRules, defaultRules, periods, sectionInfo, weeklyDemand } from './cleaningRules.js'

export function cleaningPlanOn(plans, date) {
  if (!plans?.length || !isDateString(date)) return null
  let low = 0
  let high = plans.length
  while (low < high) {
    const mid = Math.floor((low + high) / 2)
    if (plans[mid].start <= date) low = mid + 1
    else high = mid
  }
  return plans[low - 1] ?? null
}

function weekDays(start, rules) {
  const first = weekdayIndex(start)
  return Array.from({ length: 7 }, (_, i) => {
    const sessions = rules.filter(rule => rule.days.includes((first + i) % 7))
      .sort((a, b) => periods.indexOf(a.time) - periods.indexOf(b.time))
    const slots = { total: 0, open: 0, female: 0, sessions }
    for (const rule of sessions) for (const role of rule.jobs) {
      slots.total += role.count
      if (role.gender === 'any') slots.open += role.count
      if (role.gender === 'female') slots.female += role.count
    }
    return slots
  })
}

export function nextCleaningDate(plans, from, direction) {
  if (!plans?.length || !isDateString(from) || ![1, -1].includes(direction)) return null
  let cursor = dateAdd(from, direction)
  while (cursor) {
    if (cursor < plans[0].start) {
      if (direction < 0) return null
      cursor = plans[0].start
    }
    const plan = cleaningPlanOn(plans, cursor)
    const weekday = weekdayIndex(cursor)
    if ((plan.rules || defaultRules).some(rule => rule.days.includes(weekday))) return cursor
    cursor = dateAdd(cursor, direction)
  }
  return null
}

function bounded(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

// Keep the feasible range of cumulative female assignments for each day.
// At a roster change, a returning pupil may still be resting for part of week one.
function allocateWeek(days, male, female, available, start, demand) {
  let total = 0
  let open = 0
  let required = 0
  const ranges = [{ low: 0, high: 0, open: 0, required: 0 }]
  for (const [day, slots] of days.entries()) {
    total += slots.total
    open += slots.open
    required += slots.female
    const previous = ranges.at(-1)
    const ready = names => names.reduce((n, name) => n + Number((available.get(name) ?? 0) <= day), 0)
    const low = Math.max(previous.low + slots.female, total - ready(male))
    const high = Math.min(previous.high + slots.open + slots.female, ready(female))
    if (low > high) throw new Error(`${dateAdd(start, day)} 交接时已休满六天的人数不足，请调整生效日期或增加人员。`)
    ranges.push({ low, high, open, required })
  }
  const share = Math.round(demand.total * female.length / (male.length + female.length))
  const target = bounded(share, Number(female.length > 0), demand.total - Number(male.length > 0))
  const weekly = bounded(target, ranges[7].low, ranges[7].high)
  let assigned = weekly
  const counts = Array(7)
  for (let day = 6; day >= 0; day--) {
    const before = ranges[day]
    const previous = bounded(before.required + Math.round(before.open * (weekly - demand.female) / (demand.any || 1)),
      Math.max(before.low, assigned - days[day].open - days[day].female), Math.min(before.high, assigned - days[day].female))
    counts[day] = assigned - previous
    assigned = previous
  }
  return counts
}

function rosterGroups(members) {
  const groups = { male: [], female: [] }
  const seen = new Set()
  for (const person of members) {
    const name = person.name.trim()
    if (!name) continue
    if (seen.has(name)) throw new Error('名单有重名，请用姓名加学号区分后再导入')
    if (!['male', 'female'].includes(person.gender)) throw new Error(`请补全「${name}」的性别后再导入`)
    seen.add(name)
    groups[person.gender].push(name)
  }
  return groups
}

function sameMembers(plan, groups) {
  return plan && ['male', 'female'].every(key => {
    const last = new Set(plan[key])
    return last.size === groups[key].length && groups[key].every(person => last.has(person))
  })
}

function firstAvailableDays(plans, start, members) {
  const available = new Map()
  const labeled = new Map()
  const plainName = name => name.match(/^(.+)（[^（）]+）$/)?.[1]
  for (let offset = -6; offset < 0; offset++) {
    for (const section of cleaningSections(plans, dateAdd(start, offset))) {
      for (const line of section.lines) for (const person of line.names) {
        available.set(person, offset + 7)
        const base = plainName(person)
        if (base) labeled.set(base, offset + 7)
      }
    }
  }
  // When an import first adds (or removes) student numbers, a previous plain name
  // can refer to any of its namesakes. Give each possible match the full rest period.
  const previous = new Map(available)
  for (const name of members) {
    const base = plainName(name)
    const inherited = base ? previous.get(base) : labeled.get(name)
    if (inherited) available.set(name, Math.max(inherited, previous.get(name) || 0))
  }
  return available
}

function samePlan(plan, groups, rules) {
  return sameMembers(plan, groups) && JSON.stringify(plan.rules || defaultRules) === JSON.stringify(rules)
}

function appendPlan(plans, groups, name, start, rules) {
  if (samePlan(plans.at(-1), groups, rules)) return
  const demand = weeklyDemand(rules)
  const size = groups.male.length + groups.female.length
  if (size < demand.total || groups.male.length < demand.male || groups.female.length < demand.female) {
    throw new Error(`每周需要至少 ${demand.total} 人，其中男生至少 ${demand.male} 人、女生至少 ${demand.female} 人。当前共 ${size} 人，男生 ${groups.male.length} 人、女生 ${groups.female.length} 人。`)
  }
  const available = firstAvailableDays(plans, start, [...groups.male, ...groups.female])
  const byReleaseDay = (a, b) => (available.get(a) || 0) - (available.get(b) || 0)
  const male = [...groups.male].sort(byReleaseDay)
  const female = [...groups.female].sort(byReleaseDay)
  const days = weekDays(start, rules)
  const plan = { name, start, male, female, rules }
  if (demand.any === demand.total) {
    // A single unrestricted position must rotate through both groups, even in a small class.
    let f = 0
    let m = 0
    plan.order = Array.from({ length: size }, (_, i) =>
      Math.round((i + 1) * female.length / size) > f ? female[f++] : male[m++]).sort(byReleaseDay)
    let filled = 0
    for (const [day, slots] of days.entries()) {
      filled += slots.total
      if (filled && (available.get(plan.order[filled - 1]) || 0) > day) throw new Error(`${dateAdd(start, day)} 交接时可值日人数不足`)
    }
  } else {
    plan.femaleSlots = allocateWeek(days, male, female, available, start, demand)
  }
  plans.push(plan)
}

export function updateCleaningPlans(plans, roster, start, rules = cleaningPlanOn(plans, start)?.rules || defaultRules) {
  if (!isDateString(start)) throw new Error('请选择有效的生效日期')
  checkRules(rules)
  // Store a detached snapshot so later form edits cannot alter historical dates.
  rules = rules.map(rule => ({
    title: rule.title, days: [...rule.days], time: rule.time,
    jobs: rule.jobs.map(({ name, count, gender }) => ({ name, count, gender }))
  }))
  const groups = rosterGroups(roster.members)
  if (samePlan(cleaningPlanOn(plans, start), groups, rules)) return plans
  const next = plans.filter(plan => plan.start < start)
  appendPlan(next, groups, roster.name || '清洁名单', start, rules)
  // Inserting an earlier change can move the last duty of someone in a later roster.
  for (const plan of plans) if (plan.start > start) appendPlan(next, plan, plan.name, plan.start, plan.rules || defaultRules)
  return next
}

export function validCleaningPlans(plans) {
  if (!Array.isArray(plans)) return false
  const valid = plans.every((p, i) => {
    if (!p || !isDateString(p.start) || (i && plans[i - 1].start >= p.start) || typeof p.name !== 'string') return false
    if (![p.male, p.female].every(group => Array.isArray(group) && group.every(name => typeof name === 'string' && name.length > 0 && name === name.trim()))) return false
    const names = [...p.male, ...p.female]
    layouts.delete(p)
    const unique = new Set(names)
    if (unique.size !== names.length) return false
    const rules = p.rules === undefined ? defaultRules : p.rules
    try { checkRules(rules) } catch { return false }
    const demand = weeklyDemand(rules)
    if (demand.any === demand.total) {
      return unique.size >= demand.total && Array.isArray(p.order) && p.order.length === names.length &&
        new Set(p.order).size === names.length && p.order.every(name => unique.has(name))
    }
    if (!Array.isArray(p.femaleSlots) || p.femaleSlots.length !== 7 || p.order !== undefined) return false
    const days = weekDays(p.start, rules)
    if (!p.femaleSlots.every((n, day) => Number.isInteger(n) && n >= days[day].female && n <= days[day].open + days[day].female)) return false
    const female = p.femaleSlots.reduce((a, b) => a + b, 0)
    return female <= p.female.length && demand.total - female <= p.male.length
  })
  if (!valid) return false
  // A backup may contain valid weeks that conflict at a handover. Check only
  // the dates actually in force, including changes less than a week apart.
  return plans.every((plan, i) => {
    if (i === 0) return true
    const available = firstAvailableDays(plans, plan.start, [...plan.male, ...plan.female])
    for (let day = 0; day < 6; day++) {
      const date = dateAdd(plan.start, day)
      if (!date || (plans[i + 1] && date >= plans[i + 1].start)) break
      for (const section of cleaningSections(plans, date)) {
        if (section.lines.some(line => line.names.some(name => available.get(name) > day))) return false
      }
    }
    return true
  })
}

// Plan versions are immutable. Cache seven offsets, independent of roster size or date range.
const layouts = new WeakMap()
function layoutOf(plan) {
  let layout = layouts.get(plan)
  if (layout) return layout
  let total = 0
  let females = 0
  const days = weekDays(plan.start, plan.rules || defaultRules).map((day, i) => {
    const count = plan.femaleSlots?.[i] || 0
    const result = { ...day, before: total, beforeFemale: females, freeFemale: count - day.female }
    total += day.total
    females += count
    return result
  })
  layout = { days, total, females }
  layouts.set(plan, layout)
  return layout
}

// Each rolling seven-day window consumes the same number of entries per queue.
// Queue lengths cover that window, so a name cannot repeat in it. Offsets allow
// direct access to any date without replaying past days or storing future rows.
export function cleaningSections(plans, date) {
  const plan = cleaningPlanOn(plans, date)
  if (!plan) return []
  const elapsed = (Date.parse(date) - Date.parse(plan.start)) / 86400000
  const week = Math.floor(elapsed / 7)
  const day = elapsed % 7
  const layout = layoutOf(plan)
  const { sessions, open, freeFemale, before, beforeFemale } = layout.days[day]
  if (!sessions.length) return []
  let cursor = week * layout.total + before
  let nextFemale = week * layout.females + beforeFemale
  let nextMale = cursor - nextFemale
  let openIndex = 0
  function pick(gender) {
    if (plan.order) return plan.order[cursor++ % plan.order.length]
    if (gender === 'any') {
      const index = (openIndex++ + week) % open
      gender = Math.floor((index + 1) * freeFemale / open) > Math.floor(index * freeFemale / open) ? 'female' : 'male'
    }
    return gender === 'female' ? plan.female[nextFemale++ % plan.female.length] : plan.male[nextMale++ % plan.male.length]
  }
  return sessions.map(rule => ({
    roster: sectionInfo(rule),
    lines: rule.jobs.map(role => ({
      choreId: role.name, name: role.name, names: Array.from({ length: role.count }, () => pick(role.gender))
    }))
  }))
}
