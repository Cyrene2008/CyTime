<script setup>
import { computed, ref } from 'vue'
import { useTimeStore } from '../stores/time'
import { useSettingsStore } from '../stores/settings'
import { useQuotesStore } from '../stores/quotes'
import { useContentStore } from '../stores/content'
import { formatDate, formatClock } from '../utils/time'
import { useTypewriter } from '../composables/useTypewriter'
import { useDigitBox } from '../composables/useDigitBox'
import { useAlmanac } from '../composables/useAlmanac'
import { useSmoothShift } from '../composables/useSmoothShift'
import HomeworkPanel from '../components/HomeworkPanel.vue'

const timeStore = useTimeStore()
const settingsStore = useSettingsStore()
const quotesStore = useQuotesStore()
const contentStore = useContentStore()
const date = computed(() => new Date(timeStore.now))
const clock = computed(() => formatClock(date.value, settingsStore.settings.showClockSeconds))
const clockParts = computed(() => clock.value.split(':'))
const clockRef = ref(null)
useDigitBox(clockRef, [() => settingsStore.settings.fontFamily, () => settingsStore.settings.clockFontScale])
const viewRef = ref(null)
useSmoothShift(() => viewRef.value)
const dateText = computed(() => `${formatDate(date.value)} ${new Intl.DateTimeFormat('zh-CN', { weekday: 'long' }).format(date.value)}`)
const { almanac } = useAlmanac(() => date.value)
const almanacShort = (list, max = 4) => list.slice(0, max).join(' · ')
const yiText = computed(() => almanac.value ? almanacShort(almanac.value.yi) : '')
const jiText = computed(() => almanac.value ? almanacShort(almanac.value.ji) : '')
const almanacTitle = computed(() => {
  if (!almanac.value) return ''
  return `${almanac.value.ganZhi} · 宜：${almanac.value.yi.join('、') || '无'} · 忌：${almanac.value.ji.join('、') || '无'}`
})
const lessonsToday = computed(() => contentStore.content.schedule.filter(item => item.weekday === date.value.getDay()).sort((a, b) => a.startAt.localeCompare(b.startAt)))
const currentLesson = computed(() => {
  const now = `${String(date.value.getHours()).padStart(2, '0')}:${String(date.value.getMinutes()).padStart(2, '0')}`
  return lessonsToday.value.find(item => item.startAt <= now && now < item.endAt)
})
const nextLesson = computed(() => {
  const now = `${String(date.value.getHours()).padStart(2, '0')}:${String(date.value.getMinutes()).padStart(2, '0')}`
  return lessonsToday.value.find(item => item.startAt > now)
})
const { value: typedQuote, isTyping } = useTypewriter(() => quotesStore.current, {
  animation: () => settingsStore.settings.quoteAnimation,
  typeSpeed: () => settingsStore.settings.quoteTypeSpeed
})
const quote = computed(() => settingsStore.settings.quoteAnimation === 'typewriter' ? typedQuote.value : quotesStore.current)
const quoteAttribution = computed(() => {
  const meta = quotesStore.metadata
  return [meta.author, meta.work].filter(Boolean).join(' · ')
})
</script>

<template>
  <section ref="viewRef" class="clock-view">
    <div class="clock-aura aura-one"></div><div class="clock-aura aura-two"></div>
    <HomeworkPanel v-if="settingsStore.settings.showHomework && !settingsStore.examModeActive" />
    <div class="clock-eyebrow">昔光涟涟，时不我待</div>
    <time ref="clockRef" class="hero-clock"><template v-for="(part, index) in clockParts" :key="index"><span v-for="(digit, digitIndex) in part.split('')" :key="digitIndex" class="hero-digit">{{ digit }}</span><b v-if="index < clockParts.length - 1">:</b></template></time>
    <div v-if="!settingsStore.examModeActive && (settingsStore.settings.showDate || ((settingsStore.settings.showLunar || settingsStore.settings.showAlmanac) && almanac))" class="hero-date-block">
      <div v-if="settingsStore.settings.showAlmanac && almanac" class="hero-almanac" :title="almanacTitle">
        <span class="almanac-item almanac-yi"><em>宜</em>{{ yiText || '无' }}</span>
        <span class="almanac-item almanac-ji"><em>忌</em>{{ jiText || '无' }}</span>
      </div>
      <div v-if="settingsStore.settings.showDate || (settingsStore.settings.showLunar && almanac)" class="hero-date"><template v-if="settingsStore.settings.showDate">{{ dateText }}</template><span v-if="settingsStore.settings.showLunar && almanac" class="hero-lunar">{{ almanac.lunarText }}<template v-if="almanac.festival"> · {{ almanac.festival }}</template></span></div>
    </div>
    <div v-if="!settingsStore.examModeActive && settingsStore.settings.showSchedule && (currentLesson || nextLesson)" class="clock-schedule"><strong>{{ currentLesson ? `正在上课 · ${currentLesson.subject}` : `下一节 · ${nextLesson.subject}` }}</strong><span>{{ currentLesson ? `${currentLesson.startAt} - ${currentLesson.endAt}` : `${nextLesson.startAt} 开始` }}<template v-if="(currentLesson || nextLesson).room"> · {{ (currentLesson || nextLesson).room }}</template></span></div>
    <p v-if="!settingsStore.examModeActive && settingsStore.settings.showQuote" class="hero-quote" :class="[`quote-${settingsStore.settings.quoteAnimation}`, { 'is-typing': isTyping }]"><template v-if="quote"><span class="quote-text">{{ quote }}</span><small v-if="quoteAttribution">{{ quoteAttribution }}</small></template></p>
  </section>
</template>
