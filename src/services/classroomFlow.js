export const MAX_FLOW_STAGES = 8

export const classroomFlowPresets = [
  { id: 'think-share', title: '思考 · 讨论 · 分享', stages: [
    { name: '独立思考', seconds: 180 }, { name: '小组讨论', seconds: 300 }, { name: '全班分享', seconds: 240 }
  ] },
  { id: 'practice', title: '课堂练习', stages: [
    { name: '讲解要求', seconds: 120 }, { name: '独立练习', seconds: 600 }, { name: '核对答案', seconds: 180 }
  ] },
  { id: 'review', title: '复习 · 小测 · 讲评', stages: [
    { name: '回顾知识', seconds: 300 }, { name: '随堂小测', seconds: 600 }, { name: '集中讲评', seconds: 300 }
  ] }
]

export function normalizeClassroomStages(stages) {
  if (!Array.isArray(stages) || stages.length < 1 || stages.length > MAX_FLOW_STAGES) return null
  const result = []
  for (const stage of stages) {
    const name = typeof stage?.name === 'string' ? stage.name.trim() : ''
    const seconds = stage?.seconds
    if (!name || name.length > 32 || !Number.isInteger(seconds) || seconds < 1 || seconds > 5999) return null
    result.push({ name, seconds })
  }
  return result
}

export function readyClassroomFlow(stages = classroomFlowPresets[0].stages) {
  return { stages: normalizeClassroomStages(stages) || normalizeClassroomStages(classroomFlowPresets[0].stages), index: 0, status: 'ready' }
}

function withStatus(flow, status, index = flow.index, fields = {}) {
  return { stages: flow.stages, index, status, ...fields }
}

export function syncClassroomFlow(flow, now) {
  if (flow.status === 'running' && flow.deadline <= now) return withStatus(flow, 'awaiting')
  return flow
}

export function restoreClassroomFlow(saved, now) {
  const stages = normalizeClassroomStages(saved?.stages)
  if (!stages) return readyClassroomFlow()
  const { index, status, deadline, pausedMs } = saved
  if (!Number.isInteger(index) || index < 0 || index >= stages.length) return readyClassroomFlow(stages)
  const flow = { stages, index, status }
  if (status === 'running' && Number.isFinite(deadline) && deadline > 0) {
    return syncClassroomFlow({ ...flow, deadline }, now)
  }
  if (status === 'paused' && Number.isFinite(pausedMs) && pausedMs > 0) {
    return { ...flow, pausedMs: Math.min(pausedMs, stages[index].seconds * 1000) }
  }
  if (status === 'awaiting' || (status === 'complete' && index === stages.length - 1)) return flow
  return readyClassroomFlow(stages)
}

export function classroomRemainingMs(flow, now) {
  if (flow.status === 'running') return Math.max(0, Math.min(flow.stages[flow.index].seconds * 1000, flow.deadline - now))
  if (flow.status === 'paused') return flow.pausedMs
  return 0
}

export function changeClassroomFlow(current, action, now) {
  const flow = syncClassroomFlow(current, now)
  const start = (index, duration = flow.stages[index].seconds * 1000) => withStatus(flow, 'running', index, { deadline: now + duration })
  switch (action) {
    case 'start':
      return flow.status === 'ready' ? start(0) : flow
    case 'pause':
      return flow.status === 'running' ? withStatus(flow, 'paused', flow.index, { pausedMs: classroomRemainingMs(flow, now) }) : flow
    case 'resume':
      return flow.status === 'paused' ? start(flow.index, flow.pausedMs) : flow
    case 'next':
      if (!['running', 'paused', 'awaiting'].includes(flow.status)) return flow
      return flow.index + 1 < flow.stages.length ? start(flow.index + 1) : withStatus(flow, 'complete')
    case 'reset':
      return withStatus(flow, 'ready', 0)
    default:
      return flow
  }
}
