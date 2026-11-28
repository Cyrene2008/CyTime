<script setup>
import { computed, reactive, ref } from 'vue'

const props = defineProps({ choice: { type: Object, required: true }, busy: Boolean })
const emit = defineEmits(['continue', 'cancel'])
const c = props.choice
const selected = ref(c.kind === 'class' ? c.classes[0] : c.sheetName)
const available = c.used || []
const nameColumn = available.includes(c.columns?.name) ? c.columns.name : available[0] ?? 0
const genderColumn = available.includes(c.columns?.gender) && c.columns.gender !== nameColumn
  ? c.columns.gender : available.find(i => i !== nameColumn) ?? -1
const map = reactive({
  name: nameColumn, gender: genderColumn, start: c.firstData ?? 2,
  extra: -1, male: '', female: ''
})
function letter(index) {
  let s = ''
  for (let i = index + 1; i; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + (i - 1) % 26) + s
  return s
}
const choices = computed(() => (c.used || []).map(i => {
  const header = c.sample.filter(row => row.number < map.start).at(-1)
  return { i, label: letter(i) + (header?.cells[i] ? ' · ' + header.cells[i] : '') }
}))
function proceed() {
  if (c.kind === 'sheet') emit('continue', { sheetName: selected.value })
  else if (c.kind === 'class') emit('continue', { className: selected.value, sheetName: c.sheetName })
  else emit('continue', { sheetName: c.sheetName, mapping: { ...map, male: map.male.trim(), female: map.female.trim() } })
}
</script>
<template>
  <div class="import-choice" aria-label="确认名单格式">
    <template v-if="choice.kind !== 'columns'">
      <label>{{ choice.kind === 'sheet' ? '选择工作表' : '选择班级' }}
        <select v-model="selected"><option v-for="v in (choice.sheets || choice.classes)" :key="v">{{ v }}</option></select>
      </label>
    </template>
    <template v-else>
      <p>{{ choice.hint }}</p>
      <p>一次导入一个班。如果班级列未被识别，请先把该班单独保存为一份文件。</p>
      <div class="sample-wrap"><table><thead><tr><th>行</th><th v-for="i in choice.used.slice(0,12)" :key="i">{{ letter(i) }}</th></tr></thead>
        <tbody><tr v-for="row in choice.sample" :key="row.number"><th>{{ row.number }}</th><td v-for="i in choice.used.slice(0,12)" :key="i">{{ row.cells[i] }}</td></tr></tbody></table></div>
      <div class="mapping">
        <label>首位同学所在行<input v-model.number="map.start" type="number" min="1" /></label>
        <label>姓名列<select v-model="map.name"><option v-for="v in choices" :key="v.i" :value="v.i">{{ v.label }}</option></select></label>
        <label>性别列<select v-model="map.gender"><option v-for="v in choices" :key="v.i" :value="v.i">{{ v.label }}</option></select></label>
        <label>区分重名<select v-model="map.extra"><option :value="-1">仅用姓名</option><option v-for="v in choices" :key="v.i" :value="v.i">{{ v.label }}</option></select></label>
      </div>
      <details><summary>自定义性别值</summary><div class="mapping"><label>男生对应值<input v-model="map.male" /></label><label>女生对应值<input v-model="map.female" /></label></div></details>
    </template>
    <div><button type="button" class="subtle-button" :disabled="busy" @click="proceed">继续导入</button><button type="button" class="subtle-button" :disabled="busy" @click="emit('cancel')">取消导入</button></div>
  </div>
</template>
<style scoped>
.import-choice { display:grid; gap:9px; border:1px solid var(--border-default); padding:10px; border-radius:6px; min-width:0; }
.import-choice label { display:grid; gap:4px; font-size:12px; }
.mapping { display:grid; grid-template-columns:repeat(auto-fit,minmax(100px,1fr)); gap:8px; }
.import-choice :is(input,select) { min-height:30px; width:100%; min-width:0; font:inherit; color:var(--text-primary); background:var(--bg-card-solid); border:1px solid var(--border-strong); border-radius:5px; }
.sample-wrap { overflow:auto; max-height:9em; }
table { border-collapse:collapse; font-size:11px; }
th,td { border:1px solid var(--border-subtle); padding:3px 7px; white-space:nowrap; }
summary { cursor:pointer; }
</style>
