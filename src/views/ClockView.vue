<script setup>
import { computed, inject, ref } from 'vue'
import { useSettingsStore } from '../stores/settings'
import { useQuotesStore } from '../stores/quotes'
import { useContentStore } from '../stores/content'
import { formatDate, formatClock } from '../utils/time'
import { useTypewriter } from '../composables/useTypewriter'
import { useDigitBox } from '../composables/useDigitBox'
import { useAlmanac } from '../composables/useAlmanac'
import { useSmoothShift } from '../composables/useSmoothShift'
import { useDisplayTime } from '../composables/useDisplayTime'
import { isLessonOnDate, lessonTimeToSeconds } from '../services/schedule'
import HomeworkPanel from '../components/HomeworkPanel.vue'
import BlackboardPanel from '../components/BlackboardPanel.vue'

const { active: stageActive, now } = useDisplayTime()
const settingsStore = useSettingsStore()
const quotesStore = useQuotesStore()
const contentStore = useContentStore()
const { homeworkEnabled, blackboardEnabled, homeworkShown, blackboardShown, compactBoards, switchableBoards, selectedBoard } = inject('cytimeClassroomBoards')
const displaySecond = computed(() => Math.floor(now.value / 1000))
const date = computed(() => new Date(displaySecond.value * 1000))
const clock = computed(() => formatClock(date.value, settingsStore.settings.showClockSeconds))
const clockParts = computed(() => clock.value.split(':'))
const clockRef = ref(null)
useDigitBox(clockRef, [() => settingsStore.settings.fontFamily, () => settingsStore.settings.clockFontScale])
const viewRef = ref(null)
const quoteRef = ref(null)

function handleStageClick(event) {
  if (!settingsStore.settings.showQuote || !quote.value) return
  if (event.target?.closest?.('button, a, input, select, textarea, label, [role="button"], .homework-panel')) return
  const element = quoteRef.value
  if (!element) return
  const rect = element.getBoundingClientRect()
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) return
  quotesStore.refresh()
}
const weekdayFormatter = new Intl.DateTimeFormat('zh-CN', { weekday: 'long' })
const dateText = computed(() => `${formatDate(date.value)} ${weekdayFormatter.format(date.value)}`)
const { almanac } = useAlmanac(() => date.value)
const almanacShort = (list, max = 4) => list.slice(0, max).join(' · ')
const yiText = computed(() => almanac.value ? almanacShort(almanac.value.yi) : '')
const jiText = computed(() => almanac.value ? almanacShort(almanac.value.ji) : '')
const almanacTitle = computed(() => {
  if (!almanac.value) return ''
  return `${almanac.value.ganZhi} · 宜：${almanac.value.yi.join('、') || '无'} · 忌：${almanac.value.ji.join('、') || '无'}`
})
const scheduleDate = computed(() => formatDate(date.value))
const secondOfDay = computed(() => lessonTimeToSeconds(formatClock(date.value)))
const lessonsToday = computed(() => {
  const today = new Date(`${scheduleDate.value}T12:00:00`)
  return contentStore.content.schedule
    .filter(item => isLessonOnDate(item, today, contentStore.content.scheduleWeekOne))
    .sort((a, b) => lessonTimeToSeconds(a.startAt) - lessonTimeToSeconds(b.startAt))
})
const currentLesson = computed(() => {
  return lessonsToday.value.find(item => lessonTimeToSeconds(item.startAt) <= secondOfDay.value && secondOfDay.value < lessonTimeToSeconds(item.endAt))
})
const nextLesson = computed(() => {
  return lessonsToday.value.find(item => lessonTimeToSeconds(item.startAt) > secondOfDay.value)
})
const typewriter = computed(() => settingsStore.settings.quoteAnimation === 'typewriter')
const quoteAttribution = computed(() => {
  const meta = quotesStore.metadata
  return [meta.author, meta.work].filter(Boolean).join(' · ')
})
const { value: typedQuote, attribution: typedAttribution, isTyping } = useTypewriter(() => quotesStore.current, {
  active: () => stageActive.value && settingsStore.settings.showQuote && !settingsStore.examModeActive,
  animation: () => settingsStore.settings.quoteAnimation,
  typeSpeed: () => settingsStore.settings.quoteTypeSpeed,
  attribution: () => quoteAttribution.value
})
useSmoothShift(() => viewRef.value, () => stageActive.value && !isTyping.value && !compactBoards.value)
const quote = computed(() => typewriter.value ? typedQuote.value : quotesStore.current)
</script>

<template>
  <section ref="viewRef" class="clock-view" :class="{ 'compact-boards': compactBoards }" @click="handleStageClick">
    <div class="clock-aura aura-one"></div><div class="clock-aura aura-two"></div>
    <div class="clock-eyebrow">昔光涟涟，时不我待</div>
    <time ref="clockRef" class="hero-clock" :style="{ '--clock-digits': clockParts.length * 2, '--clock-separators': clockParts.length - 1 }"><template v-for="(part, index) in clockParts" :key="index"><span v-for="(digit, digitIndex) in part.split('')" :key="digitIndex" class="hero-digit" data-swarm-glyph>{{ digit }}</span><b v-if="index < clockParts.length - 1" data-swarm-glyph>:</b></template></time>
    <div v-if="!settingsStore.examModeActive && (settingsStore.settings.showDate || ((settingsStore.settings.showLunar || settingsStore.settings.showAlmanac) && almanac))" class="hero-date-block">
      <div v-if="settingsStore.settings.showAlmanac && almanac" class="hero-almanac" :title="almanacTitle">
        <span class="almanac-item almanac-yi"><em>宜</em>{{ yiText || '无' }}</span>
        <span class="almanac-item almanac-ji"><em>忌</em>{{ jiText || '无' }}</span>
      </div>
      <div v-if="settingsStore.settings.showDate || (settingsStore.settings.showLunar && almanac)" class="hero-date"><template v-if="settingsStore.settings.showDate">{{ dateText }}</template><span v-if="settingsStore.settings.showLunar && almanac" class="hero-lunar">{{ almanac.lunarText }}<template v-if="almanac.festival"> · {{ almanac.festival }}</template></span></div>
    </div>
    <div v-if="!settingsStore.examModeActive && settingsStore.settings.showSchedule && (currentLesson || nextLesson)" class="clock-schedule"><strong>{{ currentLesson ? `正在上课 · ${currentLesson.subject}` : `下一节 · ${nextLesson.subject}` }}</strong><span>{{ currentLesson ? `${currentLesson.startAt} - ${currentLesson.endAt}` : `${nextLesson.startAt} 开始` }}<template v-if="(currentLesson || nextLesson).room"> · {{ (currentLesson || nextLesson).room }}</template></span></div>
    <p v-if="!settingsStore.examModeActive && settingsStore.settings.showQuote" ref="quoteRef" class="hero-quote" :class="[`quote-${settingsStore.settings.quoteAnimation}`, { 'is-typing': isTyping }]">
      <span v-if="typewriter" class="quote-slot" :title="!isTyping && quote ? [quote, typedAttribution].filter(Boolean).join(' · ') : undefined">
        <span v-if="quote || isTyping" class="quote-text">{{ quote }}</span>
        <small v-if="typedAttribution">{{ typedAttribution }}</small>
      </span>
      <template v-else-if="quote">
        <span class="quote-text">{{ quote }}</span>
        <small v-if="quoteAttribution">{{ quoteAttribution }}</small>
      </template>
    </p>
    <div v-if="homeworkEnabled || blackboardEnabled" class="clock-boards">
      <div v-if="switchableBoards" class="board-switch" role="group" aria-label="班务板切换">
        <button type="button" aria-controls="clock-homework-board" :aria-pressed="homeworkShown" @click="selectedBoard = 'homework'"><FluentIcon icon="book-open-20-regular" :width="16" />作业板</button>
        <button type="button" aria-controls="clock-blackboard" :aria-pressed="blackboardShown" @click="selectedBoard = 'blackboard'"><FluentIcon icon="document-text-20-regular" :width="16" />小黑板</button>
      </div>
      <HomeworkPanel v-if="homeworkEnabled" v-show="homeworkShown" id="clock-homework-board" :displayed="homeworkShown" :compact="compactBoards" />
      <BlackboardPanel v-if="blackboardEnabled" v-show="blackboardShown" id="clock-blackboard" />
    </div>
  </section>
</template>

<style scoped>
.quote-slot {
  --quote-lines: 2;
  display: flex;
  flex: none;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  inline-size: 100%;
  /* 正文及出处共用固定空间，居中布局不跟随文字的擦除和换行。 */
  block-size: calc(var(--quote-lines) * 1.6em + 1.3em + 4px);
}
.quote-slot .quote-text {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: var(--quote-lines);
  overflow: hidden;
  max-inline-size: 100%;
  overflow-wrap: anywhere;
}
.quote-slot small {
  display: block;
  max-inline-size: 100%;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
@media (max-width: 620px) {
  .quote-slot { --quote-lines: 3; }
}
@media (max-height: 560px) {
  .quote-slot { --quote-lines: 2; }
}
</style>
