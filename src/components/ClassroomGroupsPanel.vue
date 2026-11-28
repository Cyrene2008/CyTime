<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { drawGroups, formatGroups, planGroupSizes, readGroupRoster } from '../services/classroomGroups'
import { useContentStore } from '../stores/content'

const contentStore = useContentStore()
const source = ref('')
const mode = ref('count')
const count = ref(null)
const size = ref(5)
const result = ref(null)
const drawCount = ref(0)
const confirmImport = ref(false)
const importNotice = ref('')
const copyNotice = ref('')
const manualCopy = ref(false)
const resultOnly = ref(false)
const rosterField = ref(null)
const resultsHeading = ref(null)
const copyField = ref(null)

const roster = computed(() => readGroupRoster(source.value))
const total = computed(() => roster.value.people.length)
const dutyNames = computed(() => readGroupRoster(contentStore.content.duty.members.map(member => member?.name || '').join('\n')).people.map(person => person.name))
const quantity = computed({
  get: () => mode.value === 'count' ? count.value ?? Math.min(4, Math.max(1, total.value)) : size.value,
  set: value => { if (mode.value === 'count') count.value = value; else size.value = value }
})
const plannedSizes = computed(() => planGroupSizes(total.value, mode.value, quantity.value))
const draftKey = computed(() => JSON.stringify([roster.value.people.map(person => person.name), mode.value, Number(quantity.value)]))
const stale = computed(() => result.value && result.value.key !== draftKey.value)
const inputError = computed(() => {
  if (!total.value || plannedSizes.value.length) return ''
  if (mode.value === 'count') return `请输入 1 到 ${total.value} 之间的整数作为小组数。`
  return '每组人数上限须为大于 0 的整数。'
})
const groupSummary = computed(() => {
  const [largest] = plannedSizes.value
  const smallest = plannedSizes.value.at(-1)
  return largest ? `预计 ${plannedSizes.value.length} 组 · 每组 ${largest === smallest ? largest : `${smallest}–${largest}`} 人` : ''
})
const resultText = computed(() => result.value ? formatGroups(result.value.groups) : '')

watch(draftKey, () => { copyNotice.value = ''; manualCopy.value = false })

function requestRosterImport() {
  if (!dutyNames.value.length) return
  if (dutyNames.value.join('\n') === roster.value.people.map(person => person.name).join('\n')) {
    importNotice.value = '当前内容已是值日名单。'
  } else if (total.value) {
    confirmImport.value = true
  } else {
    applyRosterImport()
  }
}

function applyRosterImport() {
  source.value = dutyNames.value.join('\n')
  confirmImport.value = false
  importNotice.value = `已填入 ${dutyNames.value.length} 位值日成员。`
  rosterField.value?.focus()
}

function clearImportNotice() {
  confirmImport.value = false
  importNotice.value = ''
}

async function generate(moveFocus = false) {
  const groups = drawGroups(roster.value.people, mode.value, quantity.value)
  if (!groups.length) return
  result.value = { key: draftKey.value, total: total.value, groups }
  drawCount.value++
  copyNotice.value = ''
  manualCopy.value = false
  if (moveFocus) {
    await nextTick()
    resultsHeading.value?.focus()
  }
}

async function toggleResultOnly() {
  resultOnly.value = !resultOnly.value
  await nextTick()
  if (resultOnly.value) resultsHeading.value?.scrollIntoView({ block: 'nearest' })
  else rosterField.value?.focus()
}

async function copyResult() {
  if (!result.value || stale.value) return
  const snapshot = result.value
  try {
    await navigator.clipboard.writeText(resultText.value)
    if (result.value !== snapshot || stale.value) return
    manualCopy.value = false
    copyNotice.value = '分组结果已复制。'
  } catch {
    if (result.value !== snapshot || stale.value) return
    copyNotice.value = '无法直接访问剪贴板，已选中文本，可手动复制。'
    manualCopy.value = true
    await nextTick()
    copyField.value?.focus()
    copyField.value?.select()
  }
}
</script>

<template>
  <section class="groups-panel" aria-labelledby="grouping-heading">
    <header class="groups-heading">
      <div>
        <h2 id="grouping-heading">随机分组</h2>
        <p>适合课堂讨论、合作学习和实验排组。</p>
      </div>
    </header>
    <div class="groups-workspace" :class="{ 'result-only': resultOnly }">
      <form v-show="!resultOnly" id="groups-editor" class="surface-panel groups-form" novalidate @submit.prevent="generate(true)">
        <div class="group-title-row">
          <label for="groups-roster">参与名单</label>
          <span class="group-count">{{ total }} 人</span>
        </div>
        <textarea id="groups-roster" ref="rosterField" v-model="source" rows="5" spellcheck="false" aria-describedby="groups-roster-help" placeholder="例如：&#10;张同学&#10;李同学&#10;王同学" @input="clearImportNotice"></textarea>
        <p id="groups-roster-help" class="groups-help">每行填一个姓名，空行会自动略过。</p>
        <button type="button" class="subtle-button group-import" :disabled="!dutyNames.length" @click="requestRosterImport">导入值日名单</button>
        <p v-if="!dutyNames.length" class="groups-help import-status">值日管理里还没有成员，可直接粘贴名单。</p>
        <p v-else-if="importNotice" class="groups-help import-status" role="status">{{ importNotice }}</p>
        <div v-if="confirmImport" class="group-note">
          <p>填入 {{ dutyNames.length }} 位值日成员将替换当前名单。</p>
          <div class="group-actions">
            <button type="button" class="subtle-button" @click="applyRosterImport">替换当前名单</button>
            <button type="button" class="subtle-button" @click="confirmImport = false">取消</button>
          </div>
        </div>
        <p v-if="roster.duplicateNames" class="group-note" role="status">有 {{ roster.duplicateNames }} 个姓名重复。请核对名单；分组会保留每一条，按出现顺序标为「同名 1」「同名 2」等。</p>

        <fieldset class="group-mode">
          <legend>分组方式</legend>
          <label :class="{ selected: mode === 'count' }"><input v-model="mode" type="radio" name="grouping-mode" value="count" />固定组数</label>
          <label :class="{ selected: mode === 'size' }"><input v-model="mode" type="radio" name="grouping-mode" value="size" />按每组人数</label>
        </fieldset>
        <label class="group-quantity" for="groups-quantity">{{ mode === 'count' ? '小组数量' : '每组人数上限' }}</label>
        <input id="groups-quantity" v-model.number="quantity" type="number" min="1" :max="mode === 'count' && total ? total : undefined" step="1" inputmode="numeric" :aria-invalid="inputError ? 'true' : undefined" aria-describedby="groups-plan" />
        <p id="groups-plan" class="groups-help" :class="{ 'group-note': inputError }" aria-live="polite">{{ inputError || groupSummary || '填入名单后，可预览每组人数。' }}</p>
        <button type="submit" class="save-button group-start" :disabled="!plannedSizes.length">{{ result ? '按当前设置分组' : '开始分组' }}</button>
      </form>

      <div class="surface-panel groups-result">
        <div class="group-result-head">
          <div>
            <h3 ref="resultsHeading" tabindex="-1">分组结果</h3>
            <p v-if="result" class="groups-help" role="status">第 {{ drawCount }} 次分组 · {{ result.total }} 人 / {{ result.groups.length }} 组</p>
          </div>
          <div v-if="result" class="group-actions">
            <button type="button" class="subtle-button" :disabled="!plannedSizes.length" @click="generate()">重新分组</button>
            <button type="button" class="subtle-button" :disabled="stale" @click="copyResult">复制结果</button>
            <button type="button" class="subtle-button" :aria-expanded="!resultOnly" aria-controls="groups-editor" @click="toggleResultOnly">{{ resultOnly ? '返回编辑' : '放大结果' }}</button>
          </div>
        </div>
        <div v-if="!result" class="groups-empty">
          <span class="groups-empty-mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
          <p>还没有分组结果</p>
          <small>填入名单并选择分组方式后，点击「开始分组」。</small>
        </div>
        <template v-else>
          <p v-if="stale" class="group-note" role="status">名单或分组方式已修改。重新分组后可复制新结果。</p>
          <p v-else-if="copyNotice" class="groups-help copy-status" role="status">{{ copyNotice }}</p>
          <label v-if="manualCopy" class="group-copy-field">分组结果文本<textarea ref="copyField" rows="4" readonly :value="resultText"></textarea></label>
          <ol class="group-grid" role="list" aria-label="小组名单">
            <li v-for="(group, i) in result.groups" :key="i" class="group-card">
              <div class="group-title-row"><h4>第 {{ i + 1 }} 组</h4><span class="group-count">{{ group.length }} 人</span></div>
              <ul role="list"><li v-for="person in group" :key="person.id">{{ person.label }}</li></ul>
            </li>
          </ol>
        </template>
      </div>
    </div>
  </section>
</template>

<style scoped>
.groups-panel { min-width: 0; container-type: inline-size; color: var(--text-primary); text-align: start; }
.groups-heading { margin: 0 0 14px; }
.groups-heading h2, .group-result-head h3, .group-card h4 { margin: 0; }
.groups-heading h2 { font-size: clamp(20px, 2.5vw, 29px); }
.groups-heading p, .groups-help { margin: 4px 0 0; color: var(--text-secondary); font-size: 12px; line-height: 1.55; }
.groups-workspace { display: grid; gap: 14px; }
.groups-form, .groups-result { min-width: 0; padding: clamp(13px, 2vw, 21px); }
.groups-form { display: grid; align-content: start; gap: 6px; }
.groups-form label, .group-mode legend, .group-copy-field { font-size: 13px; font-weight: 600; }
.groups-form textarea, .groups-form input[type='number'], .group-copy-field textarea { box-sizing: border-box; min-width: 0; width: 100%; padding: 8px 10px; border: 1px solid var(--border-strong); border-radius: 7px; color: var(--text-primary); background: var(--bg-card-solid); font: inherit; font-size: 14px; line-height: 1.45; }
.groups-form textarea, .group-copy-field textarea { resize: vertical; min-height: 78px; }
.groups-form :is(textarea, input):focus-visible, .group-copy-field textarea:focus-visible, .groups-panel button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.group-import, .group-start { justify-self: start; margin-top: 4px; }
.group-import[disabled], .group-start[disabled], .groups-result button[disabled] { opacity: .5; cursor: default; }
.group-title-row, .group-result-head { display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: 7px 12px; }
.group-count { flex: none; border-radius: 999px; padding: 2px 8px; color: var(--accent); background: var(--accent-50); font-size: 12px; font-weight: 600; }
.group-note { margin: 5px 0 1px; border-inline-start: 2px solid var(--accent); padding: 6px 8px; border-radius: 4px; color: var(--text-secondary); background: var(--accent-50); font-size: 12px; line-height: 1.55; }
.group-note p { margin: 0 0 5px; }
.group-mode { display: flex; flex-wrap: wrap; gap: 6px; min-width: 0; margin: 8px 0 4px; padding: 0; border: 0; }
.group-mode legend { margin-bottom: 5px; padding: 0; }
.group-mode label { display: inline-flex; align-items: center; gap: 6px; min-height: 36px; padding: 0 8px; border: 1px solid var(--border-default); border-radius: 7px; color: var(--text-secondary); font-weight: 500; cursor: pointer; }
.group-mode label.selected { border-color: var(--accent); color: var(--accent); background: var(--accent-50); }
.group-mode input { margin: 0; accent-color: var(--accent); }
.group-quantity { margin-top: 2px; }
.groups-form input[type='number'] { max-width: 118px; min-height: 38px; }
.group-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; }
.groups-panel .subtle-button, .groups-panel .save-button { min-height: 38px; font-size: 12px; }
.group-result-head { align-items: flex-start; }
.group-result-head h3 { font-size: 18px; scroll-margin-block-start: 12px; }
.groups-empty { display: grid; justify-items: center; gap: 5px; margin-top: 15px; padding: 24px 12px; border: 1px dashed var(--border-strong); border-radius: 8px; color: var(--text-secondary); text-align: center; }
.groups-empty p { margin: 2px 0 0; font-weight: 600; }
.groups-empty small { color: var(--text-muted); font-size: 12px; line-height: 1.5; }
.groups-empty-mark { display: grid; grid-template-columns: repeat(2, 8px); gap: 4px; margin-bottom: 4px; }
.groups-empty-mark i { width: 8px; height: 8px; border: 1px solid var(--accent); border-radius: 2px; background: var(--accent-50); }
.group-copy-field { display: grid; gap: 4px; margin-top: 8px; }
.group-grid, .group-card ul { display: grid; gap: 8px; margin: 12px 0 0; padding: 0; list-style: none; }
.group-grid { grid-template-columns: repeat(auto-fit, minmax(min(100%, 150px), 1fr)); align-items: start; }
.group-card { min-width: 0; padding: 11px 12px; border: 1px solid var(--border-default); border-radius: 8px; background: color-mix(in srgb, var(--bg-card-solid), var(--accent) 5%); }
.group-card h4 { font-size: 15px; }
.group-card ul { gap: 4px; margin-top: 8px; color: var(--text-primary); font-size: clamp(15px, 1.6vw, 21px); line-height: 1.4; overflow-wrap: anywhere; }
.group-card li + li { border-block-start: 1px solid var(--border-subtle); padding-block-start: 4px; }
@container (min-width: 720px) { .groups-workspace { grid-template-columns: minmax(230px, 290px) minmax(0, 1fr); align-items: start; } }
.groups-workspace.result-only { grid-template-columns: minmax(0, 1fr); }
.result-only .group-grid { grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr)); }
.result-only .group-card h4 { font-size: calc(16px * var(--stage-read-scale, 1)); }
.result-only .group-card .group-count { font-size: calc(12px * var(--stage-read-scale, 1)); }
.result-only .group-card ul { font-size: clamp(19px, 2.2vw, 30px); }
@media (pointer: coarse) { .groups-panel .subtle-button, .groups-panel .save-button, .group-mode label { min-height: 44px; } }
</style>
