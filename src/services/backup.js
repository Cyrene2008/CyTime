import { validCleaningPlans } from './cleaning.js'
import { migrateQuoteSettings } from './quoteEndpoints.js'

import { lessonTimeToSeconds, scheduleWeekTypes } from './schedule.js'

const record = value => Boolean(value && typeof value === 'object' && !Array.isArray(value))
const own = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key)
const clone = value => JSON.parse(JSON.stringify(value))

export const backupGroups = [
  { id: 'settings', label: '外观与设置', section: 'settings' },
  { id: 'importantDays', label: '重要日', fields: ['importantDays'] },
  { id: 'schedule', label: '课程表', fields: ['schedule', 'scheduleWeekOne'] },
  { id: 'homework', label: '作业与历史', fields: ['homework', 'homeworkHistory', 'homeworkSubjectPresets', 'homeworkTemplates'] },
  { id: 'duty', label: '值日名单', fields: ['duty'] },
  { id: 'quotes', label: '本地语录', fields: ['quotes', 'quoteMetadata', 'flameJourneyQuotes', 'universityMottos'] },
  { id: 'notepad', label: '记事板', fields: ['notepad'] },
  { id: 'time', label: '计时任务', section: 'time' }
]

function requireValue(valid, label) {
  if (!valid) throw new Error(`备份中的${label}格式有误`)
}
function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
}
function validTime(value) { return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value) }
function validStamp(value) {
  if (value === '') return true
  if (typeof value !== 'string') return false
  const [date, time] = value.split('T')
  return validDate(date) && (time === undefined || /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(time))
}

export function parseBackup(input) {
  let value
  try { value = typeof input === 'string' ? JSON.parse(input.replace(/^\uFEFF/, '')) : clone(input) }
  catch { throw new Error('无法读取备份，请检查文件格式') }
  if (!record(value) || !['settings', 'content', 'time'].some(key => record(value[key]))) throw new Error('这不是 CyTime 备份文件')
  for (const section of ['settings', 'content', 'time']) {
    if (own(value, section)) requireValue(record(value[section]), '数据')
  }
  const settings = value.settings || {}
  if (own(settings, 'displayLayout')) requireValue(['auto', 'desktop', 'classroom'].includes(settings.displayLayout), '显示场景')
  for (const key of ['theme', 'fontFamily', 'background', 'startupMode', 'startupWindowMode']) {
    if (own(settings, key)) requireValue(typeof settings[key] === 'string' && settings[key].length > 0, '设置')
  }
  if (own(settings, 'accentColor')) requireValue(typeof settings.accentColor === 'string', '主题色')
  if (own(settings, 'quoteApiCategories')) requireValue(Array.isArray(settings.quoteApiCategories) && settings.quoteApiCategories.every(item => typeof item === 'string'), '语录分类')
  for (const key of ['quoteSources', 'quoteLocalSources', 'quoteApiCategoryWeights']) {
    if (!own(settings, key)) continue
    requireValue(record(settings[key]), '语录设置')
    if (key !== 'quoteApiCategoryWeights') requireValue(Object.values(settings[key]).every(record), '语录来源')
  }
  const content = value.content || {}
  for (const key of ['importantDays', 'schedule', 'homework', 'homeworkHistory', 'quotes', 'flameJourneyQuotes', 'universityMottos', 'homeworkSubjectPresets']) {
    if (own(content, key)) requireValue(Array.isArray(content[key]), '内容')
  }
  if (own(content, 'notepad')) requireValue(typeof content.notepad === 'string', '记事板')
  if (own(content, 'scheduleWeekOne')) requireValue(content.scheduleWeekOne === '' || validDate(content.scheduleWeekOne), '课表第 1 周')
  for (const key of ['quoteMetadata', 'homeworkTemplates']) {
    if (own(content, key)) requireValue(record(content[key]), '内容')
  }
  for (const day of content.importantDays || []) requireValue(record(day) && typeof day.name === 'string' && validDate(day.date), '重要日')
  for (const lesson of content.schedule || []) {
    requireValue(record(lesson) && typeof lesson.subject === 'string' && Number.isInteger(lesson.weekday) && lesson.weekday >= 0 && lesson.weekday <= 6 && validTime(lesson.startAt) && validTime(lesson.endAt) && lessonTimeToSeconds(lesson.startAt) < lessonTimeToSeconds(lesson.endAt), '课程表')
    if (own(lesson, 'weeks')) requireValue(own(scheduleWeekTypes, lesson.weeks), '课程周次')
    for (const key of ['teacher', 'simplifiedName']) if (own(lesson, key)) requireValue(typeof lesson[key] === 'string', '课程信息')
  }
  for (const item of [...(content.homework || []), ...(content.homeworkHistory || [])]) {
    requireValue(record(item) && typeof item.content === 'string' && (!own(item, 'startAt') || validStamp(item.startAt)) && (!own(item, 'dueAt') || validStamp(item.dueAt)), '作业')
  }
  for (const key of ['quotes', 'flameJourneyQuotes', 'universityMottos']) {
    for (const quote of content[key] || []) requireValue(typeof quote === 'string' || (record(quote) && typeof quote.text === 'string'), '语录')
  }
  if (own(content, 'duty')) {
    const duty = content.duty
    requireValue(record(duty), '值日名单')
    for (const key of ['members', 'rosters', 'schoolDays', 'activeDays', 'holidays']) {
      if (own(duty, key)) requireValue(Array.isArray(duty[key]), '值日名单')
    }
    if (own(duty, 'cleaningPlans')) requireValue(validCleaningPlans(duty.cleaningPlans), '清洁排班')
    for (const member of duty.members || []) requireValue(record(member) && typeof member.id === 'string' && typeof member.name === 'string', '成员名单')
    for (const roster of duty.rosters || []) {
      requireValue(record(roster) && typeof roster.id === 'string' && typeof roster.name === 'string' && Array.isArray(roster.chores), '值日任务')
      if (own(roster, 'memberIds')) requireValue(Array.isArray(roster.memberIds) && roster.memberIds.every(item => typeof item === 'string'), '参与人员')
      if (own(roster, 'weekdays')) requireValue(Array.isArray(roster.weekdays) && roster.weekdays.every(day => Number.isInteger(day) && day >= 0 && day <= 6), '适用星期')
      for (const chore of roster.chores) {
        requireValue(record(chore) && typeof chore.id === 'string' && typeof chore.name === 'string', '值日任务')
        if (own(chore, 'queue')) requireValue(Array.isArray(chore.queue) && chore.queue.every(item => typeof item === 'string'), '值日顺序')
      }
    }
    requireValue([...(duty.schoolDays || []), ...(duty.activeDays || []), ...(duty.holidays || [])].every(validDate), '在校日')
    if (own(duty, 'freezeUnstartedDays')) requireValue(typeof duty.freezeUnstartedDays === 'boolean', '轮换规则')
    if (own(duty, 'rotationPolicyStart')) requireValue(validDate(duty.rotationPolicyStart), '轮换规则')
    if (own(duty, 'startupFreezeRules')) requireValue(record(duty.startupFreezeRules) && Object.entries(duty.startupFreezeRules).every(([date, enabled]) => validDate(date) && typeof enabled === 'boolean'), '轮换规则')
    for (const key of ['overrides', 'anchors']) if (own(duty, key)) requireValue(record(duty[key]), '值日调整')
  }
  const time = value.time || {}
  for (const key of ['countdowns', 'timers']) {
    if (!own(time, key)) continue
    requireValue(Array.isArray(time[key]), '计时任务')
    for (const task of time[key]) {
      requireValue(record(task) && typeof task.id === 'string' && ['running', 'paused', 'completed', 'stopped'].includes(task.status), '计时任务')
      const numberKey = key === 'countdowns' ? 'targetAt' : 'elapsed'
      requireValue(typeof task[numberKey] === 'number' && Number.isFinite(task[numberKey]) && task[numberKey] >= 0, '计时任务')
      if (key === 'timers' && task.status === 'running') requireValue(Number.isFinite(task.startedAt), '计时任务')
    }
  }
  if (!availableBackupGroups(value).length) throw new Error('备份中没有可恢复的内容')
  return value
}

export function availableBackupGroups(backup) {
  return backupGroups.filter(group => group.section ? own(backup, group.section) : group.fields.some(field => own(backup.content, field)))
}

export function backupGroupDetail(group, backup) {
  const content = backup.content || {}
  if (group.id === 'settings') return '主题、显示与偏好'
  if (group.id === 'homework') return `${content.homework?.length || 0} 项作业 · ${content.homeworkHistory?.length || 0} 项历史`
  if (group.id === 'duty') {
    const plan = content.duty?.cleaningPlans?.at(-1)
    const base = `${content.duty?.members?.length || 0} 人 · ${content.duty?.rosters?.length || 0} 份名单`
    return plan ? `${base} · 清洁排班 ${plan.male.length + plan.female.length} 人` : base
  }
  if (group.id === 'time') return `${backup.time?.countdowns?.length || 0} 个倒计时 · ${backup.time?.timers?.length || 0} 个计时器`
  if (group.id === 'notepad') return content.notepad ? '已保存笔记' : '空白笔记'
  if (group.id === 'quotes') return `${content.quotes?.length || 0} 条日常语录`
  return `${content[group.id]?.length || 0} 项`
}

export function createBackup(snapshot, appVersion = '') {
  return { ...clone(snapshot), app: 'CyTime', version: 3, appVersion, exportedAt: new Date().toISOString() }
}

export function prepareBackupRestore(current, backup, selected) {
  const selectedIds = new Set(selected)
  const groups = availableBackupGroups(backup).filter(group => selectedIds.has(group.id))
  if (!groups.length) throw new Error('请选择要恢复的内容')
  const updates = {}
  const removeKeys = []
  let content = null
  for (const group of groups) {
    if (group.id === 'settings') {
      const restored = clone(backup.settings)
      const previous = clone(current.settings || {})
      const hasQuoteEndpoint = settings => ['quoteApiRevision', 'quoteApiEndpoint', 'quoteSources', 'quoteCloudSource'].some(key => own(settings, key))
      updates['cytime.settings.v2'] = {
        ...(hasQuoteEndpoint(previous) ? migrateQuoteSettings(previous) : previous),
        ...(hasQuoteEndpoint(restored) ? migrateQuoteSettings(restored) : restored)
      }
      removeKeys.push('cytime.settings.v1')
    } else if (group.id === 'time') {
      updates['cytime.time-state.v1'] = { ...clone(current.time || {}), ...clone(backup.time) }
    } else {
      content ||= clone(current.content || {})
      for (const field of group.fields) if (own(backup.content, field)) content[field] = clone(backup.content[field])
      if (group.id === 'schedule' && own(backup.content, 'schedule') && !own(backup.content, 'scheduleWeekOne')) content.scheduleWeekOne = ''
    }
  }
  if (content) updates['cytime.content.v1'] = content
  return { updates, removeKeys }
}
