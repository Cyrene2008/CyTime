export function localDateStr(date = new Date()) {
  const year = String(date.getFullYear()).padStart(4, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseDate(dateStr) {
  if (typeof dateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null
  const [year, month, day] = dateStr.split('-').map(Number)
  const date = new Date(0)
  date.setFullYear(year, month - 1, day)
  date.setHours(0, 0, 0, 0)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null
}

export function isDateString(dateStr) { return Boolean(parseDate(dateStr)) }

export function weekdayIndex(dateStr) {
  return parseDate(dateStr)?.getDay() ?? -1
}

export function dateAdd(dateStr, delta) {
  const date = parseDate(dateStr)
  if (!date || !Number.isFinite(Number(delta))) return null
  date.setDate(date.getDate() + Math.trunc(Number(delta)))
  const result = localDateStr(date)
  return isDateString(result) ? result : null
}

function mod(value, divisor) {
  if (!divisor) return 0
  return ((value % divisor) + divisor) % divisor
}

function integer(value) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(Number.MIN_SAFE_INTEGER, Math.min(Number.MAX_SAFE_INTEGER, Math.trunc(number))) : 0
}

export function normalizeSlots(value) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(1, Math.min(Number.MAX_SAFE_INTEGER, Math.round(number))) : 1
}

function rulesPass(duty, roster, dateStr) {
  if (duty.holidays?.includes(dateStr)) return false
  const weekday = weekdayIndex(dateStr)
  if (weekday < 0) return false
  if (duty.skipWeekends && (weekday === 0 || weekday === 6)) return false
  if (roster.weekdays?.length && !roster.weekdays.includes?.(weekday)) return false
  return true
}

export function rosterApplies(duty, roster, dateStr, today = localDateStr()) {
  if (roster.enabled === false) return false
  if (!rulesPass(duty, roster, dateStr)) return false
  if (dateStr <= today) {
    const timeline = startupTimeline(duty)
    if (!timeline || dateStr < timeline[0].date) return duty.schoolDays.includes(dateStr)
    const policy = timeline.filter(entry => entry.date <= dateStr).at(-1)
    return policy.required ? duty.schoolDays.includes(dateStr) && (duty.activeDays || []).includes(dateStr) : true
  }
  return true
}

function startupTimeline(duty) {
  if (!isDateString(duty.rotationPolicyStart)) return null
  const changes = Object.entries(duty.startupFreezeRules || {}).filter(([date, required]) => isDateString(date) && date >= duty.rotationPolicyStart && typeof required === 'boolean')
  const initial = changes.length ? false : Boolean(duty.freezeUnstartedDays)
  const entries = new Map([[duty.rotationPolicyStart, initial], ...changes])
  return [...entries].sort(([a], [b]) => a.localeCompare(b)).map(([date, required]) => ({ date, required }))
}

function pastRotationDates(duty, roster, today) {
  const schoolDays = [...new Set(duty.schoolDays)].filter(day => day <= today && rulesPass(duty, roster, day)).sort()
  const timeline = startupTimeline(duty)
  if (!timeline) return schoolDays
  const result = new Set(schoolDays.filter(day => day < timeline[0].date))
  const activeDays = new Set(duty.activeDays || [])
  timeline.forEach((entry, index) => {
    const next = timeline[index + 1]?.date
    const end = next && next <= today ? dateAdd(next, -1) : today
    if (entry.date > end) return
    if (entry.required) {
      for (const day of schoolDays) if (day >= entry.date && day <= end && activeDays.has(day)) result.add(day)
    } else {
      for (let day = entry.date; day && day <= end; day = dateAdd(day, 1)) if (rulesPass(duty, roster, day)) result.add(day)
    }
  })
  return [...result].sort()
}

function countRulesInRange(duty, roster, from, to) {
  const start = parseDate(from)
  const end = parseDate(to)
  if (!start || !end || from > to) return 0
  const selected = roster.weekdays?.length
    ? Array.isArray(roster.weekdays) ? roster.weekdays : typeof roster.weekdays === 'string' ? [...roster.weekdays].filter(value => /^[0-6]$/.test(value)).map(Number) : []
    : [0, 1, 2, 3, 4, 5, 6]
  const weekdays = new Set(selected.filter(day => Number.isInteger(day) && day >= 0 && day <= 6))
  if (duty.skipWeekends) { weekdays.delete(0); weekdays.delete(6) }
  const ordinal = date => {
    const utc = new Date(0)
    utc.setUTCFullYear(date.getFullYear(), date.getMonth(), date.getDate())
    utc.setUTCHours(0, 0, 0, 0)
    return Math.floor(utc.getTime() / 86400000)
  }
  const days = ordinal(end) - ordinal(start) + 1
  let count = Math.floor(days / 7) * weekdays.size
  for (let index = 0; index < days % 7; index++) if (weekdays.has((start.getDay() + index) % 7)) count++
  for (const holiday of new Set(duty.holidays || [])) {
    if (holiday >= from && holiday <= to && weekdays.has(weekdayIndex(holiday))) count--
  }
  return count
}

export function countOccurrences(duty, roster, dateStr, today = localDateStr()) {
  if (!isDateString(dateStr) || !isDateString(today)) return 0
  return createOccurrenceResolver(duty, roster, today).countAt(dateStr)
}

function latestAnchor(duty, roster, dateStr) {
  const anchors = duty.anchors?.[roster.id]
  if (!anchors) return null
  let bestDate = null
  for (const date of Object.keys(anchors)) {
    if (isDateString(date) && date <= dateStr && (bestDate === null || date > bestDate)) bestDate = date
  }
  if (bestDate === null) return null
  return { date: bestDate, index: Math.max(0, integer(anchors[bestDate])) }
}

function countBetween(duty, roster, from, to, today) {
  if (!from || from > to) return 0
  const resolver = createOccurrenceResolver(duty, roster, today)
  return resolver.countAt(to) - resolver.countAt(dateAdd(from, -1))
}

export function occurrenceIndex(duty, roster, dateStr, today = localDateStr()) {
  if (!isDateString(dateStr)) return -1
  const anchor = latestAnchor(duty, roster, dateStr)
  if (anchor) return anchor.index + countBetween(duty, roster, dateAdd(anchor.date, 1), dateStr, today)
  return countOccurrences(duty, roster, dateStr, today) - 1 + integer(roster.offset)
}

function upperBound(dates, target) {
  let low = 0
  let high = dates.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if (dates[middle] <= target) low = middle + 1
    else high = middle
  }
  return low
}

export function createOccurrenceResolver(duty, roster, today = localDateStr()) {
  const dates = pastRotationDates(duty, roster, today)
  const anchors = duty.anchors?.[roster.id] || {}
  const anchorDates = Object.keys(anchors).filter(isDateString).sort()
  const countThrough = date => isDateString(date) ? upperBound(dates, date) + (date > today ? countRulesInRange(duty, roster, dateAdd(today, 1), date) : 0) : 0
  return {
    dates,
    countAt: countThrough,
    indexAt(date) {
      if (!isDateString(date)) return -1
      const anchorDate = anchorDates[upperBound(anchorDates, date) - 1]
      return anchorDate
        ? Math.max(0, integer(anchors[anchorDate])) + countThrough(date) - countThrough(anchorDate)
        : countThrough(date) - 1 + integer(roster.offset)
    }
  }
}

export function setStartupRotationPolicy(duty, enabled, date = localDateStr()) {
  if (!isDateString(date)) return
  duty.activeDays = [...new Set([...(duty.activeDays || []), date])].filter(isDateString).sort()
  duty.schoolDays = [...new Set([...duty.schoolDays, date])].filter(isDateString).sort()
  const snapshots = (duty.rosters || []).filter(roster => roster.mode !== 'manual').map(roster => ({ id: roster.id, index: Math.max(0, occurrenceIndex(duty, roster, date, date)) }))
  if (!isDateString(duty.rotationPolicyStart) || duty.rotationPolicyStart > date) duty.rotationPolicyStart = date
  const rules = { ...(duty.startupFreezeRules || {}) }
  if (typeof rules[duty.rotationPolicyStart] !== 'boolean') rules[duty.rotationPolicyStart] = Boolean(duty.freezeUnstartedDays)
  rules[date] = Boolean(enabled)
  duty.freezeUnstartedDays = Boolean(enabled)
  duty.startupFreezeRules = rules
  duty.anchors ||= {}
  for (const snapshot of snapshots) {
    duty.anchors[snapshot.id] ||= {}
    duty.anchors[snapshot.id][date] = snapshot.index
  }
}

export function applicableDate(duty, dateStr, today = localDateStr()) {
  return (duty.rosters || []).some(roster => rosterApplies(duty, roster, dateStr, today))
}

export function nextRosterDate(duty, roster, from, direction, today = localDateStr()) {
  if (!isDateString(from) || ![1, -1].includes(direction) || roster.enabled === false) return null
  if (direction > 0 && from < today) {
    const next = pastRotationDates(duty, roster, today).find(day => day > from)
    if (next) return next
    from = today
  }
  let guard = 400
  let date = dateAdd(from, direction)
  while (date && date > today && guard--) {
    if (rulesPass(duty, roster, date)) return date
    date = dateAdd(date, direction)
  }
  if (direction < 0) return pastRotationDates(duty, roster, today).filter(day => day < from).at(-1) || null
  return null
}

export function nextDutyDate(duty, from, direction, today = localDateStr()) {
  const dates = (duty.rosters || []).map(roster => nextRosterDate(duty, roster, from, direction, today)).filter(Boolean).sort()
  return (direction < 0 ? dates.at(-1) : dates[0]) || null
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
  const manual = roster.mode === 'manual'
  const occurrence = manual ? 0 : forcedOccurrence === null || forcedOccurrence === undefined
    ? occurrenceIndex(duty, roster, dateStr, today)
    : integer(forcedOccurrence)
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
    if (manual) {
      lines.push({ choreId: chore.id, name: chore.name, memberIds: [], overridden: false, extra: false })
      continue
    }
    const slots = normalizeSlots(chore.slots)
    const pool = eligiblePool(duty, roster, chore)
    const start = mod(mod(occurrence, pool.length) * mod(slots, pool.length) + mod(integer(chore.phase), pool.length), pool.length)
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
  if (roster.enabled === false || !isDateString(from) || !isDateString(to) || from > to) return stats
  const resolver = createOccurrenceResolver(duty, roster, today)
  const countDay = day => {
    const { lines } = resolveRosterDay(duty, roster, day, today, resolver.indexAt(day))
    for (const line of lines) {
      for (const memberId of line.memberIds) {
        const entry = stats.get(memberId)
        if (!entry) continue
        entry.total++
        entry.chores[line.name] = (entry.chores[line.name] || 0) + 1
      }
    }
  }
  for (const day of resolver.dates) if (day >= from && day <= to) countDay(day)
  if (to > today) {
    for (let day = from > today ? from : dateAdd(today, 1); day && day <= to; day = dateAdd(day, 1)) {
      if (rulesPass(duty, roster, day)) countDay(day)
    }
  }
  return stats
}
