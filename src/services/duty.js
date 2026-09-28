export function localDateStr(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function weekdayIndex(dateStr) {
  const [year, month, day] = String(dateStr).split('-').map(Number)
  if (!year || !month || !day) return -1
  return new Date(year, month - 1, day).getDay()
}

export function dateAdd(dateStr, delta) {
  const [year, month, day] = String(dateStr).split('-').map(Number)
  if (!year || !month || !day) return null
  const date = new Date(year, month - 1, day + delta)
  return localDateStr(date)
}

function mod(value, divisor) {
  if (!divisor) return 0
  return ((value % divisor) + divisor) % divisor
}

function rulesPass(duty, roster, dateStr) {
  if (duty.holidays?.includes(dateStr)) return false
  const weekday = weekdayIndex(dateStr)
  if (duty.skipWeekends && (weekday === 0 || weekday === 6)) return false
  if (roster.weekdays?.length && !roster.weekdays.includes(weekday)) return false
  return true
}

export function rosterApplies(duty, roster, dateStr, today = localDateStr()) {
  if (roster.enabled === false) return false
  if (!rulesPass(duty, roster, dateStr)) return false
  if (dateStr <= today) return duty.schoolDays.includes(dateStr)
  return true
}

export function countOccurrences(duty, roster, dateStr, today = localDateStr()) {
  let count = duty.schoolDays.filter(day => day <= dateStr && day <= today && rulesPass(duty, roster, day)).length
  if (dateStr > today) {
    for (let day = dateAdd(today, 1); day && day <= dateStr; day = dateAdd(day, 1)) {
      if (rulesPass(duty, roster, day)) count++
    }
  }
  return count
}

function latestAnchor(duty, roster, dateStr) {
  const anchors = duty.anchors?.[roster.id]
  if (!anchors) return null
  let bestDate = null
  for (const date of Object.keys(anchors)) {
    if (date <= dateStr && (bestDate === null || date > bestDate)) bestDate = date
  }
  if (bestDate === null) return null
  return { date: bestDate, index: Math.max(0, Number(anchors[bestDate]) || 0) }
}

function countBetween(duty, roster, from, to, today) {
  if (!from || from > to) return 0
  let count = 0
  for (const day of duty.schoolDays) {
    if (day >= from && day <= to && day <= today && rulesPass(duty, roster, day)) count++
  }
  if (to > today) {
    for (let day = dateAdd(today, 1); day && day <= to; day = dateAdd(day, 1)) {
      if (day >= from && rulesPass(duty, roster, day)) count++
    }
  }
  return count
}

export function occurrenceIndex(duty, roster, dateStr, today = localDateStr()) {
  const anchor = latestAnchor(duty, roster, dateStr)
  if (anchor) return anchor.index + countBetween(duty, roster, dateAdd(anchor.date, 1), dateStr, today)
  return countOccurrences(duty, roster, dateStr, today) - 1 + (roster.offset || 0)
}

export function applicableDate(duty, dateStr, today = localDateStr()) {
  return (duty.rosters || []).some(roster => rosterApplies(duty, roster, dateStr, today))
}

export function nextDutyDate(duty, from, direction, today = localDateStr()) {
  let guard = 400
  let date = dateAdd(from, direction)
  while (date && guard--) {
    if (applicableDate(duty, date, today)) return date
    date = dateAdd(date, direction)
  }
  return null
}

export function eligiblePool(duty, roster, chore) {
  const ids = chore.queue?.length ? chore.queue : roster.memberIds?.length ? roster.memberIds : duty.members.map(member => member.id)
  const byId = new Map(duty.members.map(member => [member.id, member]))
  let pool = ids.map(id => byId.get(id)).filter(Boolean)
  if (chore.genderRule === 'no-female') pool = pool.filter(member => member.gender !== 'female')
  else if (chore.genderRule === 'no-male') pool = pool.filter(member => member.gender !== 'male')
  return pool
}

export function resolveRosterDay(duty, roster, dateStr, today = localDateStr(), forcedOccurrence = null) {
  const occurrence = forcedOccurrence === null || forcedOccurrence === undefined
    ? occurrenceIndex(duty, roster, dateStr, today)
    : Math.max(0, forcedOccurrence)
  const overrides = duty.overrides?.[dateStr]?.[roster.id] || []
  const used = new Set()
  const lines = []
  for (const chore of roster.chores || []) {
    const override = overrides.find(entry => entry.choreId === chore.id)
    if (override) {
      (override.memberIds || []).forEach(id => used.add(id))
      lines.push({ choreId: chore.id, name: chore.name, memberIds: [...(override.memberIds || [])], overridden: true, extra: false })
      continue
    }
    const slots = Math.max(1, Number(chore.slots) || 1)
    const pool = eligiblePool(duty, roster, chore)
    const start = mod(occurrence * slots + (chore.phase || 0), pool.length)
    const picked = []
    for (let index = 0; index < pool.length && picked.length < slots; index++) {
      const member = pool[(start + index) % pool.length]
      if (chore.noRepeat !== false && used.has(member.id)) continue
      picked.push(member.id)
      used.add(member.id)
    }
    lines.push({ choreId: chore.id, name: chore.name, memberIds: picked, overridden: false, extra: false })
  }
  for (const entry of overrides) {
    if ((roster.chores || []).some(chore => chore.id === entry.choreId)) continue
    (entry.memberIds || []).forEach(id => used.add(id))
    lines.push({ choreId: entry.choreId, name: entry.name || '临时任务', memberIds: [...(entry.memberIds || [])], overridden: true, extra: true })
  }
  return { occurrence, lines }
}

export function resolveDay(duty, dateStr, today = localDateStr()) {
  return (duty.rosters || [])
    .filter(roster => rosterApplies(duty, roster, dateStr, today))
    .map(roster => ({ roster, ...resolveRosterDay(duty, roster, dateStr, today) }))
}

export function dutyStats(duty, roster, from, to = localDateStr()) {
  const stats = new Map(duty.members.map(member => [member.id, { total: 0, chores: {} }]))
  const today = localDateStr()
  let guard = 400
  for (let day = from; day && day <= to && guard--; day = dateAdd(day, 1)) {
    if (!rosterApplies(duty, roster, day, today)) continue
    const { lines } = resolveRosterDay(duty, roster, day, today)
    for (const line of lines) {
      for (const memberId of line.memberIds) {
        const entry = stats.get(memberId)
        if (!entry) continue
        entry.total++
        entry.chores[line.name] = (entry.chores[line.name] || 0) + 1
      }
    }
  }
  return stats
}
