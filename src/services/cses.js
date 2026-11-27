import { parseDocument, stringify } from 'yaml'
import { byLessonTime, normalizeScheduleLesson, scheduleWeekdays, scheduleWeekTypes } from './schedule.js'

const csesTime = /^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const nonblank = value => typeof value === 'string' && value.trim().length > 0
const subjectFields = ['teacher', 'room', 'simplified_name']

export function parseCsesSchedule(text) {
  let data
  try {
    const yaml = parseDocument(text, { schema: 'core', stringKeys: true })
    if (yaml.errors.length || yaml.warnings.length) throw yaml.errors[0] || yaml.warnings[0]
    data = yaml.toJS({ maxAliasCount: 20 })
  } catch (error) {
    const position = error.linePos?.[0]
    throw new Error(position ? `CSES YAML 第 ${position.line} 行格式有误` : 'CSES YAML 格式有误')
  }
  if (!record(data)) throw new Error('CSES 文件格式有误')
  if (data.version !== 1) throw new Error('目前支持 CSES v1，请从原应用导出 v1 课表')
  if (!Array.isArray(data.subjects) || !Array.isArray(data.schedules)) {
    throw new Error('CSES 需要包含科目列表（subjects）和课表列表（schedules）')
  }
  const subjects = new Map()
  for (const [index, subject] of data.subjects.entries()) {
    if (!record(subject) || !nonblank(subject.name) || subjectFields.some(field => subject[field] !== undefined && typeof subject[field] !== 'string')) {
      throw new Error(`CSES 科目列表第 ${index + 1} 项格式有误`)
    }
    if (subjects.has(subject.name)) throw new Error(`CSES 科目名称重复：${subject.name}`)
    subjects.set(subject.name, subject)
  }
  const lessons = []
  for (const [index, schedule] of data.schedules.entries()) {
    const location = `CSES 第 ${index + 1} 个日课表`
    if (!record(schedule) || typeof schedule.name !== 'string') throw new Error(`${location}缺少名称`)
    if (!Number.isInteger(schedule.enable_day) || schedule.enable_day < 1 || schedule.enable_day > 7) {
      throw new Error(`${location}的上课星期（enable_day）必须为 1 至 7`)
    }
    if (typeof schedule.weeks !== 'string' || !Object.hasOwn(scheduleWeekTypes, schedule.weeks)) throw new Error(`${location}的周次规则（weeks）有误`)
    if (!Array.isArray(schedule.classes)) throw new Error(`${location}缺少课程列表（classes）`)
    for (const [classIndex, item] of schedule.classes.entries()) {
      const position = `${location}第 ${classIndex + 1} 节课`
      if (!record(item) || !subjects.has(item.subject)) throw new Error(`${position}引用了未定义的科目`)
      if (typeof item.start_time !== 'string' || typeof item.end_time !== 'string' || !csesTime.test(item.start_time) || !csesTime.test(item.end_time)) {
        throw new Error(`${position}的时间须为 HH:MM:SS`)
      }
      if (item.start_time >= item.end_time) throw new Error(`${position}的下课时间须晚于上课时间`)
      const subject = subjects.get(item.subject)
      lessons.push({
        weekday: schedule.enable_day % 7,
        weeks: schedule.weeks,
        startAt: item.start_time,
        endAt: item.end_time,
        subject: nonblank(subject['x-cytime-name']) ? subject['x-cytime-name'] : subject.name,
        room: subject.room || '',
        ...(subject.teacher ? { teacher: subject.teacher } : {}),
        ...(subject.simplified_name ? { simplifiedName: subject.simplified_name } : {})
      })
    }
  }
  return lessons
}

const withSeconds = time => time.length === 5 ? `${time}:00` : time

export function serializeSchedule(entries) {
  const lessons = entries.map(normalizeScheduleLesson).sort(byLessonTime)
  const subjectNames = new Set(lessons.map(lesson => lesson.subject))
  const represented = new Set()
  const variants = new Map()
  const subjects = []
  const schedules = new Map()
  for (const lesson of lessons) {
    const { subject, room, teacher, simplifiedName } = lesson
    const variant = JSON.stringify([subject, room || '', teacher || '', simplifiedName || ''])
    if (!variants.has(variant)) {
      let name = subject
      // CSES binds location and teacher to a subject. Distinct names keep each variant portable.
      if (represented.has(subject)) {
        name = `${subject}（${room || teacher || simplifiedName || '其他安排'}）`
        for (let suffix = 2; subjectNames.has(name); suffix++) name = `${subject}（${suffix}）`
        subjectNames.add(name)
      }
      represented.add(subject)
      variants.set(variant, name)
      subjects.push({
        name,
        ...(simplifiedName ? { simplified_name: simplifiedName } : {}),
        ...(teacher ? { teacher } : {}),
        ...(room ? { room } : {}),
        ...(name !== subject ? { 'x-cytime-name': subject } : {})
      })
    }
    const weeks = lesson.weeks || 'all'
    const key = `${lesson.weekday}-${weeks}`
    if (!schedules.has(key)) {
      schedules.set(key, {
        name: `${scheduleWeekdays[lesson.weekday]}${weeks === 'all' ? '' : ` · ${scheduleWeekTypes[weeks]}`}`,
        enable_day: lesson.weekday || 7,
        weeks,
        classes: []
      })
    }
    schedules.get(key).classes.push({ subject: variants.get(variant), start_time: withSeconds(lesson.startAt), end_time: withSeconds(lesson.endAt) })
  }
  return stringify({ version: 1, subjects, schedules: [...schedules.values()] }, { lineWidth: 0, compat: 'yaml-1.1' })
}
