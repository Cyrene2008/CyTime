<script setup>
import { computed, onScopeDispose, ref, shallowRef, watch } from 'vue'
import CleaningRuleEditor from './CleaningRuleEditor.vue'
import CleaningImportChoice from './CleaningImportChoice.vue'
import { defaultRules, describeDays, sectionInfo, weeklyDemand } from '../services/cleaningRules'
import { fileNamePart } from '../utils/csv'
import { useContentStore } from '../stores/content'
import { useTimeStore } from '../stores/time'
import { readCleaningRoster } from '../services/cleaningImport'
import { dateAdd, isDateString, localDateStr, weekdayIndex } from '../utils/dutyDate'
import { cleaningPlanOn, cleaningSections, updateCleaningPlans } from '../services/cleaning'
import { chooseAndSaveFile } from '../services/desktop'
import { serializeCleaningWeek } from '../services/dutyExport'

const store = useContentStore()
const plans = computed(() => store.content.duty.cleaningPlans || [])
const latest = computed(() => plans.value.at(-1))
const timeStore = useTimeStore()
const today = computed(() => localDateStr(new Date(timeStore.now)))
const currentPlan = computed(() => cleaningPlanOn(plans.value, today.value))
const nextPlan = computed(() => plans.value.find(plan => plan.start > today.value))
function defaultStart(day) {
  if (cleaningPlanOn(plans.value, day)) return dateAdd(day, 1)
  return plans.value[0]?.start || day
}
const start = ref(defaultStart(today.value))
const selected = ref(currentPlan.value ? today.value : start.value)
watch(today, (day, previous) => {
  if (start.value === defaultStart(previous)) start.value = defaultStart(day)
  if (selected.value === previous) selected.value = day
})
const lifetime = new AbortController()
onScopeDispose(() => lifetime.abort())
const fileInput = ref(null)
const busy = ref(false)
const message = ref('')
const failed = ref(false)
const session = ref('cleaning-evening')
const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

const monday = computed(() => isDateString(selected.value) ? dateAdd(selected.value, -((weekdayIndex(selected.value) + 6) % 7)) : null)
const effectivePlan = computed(() => cleaningPlanOn(plans.value, start.value))
const pickedRules = shallowRef(null)
const rules = computed(() => pickedRules.value || effectivePlan.value?.rules || defaultRules)
const demand = computed(() => weeklyDemand(rules.value))
const editing = ref(false)
const pendingFile = shallowRef(null)
const choice = shallowRef(null)
const choiceKey = ref(0)
let selection = {}
function resetSelection() {
  pendingFile.value = null
  choice.value = null
  selection = {}
}
function confirmRules(value) {
  pickedRules.value = value
  editing.value = false
  message.value = ''
}
const week = computed(() => {
  if (!monday.value) return []
  return Array.from({ length: 7 }, (_, i) => {
    const date = dateAdd(monday.value, i)
    return { date, sections: cleaningSections(plans.value, date), plan: cleaningPlanOn(plans.value, date) }
  })
})
const options = computed(() => {
  const items = new Map()
  for (const plan of new Set(week.value.map(row => row.plan).filter(Boolean))) {
    for (const rule of plan.rules || defaultRules) {
      const { id, name } = sectionInfo(rule)
      const short = { '晚间日常清洁': '晚间日常', '周四下午大扫除': '周四大扫除' }
      items.set(id, { id, label: Object.hasOwn(short, name) ? short[name] : name })
    }
  }
  return [...items.values()]
})
const activeSession = computed(() => options.value.some(o => o.id === session.value) ? session.value : options.value[0]?.id)
const rows = computed(() => week.value.map(({ date, sections }) => ({
  date, section: sections.find(item => item.roster.id === activeSession.value)
})).filter(row => row.section))

async function saveRoster(roster) {
  const effective = start.value
  const next = updateCleaningPlans(plans.value, roster, effective, rules.value)
  if (next === plans.value) {
    message.value = '名单和规则与所选日期一致，继续原有轮次。'
  } else {
    if (latest.value && (effective < today.value || (currentPlan.value && effective === today.value))) {
      throw new Error('已生效的排班会保留，请选择新的生效日期')
    }
    await store.saveCleaningPlans(next)
    selected.value = effective
    start.value = defaultStart(today.value)
    message.value = `已识别 ${roster.members.length} 人，排班自 ${effective} 起生效。`
  }
  pickedRules.value = null
}
async function processImport(extra = {}) {
  if (!pendingFile.value || busy.value) return
  busy.value = true
  failed.value = false
  message.value = ''
  try {
    selection = { ...selection, ...extra }
    const roster = await readCleaningRoster(pendingFile.value, lifetime.signal, selection)
    if (lifetime.signal.aborted) return
    if (roster.choice) {
      choiceKey.value++
      choice.value = roster.choice
      return
    }
    await saveRoster(roster)
    resetSelection()
  } catch (error) {
    failed.value = true
    message.value = error.message || '文件读取失败，请重新选择。'
  } finally { busy.value = false }
}
function importFile(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file || busy.value) return
  resetSelection()
  pendingFile.value = file
  return processImport()
}
async function applyExisting() {
  const plan = effectivePlan.value
  if (!plan || busy.value) return
  busy.value = true
  failed.value = false
  try {
    const members = ['male','female'].flatMap(gender => plan[gender].map(name => ({ name, gender })))
    await saveRoster({ name: plan.name, members })
  } catch (error) { failed.value = true; message.value = error.message }
  finally { busy.value = false }
}

async function exportWeek() {
  const section = rows.value[0]?.section
  if (!section) return
  const csv = serializeCleaningWeek(rows.value)
  try {
    failed.value = false
    const saved = await chooseAndSaveFile(csv, `${monday.value}-${fileNamePart(section.roster.name)}.csv`)
    message.value = saved ? '本周排班已导出。' : '已取消导出。'
  } catch {
    failed.value = true
    message.value = '导出失败，请重试。'
  }
}
</script>

<template>
  <section class="setting-card cleaning-setup">
    <div class="card-toolbar"><div><h3>班级清洁轮班</h3><p>各班次共用六个完整自然日的休息期。</p></div>
      <button v-if="!editing" type="button" class="subtle-button" :disabled="busy || Boolean(choice)" @click="editing = true">编辑规则</button>
    </div>
    <CleaningRuleEditor v-if="editing" :rules="rules" @apply="confirmRules" @cancel="editing = false" />
    <dl v-else class="cleaning-rules">
      <div v-for="rule in rules" :key="sectionInfo(rule).id"><dt>{{ describeDays(rule.days) }}{{ rule.time }}</dt><dd>{{ rule.jobs.map(j => j.name + ' ' + j.count + ' 人' + ({male:'（男）', female:'（女）', any:''})[j.gender]).join(' · ') }}</dd></div>
    </dl>
    <small class="duty-hint">每周共需 {{ demand.total }} 人<span v-if="demand.male">，其中至少 {{ demand.male }} 名男生</span><span v-if="demand.female">，至少 {{ demand.female }} 名女生</span>。</small>
    <div class="duty-preview-toolbar cleaning-toolbar" :aria-busy="busy">
      <label>生效日期<FluentDatePicker v-model="start" :disabled="busy" placeholder="选择日期" /></label>
      <button type="button" class="subtle-button cleaning-import" :disabled="busy || editing || !isDateString(start)" @click="fileInput?.click()">
        <FluentIcon icon="arrow-upload-20-regular" :width="14" />{{ busy ? '正在排班…' : '导入名单并排班' }}
      </button>
      <button v-if="pickedRules && effectivePlan && !editing" type="button" class="subtle-button" :disabled="busy || Boolean(choice)" @click="applyExisting">用现有名单应用规则</button>
      <input ref="fileInput" type="file" accept=".csv,.tsv,.xls,.xlsx,.xlsm,.xlsb,.ods,.json" hidden aria-label="清洁名册文件" @change="importFile" />
    </div>
    <small class="duty-hint">{{ pickedRules ? '规则待应用。选择名单或使用现有名单后生效。' : '导入 Excel、CSV 或 ODS 名单。系统会识别姓名和性别，遇到多个候选班级或工作表时可自行选择。' }}</small>
    <CleaningImportChoice v-if="choice" :key="choiceKey" :choice="choice" :busy="busy" @continue="processImport" @cancel="resetSelection(); message = ''" />
    <p v-for="plan in [currentPlan, nextPlan].filter(Boolean)" :key="plan.start" class="cleaning-current">
      {{ plan.start > today ? '待生效' : '当前' }} · {{ plan.name }} · {{ plan.male.length + plan.female.length }} 人（男 {{ plan.male.length }}，女 {{ plan.female.length }}） · {{ plan.start }} 起
    </p>
    <p v-if="message" :role="failed ? 'alert' : 'status'" :class="failed ? 'field-error' : 'inline-status'">{{ message }}</p>
  </section>

  <section v-if="latest" class="setting-card duty-card-gap">
    <div class="card-toolbar">
      <h3>每周排班</h3>
      <button type="button" class="subtle-button" :disabled="!rows.length" @click="exportWeek">
        <FluentIcon icon="arrow-download-20-regular" :width="14" /> 导出本表
      </button>
    </div>
    <div class="duty-preview-toolbar cleaning-week">
      <button type="button" class="micro-button icon-only" aria-label="上一周" :disabled="!monday || monday <= plans[0].start" @click="selected = dateAdd(monday, -7)"><FluentIcon icon="chevron-left-20-regular" :width="14" /></button>
      <FluentDatePicker v-model="selected" aria-label="查看日期所在周" placeholder="选择日期" />
      <button type="button" class="micro-button icon-only" aria-label="下一周" :disabled="!monday || !dateAdd(monday, 7)" @click="selected = dateAdd(monday, 7)"><FluentIcon icon="chevron-right-20-regular" :width="14" /></button>
    </div>
    <div class="category-chips cleaning-sessions" role="group" aria-label="选择清洁班次">
      <button v-for="item in options" :key="item.id"
        type="button" class="category-chip" :class="{active: activeSession === item.id}" :aria-pressed="activeSession === item.id" @click="session = item.id">{{ item.label }}</button>
    </div>
    <div class="managed-list duty-preview-list">
      <article v-for="row in rows" :key="row.date" class="duty-preview-item">
        <header class="duty-preview-date"><strong>{{ weekdays[weekdayIndex(row.date)] }}</strong><small>{{ row.date }}</small><em v-if="row.date === today" class="duty-flag duty-flag-today">今天</em></header>
        <div v-for="line in row.section.lines" :key="line.name" class="duty-line"><span class="duty-line-chore">{{ line.name }}</span><span class="duty-line-names">{{ line.names.join('、') }}</span></div>
      </article>
      <p v-if="!rows.length" class="empty-inline">本周此班次没有安排。</p>
    </div>
  </section>
</template>

<style scoped>
.cleaning-setup { display: grid; gap: 10px; }
.cleaning-rules { margin: 0; border-block: 1px solid var(--border-subtle); padding-block: 8px; }
.cleaning-rules div { display: flex; gap: 14px; align-items: baseline; padding-block: 3px; }
.cleaning-rules dt { flex-shrink: 0; font-weight: 600; color: var(--text-primary); }
.cleaning-rules dd { margin: 0; color: var(--text-secondary); }
.cleaning-rules, .cleaning-current { font-size: 12px; line-height: 1.6; }
.cleaning-setup .cleaning-toolbar, .cleaning-setup .inline-status, .cleaning-setup .field-error { margin: 0; }
.cleaning-setup .cleaning-import { border: 1px solid var(--border-default); color: var(--accent); background: var(--accent-50); }
.cleaning-setup .cleaning-import:hover:not(:disabled) { border-color: var(--accent); }
.cleaning-current { overflow-wrap: anywhere; }
@media (pointer: coarse) {
  .cleaning-week button, .cleaning-sessions button, .cleaning-import { min-height: 36px; }
  .cleaning-week button { min-width: 36px; }
}
.cleaning-week, .cleaning-sessions { margin-top: 10px; }
</style>
