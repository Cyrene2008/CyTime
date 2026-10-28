import { serializeCsv } from '../utils/csv.js'
import { formatDate, formatClock } from '../utils/time.js'

export const MAX_TIMER_LAPS = 1000

export function normalizeTimerLaps(input) {
  const laps = []
  const ids = new Set()
  for (const value of Array.isArray(input) ? input : []) {
    const elapsed = Number(value?.elapsed)
    const previous = laps.at(-1)?.elapsed || 0
    if (!Number.isFinite(elapsed) || elapsed <= previous) continue
    const originalId = typeof value.id === 'string' ? value.id : `lap-${laps.length + 1}`
    let id = originalId
    let suffix = laps.length + 1
    while (ids.has(id)) id = `${originalId}-${suffix++}`
    ids.add(id)
    laps.push({ id, elapsed, split: elapsed - previous, at: Number.isFinite(Number(value.at)) ? Number(value.at) : 0 })
    if (laps.length === MAX_TIMER_LAPS) break
  }
  return laps
}

export function createTimerLap(laps, elapsed, at = Date.now()) {
  const previous = laps.at(-1)?.elapsed || 0
  if (laps.length >= MAX_TIMER_LAPS || !Number.isFinite(elapsed) || elapsed <= previous) return null
  return { id: `lap-${at}-${laps.length + 1}`, elapsed, split: elapsed - previous, at }
}

export function formatLapDuration(value) {
  const seconds = Number(value)
  const total = Number.isFinite(seconds) ? Math.floor(Math.max(0, seconds) * 100 + 1e-7) : 0
  const pad = number => String(number).padStart(2, '0')
  return `${pad(Math.floor(total / 360000))}:${pad(Math.floor(total / 6000) % 60)}:${pad(Math.floor(total / 100) % 60)}.${pad(total % 100)}`
}

export function serializeTimerLaps(task) {
  return serializeCsv([
    ['序号', '分段用时', '累计用时', '记录时间', '任务'],
    ...normalizeTimerLaps(task.laps).map((lap, index) => {
      const date = new Date(lap.at)
      const timestamp = lap.at > 0 && Number.isFinite(date.getTime()) ? `${formatDate(date)} ${formatClock(date)}` : ''
      return [index + 1, formatLapDuration(lap.split), formatLapDuration(lap.elapsed), timestamp, task.label || '计时器']
    })
  ])
}
