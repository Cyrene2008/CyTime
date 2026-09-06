const pad = value => String(value).padStart(2, '0')

export function formatClock(date, showSeconds = true) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}${showSeconds ? `:${pad(date.getSeconds())}` : ''}`
}

export function formatDate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function formatDuration(totalSeconds) {
  const seconds = Math.max(0, Math.floor(Number(totalSeconds) || 0))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainder = seconds % 60
  return hours > 0 ? `${pad(hours)}:${pad(minutes)}:${pad(remainder)}` : `${pad(minutes)}:${pad(remainder)}`
}

function dateFromDigits(digits, now) {
  const year = Number(digits.slice(0, 4))
  const month = Number(digits.slice(4, 6)) - 1
  const day = Number(digits.slice(6, 8))
  const hour = Number(digits.slice(8, 10))
  const minute = Number(digits.slice(10, 12))
  const second = digits.length === 14 ? Number(digits.slice(12, 14)) : 0
  if (hour > 23 || minute > 59 || second > 59) return null
  const target = new Date(year, month, day, hour, minute, second, 0)
  if (target.getFullYear() !== year || target.getMonth() !== month || target.getDate() !== day) return null
  return target
}

export function parseCountdownTarget(input, now = new Date()) {
  const digits = String(input ?? '').replace(/\D/g, '')
  if (![4, 6, 12, 14].includes(digits.length)) return null

  if (digits.length >= 12) {
    const target = dateFromDigits(digits, now)
    return target && target > now ? target.getTime() : null
  }

  const hour = Number(digits.slice(0, 2))
  const minute = Number(digits.slice(2, 4))
  const second = digits.length === 6 ? Number(digits.slice(4, 6)) : 0
  if (hour > 23 || minute > 59 || second > 59) return null
  const target = new Date(now)
  target.setHours(hour, minute, second, 0)
  if (target <= now) target.setDate(target.getDate() + 1)
  return target.getTime()
}

export function dayProgress(date = new Date()) {
  const start = new Date(date)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return ((date.getTime() - start.getTime()) / (end.getTime() - start.getTime())) * 100
}
