export function localDateStr(date = new Date()) {
  const year = String(date.getFullYear()).padStart(4, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function parseDate(dateStr) {
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
