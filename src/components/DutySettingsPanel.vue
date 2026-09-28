<script setup>
import { computed, reactive, ref } from 'vue'
import { useContentStore } from '../stores/content'
import { localDateStr, dateAdd, countOccurrences, occurrenceIndex, eligiblePool, resolveRosterDay, rosterApplies, dutyStats } from '../services/duty'
import { parseRosterFile, serializeRosterFile } from '../utils/dutyRoster'

defineProps({ draft: { type: Object, required: true } })

const contentStore = useContentStore()
const duty = computed(() => contentStore.content.duty)

const tabs = [
  { value: 'members', label: '成员名单' },
  { value: 'rosters', label: '名单与任务' },
  { value: 'preview', label: '排班与单日调整' },
  { value: 'stats', label: '次数统计' }
]
const tab = ref('members')

const genderOptions = [{ value: '', label: '未设置' }, { value: 'male', label: '男' }, { value: 'female', label: '女' }]
const choreGenderOptions = [{ value: 'any', label: '不限' }, { value: 'no-female', label: '女生避开' }, { value: 'no-male', label: '男生避开' }]
const weekdayChips = [{ value: 1, label: '一' }, { value: 2, label: '二' }, { value: 3, label: '三' }, { value: 4, label: '四' }, { value: 5, label: '五' }, { value: 6, label: '六' }, { value: 0, label: '日' }]
const weekdayText = ['日', '一', '二', '三', '四', '五', '六']

function genderLabel(value) {
  return value === 'female' ? '女' : value === 'male' ? '男' : '未设置'
}
function memberName(memberId) {
  return duty.value.members.find(member => member.id === memberId)?.name || '—'
}
function lineNames(line) {
  return line.memberIds.length ? line.memberIds.map(memberName).join('、') : '待分配'
}
function formatPreviewDate(dateStr) {
  const [year, month, day] = String(dateStr).split('-').map(Number)
  return `${month}月${day}日 周${weekdayText[new Date(year, month - 1, day).getDay()]}`
}
function choreSummary(chores) {
  return Object.entries(chores).map(([name, count]) => `${name}×${count}`).join(' · ')
}

// ---- 成员名单
const memberForm = reactive({ name: '', enName: '', gender: '' })
const memberMessage = ref('')
const rosterFileInput = ref(null)

function addMember() {
  const name = memberForm.name.trim()
  if (!name) return
  contentStore.addMember({ name, enName: memberForm.enName, gender: memberForm.gender })
  memberForm.name = ''
  memberForm.enName = ''
  memberForm.gender = ''
  memberMessage.value = `已添加 ${name}`
}
function cycleGender(member) {
  const next = member.gender === '' ? 'male' : member.gender === 'male' ? 'female' : ''
  contentStore.updateMember(member, { gender: next })
}
async function importRosterFile(event) {
  const file = event.target.files?.[0]
  if (!file) return
  const before = duty.value.members.length
  try {
    const bytes = new Uint8Array(await file.arrayBuffer())
    const result = await parseRosterFile(file.name, bytes)
    contentStore.importMembers(result.members)
    const added = duty.value.members.length - before
    memberMessage.value = `已读取 ${result.name}：新增 ${added} 人，现有 ${duty.value.members.length} 人（按拼音排序）`
  } catch (error) {
    memberMessage.value = `导入失败：${error?.message || error}`
  }
  event.target.value = ''
}
function downloadText(filename, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
function exportRoster(format) {
  if (!duty.value.members.length) {
    memberMessage.value = '名单为空，先导入或添加成员'
    return
  }
  downloadText(`值日名单.${format}`, serializeRosterFile(duty.value.members, format, '值日名单'), format === 'json' ? 'application/json' : 'text/csv;charset=utf-8')
  memberMessage.value = `已导出 ${duty.value.members.length} 人（${format.toUpperCase()}）`
}

// ---- 名单与任务
const newRosterName = ref('')
const expandedRosterId = ref('')
const choreForm = reactive({ name: '', slots: 1, genderRule: 'any' })

function addRoster() {
  const roster = contentStore.addRoster(newRosterName.value)
  if (!roster.chores.length) contentStore.addChore(roster, { name: '拖地', slots: 2, genderRule: 'any' })
  newRosterName.value = ''
  expandedRosterId.value = roster.id
}
function isRosterExpanded(roster) {
  return expandedRosterId.value === roster.id
}
function toggleRoster(roster) {
  expandedRosterId.value = expandedRosterId.value === roster.id ? '' : roster.id
}
function rosterCount(roster) {
  return countOccurrences(duty.value, roster, localDateStr())
}
function addChore(roster) {
  contentStore.addChore(roster, { name: choreForm.name, slots: choreForm.slots, genderRule: choreForm.genderRule })
  choreForm.name = ''
  choreForm.slots = 1
  choreForm.genderRule = 'any'
}
function toggleWeekday(roster, value) {
  const set = new Set(roster.weekdays || [])
  if (set.has(value)) set.delete(value)
  else set.add(value)
  contentStore.updateRoster(roster, { weekdays: weekdayChips.map(item => item.value).filter(item => set.has(item)) })
}
function toggleRosterMember(roster, memberId) {
  const set = new Set(roster.memberIds || [])
  if (set.has(memberId)) set.delete(memberId)
  else set.add(memberId)
  contentStore.updateRoster(roster, { memberIds: [...set] })
}

// ---- 在校日与节假日
const newSchoolDay = ref(localDateStr())
const newHoliday = ref('')
const recentSchoolDays = computed(() => [...duty.value.schoolDays].reverse().slice(0, 8))

function addSchoolDay(dateStr) {
  const day = dateStr || newSchoolDay.value
  if (!day) return
  const days = new Set(duty.value.schoolDays)
  days.add(day)
  contentStore.updateDuty({ schoolDays: [...days].sort() })
  newSchoolDay.value = localDateStr()
}
function removeSchoolDay(dateStr) {
  contentStore.updateDuty({ schoolDays: duty.value.schoolDays.filter(day => day !== dateStr) })
}
function addHoliday() {
  if (!newHoliday.value) return
  const days = new Set(duty.value.holidays || [])
  days.add(newHoliday.value)
  contentStore.updateDuty({ holidays: [...days].sort() })
  newHoliday.value = ''
}
function removeHoliday(dateStr) {
  contentStore.updateDuty({ holidays: (duty.value.holidays || []).filter(day => day !== dateStr) })
}

function shiftAnchor(roster, delta) {
  const current = occurrenceIndex(duty.value, roster, localDateStr())
  contentStore.setRosterAnchor(roster, localDateStr(), Math.max(0, current + delta))
}

// ---- 排班预览与单日调整
const previewRosterId = ref('')
const statsRosterId = ref('')
const rosterOptions = computed(() => duty.value.rosters.map(roster => ({ value: roster.id, label: roster.name })))
const previewRoster = computed(() => duty.value.rosters.find(roster => roster.id === previewRosterId.value) || duty.value.rosters[0] || null)
const statsRoster = computed(() => duty.value.rosters.find(roster => roster.id === statsRosterId.value) || duty.value.rosters[0] || null)
const previewRosterValue = computed({
  get: () => previewRoster.value?.id || '',
  set: value => { previewRosterId.value = value }
})
const statsRosterValue = computed({
  get: () => statsRoster.value?.id || '',
  set: value => { statsRosterId.value = value }
})

function rosterNextDate(roster, from, direction) {
  const today = localDateStr()
  let date = dateAdd(from, direction)
  let guard = 400
  while (date && guard--) {
    if (rosterApplies(duty.value, roster, date, today)) return date
    date = dateAdd(date, direction)
  }
  return null
}

const previewRows = computed(() => {
  const roster = previewRoster.value
  if (!roster) return []
  const today = localDateStr()
  let date = today
  if (!rosterApplies(duty.value, roster, date, today)) date = rosterNextDate(roster, date, 1)
  const rows = []
  let guard = 40
  while (date && rows.length < 14 && guard--) {
    if (!rosterApplies(duty.value, roster, date, today)) break
    rows.push({
      date,
      ...resolveRosterDay(duty.value, roster, date, today),
      overridden: Boolean(duty.value.overrides[date]?.[roster.id]?.length),
      anchored: Boolean(duty.value.anchors?.[roster.id]?.[date] !== undefined)
    })
    date = rosterNextDate(roster, date, 1)
  }
  return rows
})

const editingDate = ref('')
const editLines = ref([])
const extraName = ref('')

function loadLines(dateStr) {
  const roster = previewRoster.value
  if (!roster) return
  const fresh = resolveRosterDay(duty.value, roster, dateStr, localDateStr())
  editLines.value = fresh.lines.map(line => ({ choreId: line.choreId, name: line.name, memberIds: [...line.memberIds], extra: Boolean(line.extra) }))
}
function openEditor(row) {
  editingDate.value = row.date
  extraName.value = ''
  loadLines(row.date)
}
function closeEditor() {
  editingDate.value = ''
  editLines.value = []
}
function saveEditor() {
  const roster = previewRoster.value
  if (!roster || !editingDate.value) return
  contentStore.setOverride(editingDate.value, roster.id, editLines.value.map(line => ({ choreId: line.choreId, name: line.name, memberIds: [...line.memberIds] })))
}
function toggleEditMember(line, memberId) {
  const index = line.memberIds.indexOf(memberId)
  if (index >= 0) line.memberIds.splice(index, 1)
  else line.memberIds.push(memberId)
  saveEditor()
}
function removeEditLine(line) {
  editLines.value = editLines.value.filter(item => item !== line)
  saveEditor()
}
function addExtraLine() {
  const name = extraName.value.trim()
  if (!name) return
  editLines.value.push({ choreId: `extra-${Date.now()}`, name, memberIds: [], extra: true })
  extraName.value = ''
  saveEditor()
}
function restoreDay() {
  const roster = previewRoster.value
  if (!roster || !editingDate.value) return
  contentStore.clearOverride(editingDate.value, roster.id)
  loadLines(editingDate.value)
}

// ---- 定次（按天校准索引）
const calibratingDate = ref('')
function toggleCalibrate(row) {
  calibratingDate.value = calibratingDate.value === row.date ? '' : row.date
}
const calibrateCandidates = computed(() => {
  const roster = previewRoster.value
  const date = calibratingDate.value
  if (!roster || !date) return []
  const poolSize = roster.chores.length
    ? Math.max(...roster.chores.map(chore => eligiblePool(duty.value, roster, chore).length))
    : duty.value.members.length
  const size = Math.max(1, Math.min(poolSize || 1, 44))
  const today = localDateStr()
  const out = []
  for (let index = 0; index < size; index++) {
    out.push({ index, lines: resolveRosterDay(duty.value, roster, date, today, index).lines })
  }
  return out
})
function applyAnchor(row, index) {
  const roster = previewRoster.value
  if (!roster) return
  contentStore.setRosterAnchor(roster, row.date, index)
}
function clearAnchor(dateStr) {
  const roster = previewRoster.value
  if (!roster) return
  contentStore.clearRosterAnchor(roster, dateStr)
}

// ---- 次数统计
const statsRows = computed(() => {
  const roster = statsRoster.value
  if (!roster) return []
  const from = duty.value.schoolDays[0] || localDateStr()
  const stats = dutyStats(duty.value, roster, from, localDateStr())
  return duty.value.members
    .map(member => {
      const entry = stats.get(member.id)
      return { member, total: entry?.total || 0, chores: entry?.chores || {} }
    })
    .filter(row => row.total > 0)
    .sort((a, b) => b.total - a.total)
})
const statsMax = computed(() => Math.max(1, ...statsRows.value.map(row => row.total)))
const statsRange = computed(() => duty.value.schoolDays.length ? `${duty.value.schoolDays[0]} ~ ${localDateStr()} · 共 ${duty.value.schoolDays.length} 个在校日` : '暂无在校日记录')
</script>

<template>
  <div class="settings-tabs">
    <button v-for="item in tabs" :key="item.value" type="button" :class="{ active: tab === item.value }" @click="tab = item.value">{{ item.label }}</button>
  </div>

  <section v-if="tab === 'members'" class="setting-card">
    <div class="card-toolbar">
      <div><h3>导入与导出</h3><p>支持 CSV / JSON / XLSX，兼容点名器名单格式；导入后按拼音排序。</p></div>
      <div class="inline-form">
        <button type="button" class="subtle-button" @click="rosterFileInput?.click()"><FluentIcon icon="arrow-upload-20-regular" :width="14" /> 导入文件</button>
        <input ref="rosterFileInput" type="file" accept=".csv,.json,.xlsx,.xls" hidden @change="importRosterFile" />
        <button type="button" class="subtle-button" @click="exportRoster('csv')"><FluentIcon icon="arrow-download-20-regular" :width="14" /> 导出 CSV</button>
        <button type="button" class="subtle-button" @click="exportRoster('json')"><FluentIcon icon="arrow-download-20-regular" :width="14" /> 导出 JSON</button>
      </div>
    </div>
    <small v-if="memberMessage" class="inline-status">{{ memberMessage }}</small>
    <div class="card-toolbar duty-card-gap">
      <div><h3>手动维护</h3><p>现有 {{ duty.members.length }} 人；点击姓名可直接修改，点性别标签切换。</p></div>
      <div class="inline-form">
        <input v-model="memberForm.name" placeholder="姓名" @keydown.enter.prevent="addMember" />
        <input v-model="memberForm.enName" placeholder="英文名（选填）" @keydown.enter.prevent="addMember" />
        <select v-model="memberForm.gender">
          <option v-for="item in genderOptions" :key="item.value" :value="item.value">{{ item.label }}</option>
        </select>
        <button type="button" class="subtle-button" @click="addMember"><FluentIcon icon="add-20-regular" :width="14" /> 添加</button>
      </div>
    </div>
    <div class="managed-list">
      <div v-for="member in duty.members" :key="member.id" class="managed-item">
        <span class="duty-member-cell">
          <input class="duty-name-input" :value="member.name" @change="contentStore.updateMember(member, { name: $event.target.value })" />
          <small>{{ member.enName || '—' }}</small>
        </span>
        <span class="duty-member-actions">
          <button type="button" class="toggle-chip" @click="cycleGender(member)">{{ genderLabel(member.gender) }}</button>
          <button type="button" class="icon-text-button icon-only" title="删除成员" aria-label="删除成员" @click="contentStore.removeMember(member)"><FluentIcon icon="delete-20-regular" :width="14" /></button>
        </span>
      </div>
      <p v-if="!duty.members.length" class="empty-inline">还没有成员，请导入名单文件或手动添加。</p>
    </div>
  </section>

  <section v-else-if="tab === 'rosters'" class="setting-card">
    <div class="card-toolbar">
      <div><h3>值日名单</h3><p>可建多个名单（如日常值日、大扫除），各自独立轮换、独立计次。</p></div>
      <div class="inline-form">
        <input v-model="newRosterName" placeholder="名单名称" @keydown.enter.prevent="addRoster" />
        <button type="button" class="subtle-button" @click="addRoster">新建名单</button>
      </div>
    </div>
    <div class="managed-list">
      <div v-for="roster in duty.rosters" :key="roster.id" class="duty-roster-card">
        <div class="managed-item duty-roster-head">
          <span class="duty-roster-title" @click="toggleRoster(roster)">
            <strong>{{ roster.name }}</strong>
            <small>{{ roster.chores.length }} 项任务 · {{ roster.memberIds?.length ? `${roster.memberIds.length} 人参与` : '全体成员' }} · 已轮换 {{ rosterCount(roster) }} 次 · {{ roster.enabled === false ? '已停用' : '启用中' }}</small>
          </span>
          <span class="duty-member-actions">
            <button type="button" class="icon-text-button icon-only" :title="isRosterExpanded(roster) ? '收起' : '展开'" :aria-label="isRosterExpanded(roster) ? '收起' : '展开'" @click="toggleRoster(roster)"><FluentIcon :icon="isRosterExpanded(roster) ? 'chevron-up-20-regular' : 'chevron-down-20-regular'" :width="15" /></button>
            <button type="button" class="icon-text-button icon-only danger-button" title="删除名单" aria-label="删除名单" @click="contentStore.removeRoster(roster)"><FluentIcon icon="delete-20-regular" :width="14" /></button>
          </span>
        </div>
        <div v-if="isRosterExpanded(roster)" class="duty-roster-body">
          <div class="duty-field">
            <span>基础</span>
            <div class="inline-form">
              <input class="duty-name-input" :value="roster.name" @change="contentStore.updateRoster(roster, { name: $event.target.value.trim() || roster.name })" />
              <button type="button" class="toggle-chip" :class="{ active: roster.enabled !== false }" @click="contentStore.updateRoster(roster, { enabled: roster.enabled === false })">启用</button>
            </div>
          </div>
          <div class="duty-field">
            <span>适用星期</span>
            <div class="category-chips duty-chip-row">
              <button v-for="item in weekdayChips" :key="item.value" type="button" class="category-chip" :class="{ active: roster.weekdays?.includes(item.value) }" @click="toggleWeekday(roster, item.value)">{{ item.label }}</button>
              <small class="duty-hint">未选 = 每天</small>
            </div>
          </div>
          <div class="duty-field">
            <span>参与人员</span>
            <div class="category-chips duty-chip-row">
              <button v-for="member in duty.members" :key="member.id" type="button" class="category-chip" :class="{ active: !roster.memberIds?.length || roster.memberIds.includes(member.id) }" @click="toggleRosterMember(roster, member.id)">{{ member.name }}</button>
              <small class="duty-hint">未选 = 全体成员</small>
            </div>
          </div>
          <div class="duty-field">
            <span>从今天起校准</span>
            <div class="inline-form">
              <button type="button" class="subtle-button" @click="shiftAnchor(roster, 1)">换下一位</button>
              <button type="button" class="subtle-button" @click="shiftAnchor(roster, -1)">换上一位</button>
            </div>
            <small class="duty-hint">从今天锚定，不改已过去的记录；精确到某天的「定为第 N 次」在排班预览里。未启动软件的日子不计入索引，不会自己往后跑。</small>
          </div>
          <div class="duty-field">
            <span>值日任务</span>
            <div class="managed-list duty-chore-list">
              <div v-for="chore in roster.chores" :key="chore.id" class="managed-item duty-chore-item">
                <span class="duty-member-cell">
                  <input class="duty-name-input" :value="chore.name" @change="contentStore.updateChore(chore, { name: $event.target.value.trim() || chore.name })" />
                  <small>{{ choreGenderOptions.find(item => item.value === chore.genderRule)?.label }}</small>
                </span>
                <span class="duty-chore-actions">
                  <label class="duty-mini-label">人数<input type="number" min="1" max="20" :value="chore.slots" @change="contentStore.updateChore(chore, { slots: Math.max(1, Number($event.target.value) || 1) })" /></label>
                  <select class="duty-mini-select" :value="chore.genderRule" @change="contentStore.updateChore(chore, { genderRule: $event.target.value })">
                    <option v-for="item in choreGenderOptions" :key="item.value" :value="item.value">{{ item.label }}</option>
                  </select>
                  <button type="button" class="icon-text-button icon-only" title="删除任务" aria-label="删除任务" @click="contentStore.removeChore(roster, chore)"><FluentIcon icon="delete-20-regular" :width="14" /></button>
                </span>
              </div>
              <p v-if="!roster.chores.length" class="empty-inline">还没有任务，请在下方添加。</p>
            </div>
            <div class="inline-form duty-chore-add">
              <input v-model="choreForm.name" placeholder="任务名（如 拖地）" @keydown.enter.prevent="addChore(roster)" />
              <input v-model.number="choreForm.slots" type="number" min="1" max="20" title="人数" />
              <select v-model="choreForm.genderRule">
                <option v-for="item in choreGenderOptions" :key="item.value" :value="item.value">{{ item.label }}</option>
              </select>
              <button type="button" class="subtle-button" @click="addChore(roster)"><FluentIcon icon="add-20-regular" :width="14" /> 添加任务</button>
            </div>
          </div>
        </div>
      </div>
      <p v-if="!duty.rosters.length" class="empty-inline">还没有值日名单，先新建一个。</p>
    </div>
  </section>

  <section v-else-if="tab === 'preview'" class="setting-card">
    <div class="card-toolbar">
      <div><h3>在校日与节假日</h3><p>当天打开过应用会自动记为在校日；已过去的非在校日不参与轮换。</p></div>
      <div class="inline-form">
        <input v-model="newSchoolDay" type="date" class="duty-date-input" />
        <button type="button" class="subtle-button" @click="addSchoolDay()"><FluentIcon icon="add-20-regular" :width="14" /> 补记</button>
        <button type="button" class="subtle-button" @click="addSchoolDay(dateAdd(localDateStr(), -1))"><FluentIcon icon="add-20-regular" :width="14" /> 补记昨天</button>
      </div>
    </div>
    <div class="duty-field duty-field-gap">
      <span>已记录在校日（{{ duty.schoolDays.length }} 个，点击移除）</span>
      <div class="category-chips duty-chip-row">
        <button v-for="day in recentSchoolDays" :key="day" type="button" class="category-chip active" @click="removeSchoolDay(day)">{{ day }} ×</button>
        <small v-if="!duty.schoolDays.length" class="duty-hint">还没有记录</small>
      </div>
    </div>
    <div class="duty-field duty-field-gap">
      <span>跳过周末</span>
      <button type="button" class="switch" :class="{ on: duty.skipWeekends }" :aria-pressed="duty.skipWeekends" @click="contentStore.updateDuty({ skipWeekends: !duty.skipWeekends })"><i></i></button>
    </div>
    <div class="duty-field duty-field-gap">
      <span>节假日（不排班）</span>
      <div class="inline-form">
        <input v-model="newHoliday" type="date" class="duty-date-input" />
        <button type="button" class="subtle-button" @click="addHoliday"><FluentIcon icon="add-20-regular" :width="14" /> 添加</button>
      </div>
      <div class="category-chips duty-chip-row">
        <button v-for="day in duty.holidays" :key="day" type="button" class="category-chip active" @click="removeHoliday(day)">{{ day }} ×</button>
        <small v-if="!duty.holidays?.length" class="duty-hint">没有节假日</small>
      </div>
    </div>
  </section>

  <section v-if="tab === 'preview'" class="setting-card">
    <div class="card-toolbar">
      <div><h3>轮换预览与单日调整</h3><p>未来 14 次排班；「改」可对某天直接指定，手动安排只影响该天，不打乱后续轮换。</p></div>
      <FluentSelect v-if="rosterOptions.length" v-model="previewRosterValue" :options="rosterOptions" aria-label="选择名单" />
    </div>
    <div v-if="previewRoster" class="managed-list duty-preview-list">
      <div v-for="row in previewRows" :key="row.date" class="duty-preview-item" :class="{ editing: editingDate === row.date }">
        <div class="duty-preview-head">
          <span class="duty-preview-date">
            <strong>{{ formatPreviewDate(row.date) }}</strong>
            <small>第 {{ row.occurrence + 1 }} 次</small>
            <em v-if="row.date === localDateStr()" class="duty-flag duty-flag-today">今天</em>
            <em v-if="row.anchored" class="duty-flag">已定次</em>
            <em v-if="row.overridden" class="duty-flag">已手动</em>
          </span>
          <span class="duty-member-actions">
            <button type="button" class="icon-text-button" :class="{ 'duty-active-button': calibratingDate === row.date }" @click="toggleCalibrate(row)"><FluentIcon icon="calendar-20-regular" :width="14" /> {{ calibratingDate === row.date ? '收起定次' : '定次' }}</button>
            <button type="button" class="icon-text-button" @click="editingDate === row.date ? closeEditor() : openEditor(row)"><FluentIcon :icon="editingDate === row.date ? 'chevron-up-20-regular' : 'edit-20-regular'" :width="14" /> {{ editingDate === row.date ? '收起' : '改' }}</button>
          </span>
        </div>
        <div class="duty-preview-lines">
          <div v-for="line in row.lines" :key="line.choreId" class="duty-line" :class="{ overridden: line.overridden }">
            <span class="duty-line-chore">{{ line.name }}<em v-if="line.overridden">调</em></span>
            <span class="duty-line-names">{{ lineNames(line) }}</span>
          </div>
          <p v-if="!row.lines.length" class="empty-inline">该名单还没有任务。</p>
        </div>
        <div v-if="editingDate === row.date" class="duty-editor">
          <div v-for="line in editLines" :key="line.choreId" class="duty-editor-line">
            <strong>{{ line.name }}<em v-if="line.extra" class="duty-flag">临时</em><button v-if="line.extra" type="button" class="icon-text-button icon-only" title="删除临时任务" aria-label="删除临时任务" @click="removeEditLine(line)"><FluentIcon icon="delete-20-regular" :width="13" /></button></strong>
            <div class="category-chips duty-chip-row">
              <button v-for="member in duty.members" :key="member.id" type="button" class="category-chip" :class="{ active: line.memberIds.includes(member.id) }" @click="toggleEditMember(line, member.id)">{{ member.name }}</button>
            </div>
          </div>
          <div class="inline-form duty-extra-form">
            <input v-model="extraName" placeholder="临时任务名称（如 大扫除加项）" @keydown.enter.prevent="addExtraLine" />
            <button type="button" class="subtle-button" @click="addExtraLine"><FluentIcon icon="add-20-regular" :width="14" /> 加一项</button>
            <button type="button" class="subtle-button" @click="restoreDay"><FluentIcon icon="arrow-reset-20-regular" :width="14" /> 复原为自动</button>
            <button type="button" class="subtle-button" @click="closeEditor"><FluentIcon icon="checkmark-20-regular" :width="14" /> 完成</button>
          </div>
        </div>
        <div v-if="calibratingDate === row.date" class="duty-editor duty-calibrate">
          <p class="duty-hint">把这天定为第 N 次起始：只影响这天及之后的自动轮换，不改已过去的记录；未启动软件的日子不计数，不会自己往后跑。</p>
          <div v-for="candidate in calibrateCandidates" :key="candidate.index" class="duty-candidate" :class="{ active: row.anchored && candidate.index === row.occurrence }" @click="applyAnchor(row, candidate.index)">
            <strong>第 {{ candidate.index + 1 }} 次</strong>
            <span v-for="line in candidate.lines" :key="line.choreId">{{ line.name }}：{{ lineNames(line) }}</span>
          </div>
          <div class="inline-form">
            <button v-if="row.anchored" type="button" class="subtle-button" @click="clearAnchor(row.date)"><FluentIcon icon="arrow-reset-20-regular" :width="14" /> 清除定次（恢复自动）</button>
            <button type="button" class="subtle-button" @click="calibratingDate = ''"><FluentIcon icon="checkmark-20-regular" :width="14" /> 完成</button>
          </div>
        </div>
      </div>
      <p v-if="!previewRows.length" class="empty-inline">该名单近期没有适用日期，请检查星期与节假日设置。</p>
    </div>
    <p v-else class="empty-inline">先在「名单与任务」里新建一个名单。</p>
  </section>

  <section v-else-if="tab === 'stats'" class="setting-card">
    <div class="card-toolbar">
      <div><h3>次数统计</h3><p>范围：{{ statsRange }}</p></div>
      <FluentSelect v-if="rosterOptions.length" v-model="statsRosterValue" :options="rosterOptions" aria-label="选择名单" />
    </div>
    <div v-if="statsRows.length" class="managed-list">
      <div v-for="row in statsRows" :key="row.member.id" class="managed-item">
        <span><strong>{{ row.member.name }}</strong><small>{{ row.total }} 次 · {{ choreSummary(row.chores) }}</small></span>
        <span class="duty-bar"><i :style="{ width: `${Math.round((row.total / statsMax) * 100)}%` }"></i></span>
      </div>
    </div>
    <p v-else class="empty-inline">暂无统计数据：需要已有在校日记录，且该名单排过班。</p>
  </section>
</template>
