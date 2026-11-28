<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { useSettingsStore } from '../stores/settings'
import {
  MAX_FLOW_STAGES,
  changeClassroomFlow,
  classroomFlowPresets,
  classroomRemainingMs,
  normalizeClassroomStages,
  readyClassroomFlow,
  restoreClassroomFlow,
  syncClassroomFlow
} from '../services/classroomFlow'

const STORAGE_KEY = 'cytime.classroom-flow.v1'
const settingsStore = useSettingsStore()
const now = ref(Date.now())
const flow = ref(loadFlow())
const editHeading = ref(null)
const liveHeading = ref(null)
const mainAction = ref(null)
const confirmEdit = ref(false)
let nextId = 0
let ticker

function loadFlow() {
  try { return restoreClassroomFlow(JSON.parse(localStorage.getItem(STORAGE_KEY)), now.value) }
  catch { return readyClassroomFlow() }
}

function saveFlow(next) {
  if (flow.value === next) return
  flow.value = next
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch {}
}

function toDraft(stages) {
  return stages.map(stage => ({ id: nextId++, name: stage.name, minutes: Math.floor(stage.seconds / 60), seconds: stage.seconds % 60 }))
}

const draft = ref(toDraft(flow.value.stages))
const plan = computed(() => normalizeClassroomStages(draft.value.map(stage => ({
  name: stage.name,
  seconds: stage.minutes === '' || stage.seconds === '' || !Number.isInteger(stage.minutes) || !Number.isInteger(stage.seconds)
    || stage.minutes < 0 || stage.minutes > 99 || stage.seconds < 0 || stage.seconds > 59
    ? NaN
    : stage.minutes * 60 + stage.seconds
}))))
watch(plan, stages => {
  if (stages && flow.value.status === 'ready') saveFlow(readyClassroomFlow(stages))
})

const current = computed(() => flow.value.stages[flow.value.index])
const after = computed(() => flow.value.stages[flow.value.index + 1])
const remaining = computed(() => classroomRemainingMs(flow.value, now.value))
const display = computed(() => formatSeconds(Math.ceil(remaining.value / 1000)))
const progress = computed(() => (current.value.seconds * 1000 - remaining.value) / (current.value.seconds * 1000))
const statusText = computed(() => {
  if (flow.value.status === 'awaiting') return '时间到 · 等待老师确认'
  if (flow.value.status === 'paused') return '计时已暂停'
  if (flow.value.status === 'complete') return '课堂流程已完成'
  return '计时进行中'
})
const actionText = computed(() => {
  if (flow.value.status === 'running') return '暂停'
  if (flow.value.status === 'paused') return '继续'
  if (flow.value.status === 'awaiting') return after.value ? '开始下一阶段' : '完成流程'
  return '按原流程再来一次'
})

function formatSeconds(seconds) {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

function updateClock() {
  now.value = Date.now()
  saveFlow(syncClassroomFlow(flow.value, now.value))
}

watch(() => flow.value.status, status => {
  const restoreActionFocus = document.activeElement === mainAction.value && status !== 'ready'
  window.clearInterval(ticker)
  if (status === 'running') ticker = window.setInterval(updateClock, 180)
  if (restoreActionFocus) nextTick(() => mainAction.value?.focus())
}, { immediate: true })

onMounted(() => {
  window.addEventListener('focus', updateClock)
  document.addEventListener('visibilitychange', updateClock)
})
onUnmounted(() => {
  window.clearInterval(ticker)
  window.removeEventListener('focus', updateClock)
  document.removeEventListener('visibilitychange', updateClock)
})

function addStage() {
  if (draft.value.length >= MAX_FLOW_STAGES) return
  const id = nextId++
  draft.value.push({ id, name: '', minutes: 3, seconds: 0 })
  nextTick(() => document.getElementById(`flow-name-${id}`)?.focus())
}

function moveStage(index, offset) {
  const next = [...draft.value]
  const destination = index + offset
  if (destination < 0 || destination >= next.length) return
  ;[next[index], next[destination]] = [next[destination], next[index]]
  draft.value = next
}

function removeStage(index) {
  if (draft.value.length <= 1) return
  draft.value.splice(index, 1)
  const stage = draft.value[Math.min(index, draft.value.length - 1)]
  nextTick(() => document.getElementById(`flow-name-${stage.id}`)?.focus())
}

function startFlow() {
  if (!plan.value) return
  now.value = Date.now()
  saveFlow(changeClassroomFlow(readyClassroomFlow(plan.value), 'start', now.value))
  nextTick(() => liveHeading.value?.focus())
}

function change(action) {
  now.value = Date.now()
  saveFlow(changeClassroomFlow(flow.value, action, now.value))
}

function useMainAction() {
  if (flow.value.status === 'running') change('pause')
  else if (flow.value.status === 'paused') change('resume')
  else if (flow.value.status === 'awaiting') change('next')
  else if (flow.value.status === 'complete') startFlow()
}

function editFlow() {
  draft.value = toDraft(flow.value.stages)
  confirmEdit.value = false
  change('reset')
  nextTick(() => editHeading.value?.focus())
}
</script>

<template>
  <section class="classroom-flow-view" :class="{ 'flow-pure': settingsStore.examModeActive, 'flow-live-view': flow.status !== 'ready' }" aria-labelledby="flow-page-title">
    <div class="flow-wrap">
      <header class="flow-header">
        <div>
          <p class="flow-kicker">CLASSROOM FLOW</p>
          <h1 id="flow-page-title" ref="editHeading" tabindex="-1">课堂流程</h1>
          <p class="flow-lead">把一堂课分成几个阶段。每段到时后，由老师决定何时继续。</p>
        </div>
        <RouterLink class="flow-button flow-back" to="/classroom">课堂工具</RouterLink>
      </header>

      <p v-if="flow.status === 'ready' && settingsStore.examModeActive" class="flow-surface flow-empty">退出纯净模式后，可编辑并开始课堂流程。</p>
      <form v-else-if="flow.status === 'ready'" class="flow-surface flow-editor" @submit.prevent="startFlow">
        <div class="flow-preset">
          <h2>从模板开始</h2>
          <div class="flow-preset-choices" role="group" aria-label="课堂流程模板">
            <button v-for="preset in classroomFlowPresets" :key="preset.id" type="button" class="flow-button" @click="draft = toDraft(preset.stages)">{{ preset.title }}</button>
          </div>
        </div>
        <ol class="flow-draft-list" aria-label="编辑课堂阶段">
          <li v-for="(stage, index) in draft" :key="stage.id" class="flow-draft-row">
            <span class="flow-number" aria-hidden="true">{{ String(index + 1).padStart(2, '0') }}</span>
            <label class="flow-name">阶段名称<input :id="`flow-name-${stage.id}`" v-model="stage.name" required maxlength="32" :aria-label="`第 ${index + 1} 阶段名称`" placeholder="例如：分组练习" /></label>
            <div class="flow-duration">
              <label>分<input v-model.number="stage.minutes" type="number" inputmode="numeric" min="0" max="99" required :aria-label="`第 ${index + 1} 阶段分钟`" /></label>
              <label>秒<input v-model.number="stage.seconds" type="number" inputmode="numeric" min="0" max="59" required :aria-label="`第 ${index + 1} 阶段秒数`" /></label>
            </div>
            <div class="flow-order">
              <button type="button" class="flow-button flow-icon" :disabled="index === 0" :aria-label="`上移第 ${index + 1} 阶段`" title="上移" @click="moveStage(index, -1)">↑</button>
              <button type="button" class="flow-button flow-icon" :disabled="index === draft.length - 1" :aria-label="`下移第 ${index + 1} 阶段`" title="下移" @click="moveStage(index, 1)">↓</button>
              <button type="button" class="flow-button flow-icon" :disabled="draft.length === 1" :aria-label="`移除第 ${index + 1} 阶段`" title="移除" @click="removeStage(index)">×</button>
            </div>
          </li>
        </ol>
        <div class="flow-editor-actions">
          <button type="button" class="flow-button" :disabled="draft.length >= MAX_FLOW_STAGES" @click="addStage">＋ 添加阶段</button>
          <span class="flow-duration-note" :class="{ 'flow-invalid': !plan }">{{ plan ? `${plan.length} 个阶段 · 总时长 ${formatSeconds(plan.reduce((sum, stage) => sum + stage.seconds, 0))}` : '请填写每个阶段的名称和大于 0 的时长。' }}</span>
          <button class="flow-button flow-primary" type="submit" :disabled="!plan">开始流程</button>
        </div>
      </form>

      <div v-else class="flow-live" :class="`flow-${flow.status}`">
        <section class="flow-surface flow-timer">
          <p class="flow-status" role="status">{{ statusText }}</p>
          <h2 ref="liveHeading" class="flow-current" tabindex="-1">{{ flow.status === 'complete' ? '全部阶段完成' : current.name }}</h2>
          <template v-if="flow.status !== 'complete'">
            <div class="flow-digits" role="timer" aria-label="当前阶段剩余时间">{{ display }}</div>
            <progress :value="progress" max="1" aria-label="当前阶段进度" />
            <p class="flow-next" v-if="after">下一阶段 · {{ after.name }} <span>{{ formatSeconds(after.seconds) }}</span></p>
            <p class="flow-next" v-else>最后一个阶段</p>
          </template>
          <p v-else class="flow-done">已走完 {{ flow.stages.length }} 个阶段。</p>
          <div class="flow-live-actions">
            <button :key="flow.status" ref="mainAction" type="button" class="flow-button flow-primary" @click="useMainAction">{{ actionText }}</button>
            <button v-if="flow.status === 'running' || flow.status === 'paused'" type="button" class="flow-button" @click="change('next')">{{ after ? '提前进入下一阶段' : '提前完成流程' }}</button>
            <button v-if="!settingsStore.examModeActive" type="button" class="flow-button flow-edit-button" :aria-expanded="confirmEdit" @click="flow.status === 'complete' ? editFlow() : confirmEdit = !confirmEdit">编辑流程</button>
          </div>
          <div v-if="confirmEdit && flow.status !== 'complete' && !settingsStore.examModeActive" class="flow-confirm">
            <p>结束这次计时并返回编辑？阶段顺序和时长会保留。</p>
            <button type="button" class="flow-button" @click="editFlow">结束并编辑</button>
            <button type="button" class="flow-button" @click="confirmEdit = false">取消</button>
          </div>
        </section>
        <aside v-if="!settingsStore.examModeActive" class="flow-surface flow-overview" aria-label="阶段顺序">
          <h2>阶段顺序 <span>{{ flow.index + 1 }} / {{ flow.stages.length }}</span></h2>
          <ol>
            <li v-for="(stage, index) in flow.stages" :key="index" :aria-current="flow.index === index && flow.status !== 'complete' ? 'step' : null" :class="{ 'flow-stage-done': index < flow.index || flow.status === 'complete' }">
              <span class="flow-number" aria-hidden="true">{{ String(index + 1).padStart(2, '0') }}</span>
              <strong>{{ stage.name }}</strong>
              <span class="flow-stage-time">{{ formatSeconds(stage.seconds) }}</span>
            </li>
          </ol>
        </aside>
      </div>
    </div>
  </section>
</template>

<style scoped>
.classroom-flow-view {
  position: absolute;
  inset: var(--content-safe-top, 112px) 0 68px;
  overflow: hidden auto;
  overscroll-behavior: contain;
  padding: 12px clamp(12px, 4vw, 38px) 24px;
  text-align: left;
}
.flow-live-view { display: grid; align-content: safe center; }
.flow-wrap { display: grid; gap: clamp(12px, 2vh, 24px); width: min(100%, 1200px); margin-inline: auto; container: flow-page / inline-size; }
.flow-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; }
.flow-header h1 { margin: 2px 0 4px; font-size: clamp(25px, 4vw, 38px); line-height: 1.15; }
.flow-kicker { margin: 0; color: var(--accent); font-size: 10px; letter-spacing: .14em; }
.flow-lead { margin: .6em 0 0; color: var(--text-secondary); font-size: clamp(12px, 1.4vw, 16px); }
.flow-surface {
  min-width: 0;
  padding: clamp(12px, 2vw, 24px);
  border: 1px solid var(--border-default);
  border-radius: 12px;
  background: color-mix(in srgb, var(--bg-card-solid), transparent 10%);
  box-shadow: var(--shadow-4);
}
.flow-editor { display: grid; gap: 14px; }
.flow-preset, .flow-editor-actions, .flow-preset-choices, .flow-live-actions, .flow-order { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.flow-preset h2, .flow-overview h2 { margin: 0; font-size: 14px; }
.flow-preset h2 { margin-right: 4px; }
.flow-button {
  display: inline-flex;
  justify-content: center;
  align-items: center;
  min-height: 38px;
  padding: 0 11px;
  border: 1px solid var(--border-default);
  border-radius: 7px;
  color: var(--text-primary);
  background: var(--bg-card);
  font: inherit;
  font-size: 13px;
  line-height: 1.25;
  text-decoration: none;
  cursor: pointer;
}
.flow-button:hover:not(:disabled) { border-color: var(--accent); background: var(--bg-hover); }
.flow-button:focus-visible, .flow-draft-row input:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.flow-button:disabled { opacity: .45; cursor: default; }
.flow-primary { border-color: transparent; color: var(--text-on-accent); background: var(--accent); font-weight: 700; }
.flow-primary:hover:not(:disabled) { color: var(--text-on-accent); background: var(--accent-hover); }
.flow-back { flex: 0 0 auto; }
.flow-draft-list, .flow-overview ol { display: grid; gap: 7px; margin: 0; padding: 0; list-style: none; }
.flow-draft-row, .flow-overview li {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  align-items: end;
  gap: 8px;
  min-width: 0;
  padding: 8px;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: var(--bg-card);
}
.flow-number { align-self: center; min-width: 24px; color: var(--accent); font-size: 11px; font-variant-numeric: tabular-nums; text-align: center; }
.flow-name, .flow-duration label { display: grid; gap: 4px; min-width: 0; color: var(--text-secondary); font-size: 11px; }
.flow-duration { display: flex; gap: 6px; }
.flow-draft-row input { width: 100%; min-height: 38px; padding: 0 8px; border: 1px solid var(--border-strong); border-radius: 6px; color: var(--text-primary); background: var(--bg-card-solid); font-size: 15px; }
.flow-duration input { width: 62px; }
.flow-order { flex-wrap: nowrap; gap: 4px; }
.flow-icon { width: 34px; padding: 0; font-size: 17px; }
.flow-duration-note { flex: 1 1 130px; color: var(--text-muted); font-size: 12px; }
.flow-invalid { color: var(--text-secondary); }
.flow-empty { margin: 0; color: var(--text-secondary); }
.flow-live { display: grid; grid-template-columns: minmax(0, 1fr) minmax(195px, .37fr); gap: 12px; align-items: start; }
.flow-timer { display: grid; justify-items: center; gap: 12px; text-align: center; container-type: inline-size; }
.flow-status { margin: 0; padding: 4px 10px; border-radius: 999px; color: var(--text-primary); background: var(--bg-hover); font-weight: 650; font-size: clamp(12px, 1.3vw, 18px); }
.flow-awaiting .flow-timer { border-color: var(--accent); }
.flow-awaiting .flow-status { color: var(--text-on-accent); background: var(--accent); }
.flow-current { max-width: 100%; margin: 0; font-size: clamp(24px, min(4.8vw, 7vh), 64px); line-height: 1.12; overflow-wrap: anywhere; }
.flow-digits { color: var(--clock-text-color, var(--text-primary)); font-family: var(--font-num); font-weight: 600; font-variant-numeric: tabular-nums; font-size: clamp(35px, min(32cqw, calc(var(--stage-height, 100vh) * .20)), 244px); line-height: 1; }
.flow-awaiting .flow-digits { color: var(--accent); }
.flow-timer progress { appearance: none; width: min(100%, 660px); height: 8px; overflow: hidden; border: 0; border-radius: 999px; background: var(--bg-hover); accent-color: var(--accent); }
.flow-timer progress::-webkit-progress-bar { background: var(--bg-hover); }
.flow-timer progress::-webkit-progress-value { background: var(--accent); }
.flow-timer progress::-moz-progress-bar { background: var(--accent); }
.flow-next, .flow-done { margin: 0; color: var(--text-secondary); font-size: clamp(13px, 1.5vw, 20px); overflow-wrap: anywhere; }
.flow-next span { color: var(--text-muted); font-variant-numeric: tabular-nums; }
.flow-live-actions { justify-content: center; }
.flow-live-actions .flow-button { min-height: 44px; }
.flow-overview h2 { display: flex; align-items: baseline; justify-content: space-between; gap: 6px; margin-bottom: 10px; font-size: calc(14px * var(--stage-read-scale, 1)); }
.flow-overview h2 span { color: var(--text-muted); font-size: .8em; font-variant-numeric: tabular-nums; }
.flow-overview li { grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; color: var(--text-secondary); font-size: calc(14px * var(--stage-read-scale, 1)); }
.flow-overview li[aria-current] { border-color: var(--accent); color: var(--text-primary); }
.flow-overview strong { overflow-wrap: anywhere; }
.flow-overview .flow-stage-done { opacity: .64; }
.flow-overview .flow-stage-time { color: var(--text-muted); font-size: .85em; font-variant-numeric: tabular-nums; }
.flow-confirm { display: flex; justify-content: center; align-items: center; flex-wrap: wrap; gap: 6px; width: 100%; padding-top: 10px; border-top: 1px solid var(--border-subtle); }
.flow-confirm p { width: 100%; margin: 0 0 4px; color: var(--text-secondary); font-size: 12px; }
.flow-pure .flow-live { grid-template-columns: minmax(0, 1fr); }
.flow-pure .flow-lead, .flow-pure .flow-kicker { display: none; }
.flow-pure .flow-timer { border-color: transparent; background: transparent; box-shadow: none; }
:global(.app-shell:not(.mini-mode):has(.task-docks.is-compact) .classroom-flow-view) { bottom: var(--board-task-clearance, 150px); }
:global(.app-shell:not(.mini-mode):has(.task-docks-left:not(.is-compact)) .classroom-flow-view) {
  padding-left: calc(var(--stage-gutter, 22px) + var(--task-side-width, 190px) + 12px);
}
:global(.app-shell:not(.mini-mode):has(.task-docks-right:not(.is-compact)) .classroom-flow-view) {
  padding-right: calc(var(--stage-gutter, 22px) + var(--task-side-width, 190px) + 12px);
}
:global(.mini-mode .classroom-flow-view) { inset: max(92px, var(--content-safe-top, 92px)) 0 42px; padding-top: 4px; }
:global(.mini-mode .classroom-flow-view :is(.flow-kicker, .flow-lead, .flow-overview, .flow-next)) { display: none; }
:global(.mini-mode .classroom-flow-view .flow-live) { grid-template-columns: minmax(0, 1fr); }
:global(.mini-mode .classroom-flow-view .flow-timer) { gap: 4px; }
:global(.mini-mode .classroom-flow-view .flow-digits) { font-size: clamp(32px, 14vh, 78px); }
:global(.mini-mode .classroom-flow-view :is(.flow-header h1, .flow-current)) { font-size: 20px; }
@container flow-page (max-width: 720px) {
  .flow-live { grid-template-columns: minmax(0, 1fr); }
}
@container flow-page (max-width: 500px) {
  .flow-draft-row { grid-template-columns: auto minmax(0, 1fr) minmax(0, 1fr); }
  .flow-name { grid-column: 2 / -1; }
  .flow-duration { grid-column: 2; }
  .flow-duration label { flex: 1; }
  .flow-duration input { width: 100%; }
  .flow-order { justify-content: flex-end; }
  .flow-icon { width: 32px; }
}
@media (any-pointer: coarse) {
  .flow-button, .flow-draft-row input { min-height: 44px; }
}
</style>
