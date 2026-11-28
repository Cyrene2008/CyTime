<script setup>
import { ref } from 'vue'
import { checkRules, dayNames, defaultRules, job, periods, weekOrder } from '../services/cleaningRules'
import { parseCleaningText } from '../services/cleaningText'

const props = defineProps({ rules: { type: Array, required: true } })
const emit = defineEmits(['apply', 'cancel'])
const copy = rules => JSON.parse(JSON.stringify(rules))
const draft = ref(copy(props.rules))
const text = ref('')
const error = ref('')
const textError = ref('')
const recognized = ref('')
const recognizedCount = ref(0)
function interpret() {
  try {
    const next = parseCleaningText(text.value)
    draft.value = next
    recognized.value = text.value.trim()
    recognizedCount.value = next.length
    textError.value = ''
    error.value = ''
  } catch (e) { textError.value = e.message }
}
function apply() {
  try {
    if (text.value.trim() && text.value.trim() !== recognized.value) throw new Error('请先点「识别到表单」，或清空尚未识别的文字。')
    for (const rule of draft.value) {
      rule.title = rule.title.trim()
      rule.days = weekOrder.filter(d => rule.days.includes(d))
      for (const role of rule.jobs) role.name = role.name.trim()
    }
    checkRules(draft.value)
    emit('apply', copy(draft.value))
  } catch (e) { error.value = e.message }
}
</script>
<template>
  <div class="rule-editor">
    <details><summary>用中文短句填写</summary>
      <p class="duty-hint">每行一个班次。例如“周一至周五晚上：扫地2人，拖地1人（仅男生）”。</p>
      <textarea v-model="text" @input="textError = ''" aria-label="中文排班要求" rows="3" placeholder="周末上午：整理讲台1人，擦窗户2人"></textarea>
      <button type="button" class="subtle-button" @click="interpret">识别到表单</button>
      <p v-if="textError" class="field-error" role="alert">{{ textError }}</p>
      <p v-else-if="recognized && recognized === text.trim()" class="duty-hint" role="status">已识别 {{ recognizedCount }} 个班次，请核对下方表单。</p>
    </details>
    <fieldset v-for="(rule, i) in draft" :key="i">
      <legend>班次 {{ i + 1 }}</legend>
      <div class="rule-row">
        <input v-model="rule.title" aria-label="班次名称" placeholder="班次名称（选填）" />
        <select v-model="rule.time" aria-label="时段"><option v-for="t in periods" :key="t">{{ t }}</option></select>
        <button type="button" class="subtle-button" @click="draft.splice(i, 1)">移除班次</button>
      </div>
      <div class="category-chips rule-days" role="group" aria-label="适用星期">
        <label v-for="d in weekOrder" :key="d" class="category-chip" :class="{active:rule.days.includes(d)}"><input v-model="rule.days" type="checkbox" :value="d" />周{{ dayNames[d] }}</label>
      </div>
      <div v-for="(role, j) in rule.jobs" :key="j" class="job-row">
        <input v-model="role.name" aria-label="岗位名称" placeholder="岗位名称" />
        <label><input v-model.number="role.count" type="number" min="1" step="1" aria-label="岗位人数" /> 人</label>
        <select v-model="role.gender" aria-label="参与范围"><option value="any">不限</option><option value="male">仅男生</option><option value="female">仅女生</option></select>
        <button type="button" class="subtle-button" aria-label="移除岗位" @click="rule.jobs.splice(j, 1)">×</button>
      </div>
      <button type="button" class="subtle-button" @click="rule.jobs.push(job())">＋ 岗位</button>
    </fieldset>
    <div class="rule-row">
      <button type="button" class="subtle-button" @click="draft.push({title:'', time:'下午', days:[], jobs:[job()]})">＋ 班次</button>
      <button type="button" class="subtle-button" @click="draft = copy(defaultRules); text = ''; recognized = ''; error = ''; textError = ''">载入默认模板</button>
    </div>
    <p v-if="error" class="field-error" role="alert">{{ error }}</p>
    <div class="rule-row"><button type="button" class="subtle-button active" @click="apply">确认规则</button><button type="button" class="subtle-button" @click="emit('cancel')">取消</button></div>
  </div>
</template>
<style scoped>
.rule-editor, fieldset { display:grid; gap:9px; min-width:0; }
fieldset { margin:0; border:1px solid var(--border-subtle); border-radius:6px; padding:8px; }
legend, summary { color:var(--text-primary); font-weight:600; }
summary, .rule-days label { cursor:pointer; }
.rule-row, .job-row { display:flex; gap:6px; flex-wrap:wrap; align-items:center; }
.rule-editor :is(input:not([type=checkbox]),select,textarea) { font:inherit; padding:5px; color:var(--text-primary); background:var(--bg-card-solid); border:1px solid var(--border-strong); border-radius:5px; min-width:0; }
.rule-row input, .job-row > input { flex:1 1 7em; width:7em; }
.job-row input[type=number] { width:4em; }
.rule-editor textarea { width:100%; box-sizing:border-box; resize:vertical; }
.rule-days label { display:inline-flex; gap:3px; align-items:center; }
.rule-days input { accent-color:var(--accent); }
.rule-days { gap:4px; margin-top:0; flex-wrap:wrap; }
.rule-editor :is(button, input, select, textarea, summary):focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
.rule-editor details p { margin-block:6px; }
</style>
