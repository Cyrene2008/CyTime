<script setup>
import { computed, ref } from 'vue'
import { defaultSettings } from '../stores/settings'

const props = defineProps({ draft: { type: Object, required: true } })
const emit = defineEmits(['change'])
const size = (key, label, min, max, unit = 'px', step = 1) => ({ key, label, min, max, unit, step })
const color = (key, label) => ({ key, label })
const regions = [
  { id: 'clock', label: '时钟与日期', sizes: [size('clockFontScale', '主时钟大小', 6, 22, '', .5), size('dateFontSize', '日期字号', 10, 32), size('clockDetailScale', '日期与黄历缩放', 70, 170, '%', 5)], colors: [color('clockTextColor', '时钟数字'), color('clockDetailColor', '日期与黄历')] },
  { id: 'schedule', label: '课程提示', sizes: [size('scheduleFontSize', '课程字号', 10, 30)], colors: [color('scheduleTextColor', '课程文字')] },
  { id: 'quote', label: '语录', sizes: [size('quoteFontSize', '语录字号', 10, 48), size('quoteScale', '语录与出处缩放', 70, 170, '%', 5)], colors: [color('quoteTextColor', '语录正文'), color('quoteAuthorColor', '作者与出处')] },
  { id: 'status', label: '顶部状态栏', sizes: [size('statusDockScale', '状态栏缩放', 60, 150, '%', 5), size('statusWeatherFontSize', '天气字号', 10, 28)], colors: [color('statusTextColor', '状态文字'), color('statusWeatherColor', '天气数字')] },
  { id: 'homework', label: '作业板', sizes: [size('homeworkFontSize', '作业字号', 10, 28), size('homeworkTimeFontSize', '起止时间字号', 8, 24)], colors: [color('homeworkTextColor', '作业正文'), color('homeworkTimeColor', '起止时间'), color('homeworkStatusOngoingColor', '进行中'), color('homeworkStatusUpcomingColor', '待开始'), color('homeworkStatusEndedColor', '已结束')] },
  { id: 'blackboard', label: '小黑板', sizes: [size('blackboardFontScale', '值日与记事缩放', 70, 160, '%', 5)], colors: [color('blackboardTextColor', '值日与记事文字')] },
  { id: 'task', label: '活动计时', sizes: [size('taskCardScale', '计时卡片缩放', 70, 170, '%', 5), size('widgetFontSize', '计时数字字号', 10, 32), size('widgetLabelFontSize', '计时标签字号', 8, 20), size('countdownFontSize', '悬浮倒计时字号', 12, 40)], colors: [color('taskWidgetColor', '计时卡片文字'), color('taskWidgetAccentColor', '计时强调色')] }
]
const active = ref('clock')
const region = computed(() => regions.find(item => item.id === active.value))
const preview = computed(() => {
  const d = props.draft
  const px = value => `${Math.min(72, value)}px`
  const styles = (titleSize, titleColor, detailSize, detailColor) => ({
    '--sample-title-size': px(titleSize),
    '--sample-detail-size': px(detailSize),
    '--sample-title-color': titleColor || 'var(--text-primary)',
    '--sample-detail-color': detailColor || 'var(--text-secondary)'
  })
  const values = {
    clock: ['08:45:00', '11 月 27 日 · 星期五', styles(d.clockFontScale * 4, d.clockTextColor, d.dateFontSize * d.clockDetailScale / 100, d.clockDetailColor)],
    schedule: ['当前课程 · 数学', '08:00–08:45 · 高二（3）班', styles(d.scheduleFontSize, d.scheduleTextColor, d.scheduleFontSize, d.scheduleTextColor)],
    quote: ['昔光涟涟，时不我待。', '昔时 · 示范语录', styles(d.quoteFontSize * d.quoteScale / 100, d.quoteTextColor, 11 * d.quoteScale / 100, d.quoteAuthorColor)],
    status: ['18° · 晴', '今日进度 42%　·　距离考试还有 7 天', styles(d.statusWeatherFontSize * d.statusDockScale / 100, d.statusWeatherColor, 12 * d.statusDockScale / 100, d.statusTextColor)],
    homework: ['数学 · 完成练习册第 12 页', '今天 18:00 前提交', styles(d.homeworkFontSize, d.homeworkTextColor, d.homeworkTimeFontSize, d.homeworkTimeColor)],
    blackboard: ['今日值日 · 第一组', '放学前擦黑板、关闭教室门窗', styles(16 * d.blackboardFontScale / 100, d.blackboardTextColor, 13 * d.blackboardFontScale / 100, d.blackboardTextColor)],
    task: ['05:30', '课堂讨论 · 倒计时', styles(d.countdownFontSize * d.taskCardScale / 100, d.taskWidgetAccentColor || d.taskWidgetColor, d.widgetLabelFontSize * d.taskCardScale / 100, d.taskWidgetColor)]
  }
  return values[active.value]
})
function setValue(key, value) { emit('change', { [key]: value }) }
function resetRegion() {
  emit('change', Object.fromEntries([...region.value.sizes, ...region.value.colors].map(({ key }) => [key, defaultSettings[key]])))
}
</script>

<template>
  <section class="setting-card display-customization">
    <div class="display-regions" role="group" aria-label="选择调整区域">
      <button v-for="item in regions" :key="item.id" type="button" class="subtle-button" :aria-pressed="active === item.id" @click="active = item.id">{{ item.label }}</button>
    </div>
    <div class="display-sample" :style="preview[2]">
      <small>预览 · {{ region.label }}</small>
      <strong>{{ preview[0] }}</strong>
      <span>{{ preview[1] }}</span>
      <div v-if="active === 'homework'" class="sample-statuses">
        <span :style="{ color: draft.homeworkStatusOngoingColor }">进行中</span>
        <span :style="{ color: draft.homeworkStatusUpcomingColor }">待开始</span>
        <span :style="{ color: draft.homeworkStatusEndedColor }">已结束</span>
      </div>
    </div>
    <div class="display-size-fields">
      <label v-for="item in region.sizes" :key="item.key" class="range-control">
        <span>{{ item.label }} <strong>{{ draft[item.key] }}{{ item.unit }}</strong></span>
        <input type="range" :aria-label="item.label" :value="draft[item.key]" :min="item.min" :max="item.max" :step="item.step" @input="setValue(item.key, $event.target.valueAsNumber)" />
      </label>
    </div>
    <div class="display-color-fields">
      <div v-for="item in region.colors" :key="item.key" class="display-color-row">
        <span :id="`appearance-label-${item.key}`">{{ item.label }}</span>
        <FluentColorPicker :aria-labelledby="`appearance-label-${item.key}`" :model-value="draft[item.key]" :show-presets="false" @update:model-value="setValue(item.key, $event)" />
        <button type="button" class="subtle-button" :aria-label="`重置${item.label}颜色`" :disabled="draft[item.key] === defaultSettings[item.key]" @click="setValue(item.key, defaultSettings[item.key])">重置</button>
      </div>
    </div>
    <button type="button" class="subtle-button" @click="resetRegion">恢复此区域默认值</button>
  </section>
</template>

<style scoped>
.display-customization { display: grid; gap: 16px; min-width: 0; }
.display-customization > button { justify-self: start; }
.display-regions { display: flex; flex-wrap: wrap; gap: 6px; }
.display-regions button[aria-pressed='true'] { color: var(--accent); border-color: var(--accent); background: var(--accent-50); font-weight: 600; }
.display-sample { display: grid; align-content: center; gap: 6px; min-height: 118px; padding: 14px 16px; border: 1px solid var(--border-subtle); border-radius: 8px; background: var(--bg-card-solid); overflow-wrap: anywhere; }
.display-sample small { color: var(--text-muted); font-size: 11px; }
.display-sample strong { color: var(--sample-title-color); font-size: var(--sample-title-size); line-height: 1.24; font-variant-numeric: tabular-nums; }
.display-sample > span { color: var(--sample-detail-color); font-size: var(--sample-detail-size); line-height: 1.35; }
.sample-statuses { display: flex; flex-wrap: wrap; gap: 8px; font-size: 12px; }
.display-size-fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(165px, 100%), 1fr)); gap: 12px 18px; }
.display-size-fields label > span { display: flex; align-items: baseline; justify-content: space-between; gap: 4px; }
.display-color-fields { display: grid; gap: 8px; }
.display-color-row { display: grid; grid-template-columns: minmax(70px, 1fr) minmax(0, 2fr) auto; align-items: center; gap: 5px 8px; color: var(--text-secondary); font-size: 12px; }
.display-color-row :deep(.fluent-color-picker), .display-color-row :deep(input) { min-width: 0; max-width: 100%; }
.display-color-row button:disabled { opacity: .55; cursor: default; }
@media (max-width: 620px) { .display-color-row { grid-template-columns: minmax(0, 1fr) auto; } .display-color-row > span { grid-column: 1 / -1; } }
</style>
