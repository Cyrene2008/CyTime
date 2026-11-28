const dayMs = 86400000

function dayNumber(value) {
  // 日期已经按本地日历确定；转成 UTC 日序仅用于求差，避免夏令时影响。
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return NaN
  const time = Date.parse(`${value}T00:00:00Z`)
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? time / dayMs : NaN
}

export function isImportantDate(value) {
  return Number.isFinite(dayNumber(value))
}

export function normalizeImportantDay(item) {
  const name = typeof item?.name === 'string' ? item.name.trim() : ''
  if (!name || !isImportantDate(item.date)) return null
  return { name, date: item.date, recurring: item.recurring === true, pinned: item.pinned === true }
}

export function normalizeImportantDays(items) {
  if (!Array.isArray(items)) return []
  const reserved = new Set(items.map(item => item?.id).filter(id => typeof id === 'string' && id.trim()))
  const used = new Set()
  return items.flatMap((item, index) => {
    const normalized = normalizeImportantDay(item)
    if (!normalized) return []
    let id = item.id
    if (!reserved.has(id) || used.has(id)) {
      const base = `day-legacy-${index + 1}`
      id = base
      for (let suffix = 2; reserved.has(id) || used.has(id); suffix++) id = `${base}-${suffix}`
    }
    used.add(id)
    return [{ ...item, ...normalized, id }]
  })
}

function annualDate(year, monthDay) {
  const candidate = `${String(year).padStart(4, '0')}-${monthDay}`
  return monthDay === '02-29' && !isImportantDate(candidate) ? `${candidate.slice(0, 4)}-02-28` : candidate
}

export function importantDayOccurrence(item, today) {
  const todayNumber = dayNumber(today)
  if (!Number.isFinite(todayNumber) || !isImportantDate(item?.date)) return null
  let occurrenceDate = item.date
  if (item.recurring === true) {
    const year = Math.max(Number(today.slice(0, 4)), Number(item.date.slice(0, 4)))
    const monthDay = item.date.slice(5)
    occurrenceDate = annualDate(year, monthDay)
    if (occurrenceDate < today) {
      if (year === 9999) return null
      occurrenceDate = annualDate(year + 1, monthDay)
    }
  }
  const days = dayNumber(occurrenceDate) - todayNumber
  return { ...item, occurrenceDate, days }
}

export function groupImportantDays(items, today) {
  const upcoming = []
  const past = []
  for (const item of items) {
    const occurrence = importantDayOccurrence(item, today)
    if (occurrence) (occurrence.days < 0 ? past : upcoming).push(occurrence)
  }
  upcoming.sort((a, b) => a.days - b.days || Number(b.pinned === true) - Number(a.pinned === true))
  past.sort((a, b) => b.days - a.days)
  return { upcoming, past }
}

export function importantDayPreviews(upcoming) {
  const pinned = upcoming.filter(item => item.days === 0 && item.pinned === true)
  return pinned.length ? pinned : upcoming
}

export function importantDayStatus(days) {
  if (days === 0) return '今天'
  if (days < 0) return `已过去 ${-days} 天`
  return `还有 ${days} 天`
}
