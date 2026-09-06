<script setup>
import { computed } from 'vue'
import { useTimeStore } from '../stores/time'
import { useSettingsStore } from '../stores/settings'
import { useQuotesStore } from '../stores/quotes'
import { useContentStore } from '../stores/content'
import { formatDate, formatClock } from '../utils/time'
import { useTypewriter } from '../composables/useTypewriter'
import HomeworkPanel from '../components/HomeworkPanel.vue'

const timeStore = useTimeStore()
const settingsStore = useSettingsStore()
const quotesStore = useQuotesStore()
const contentStore = useContentStore()
const date = computed(() => new Date(timeStore.now))
const clock = computed(() => formatClock(date.value, settingsStore.settings.showClockSeconds))
const clockParts = computed(() => clock.value.split(':'))
const dateText = computed(() => `${formatDate(date.value)} ${new Intl.DateTimeFormat('zh-CN', { weekday: 'long' }).format(date.value)}`)
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
  const attribution = [meta.author, meta.work].filter(Boolean).join(' · ')
  return attribution ? `——${attribution}` : ''
})
</script>

<template>
  <section class="clock-view">
    <div class="clock-aura aura-one"></div><div class="clock-aura aura-two"></div>
    <HomeworkPanel v-if="settingsStore.settings.showHomework && !settingsStore.examModeActive" />
    <div class="clock-eyebrow">昔光涟涟，时不我待</div>
    <time class="hero-clock"><template v-for="(part, index) in clockParts" :key="`${part}-${index}`"><span>{{ part }}</span><b v-if="index < clockParts.length - 1">:</b></template></time>
    <div v-if="!settingsStore.examModeActive && settingsStore.settings.showDate" class="hero-date">{{ dateText }}</div>
    <div v-if="!settingsStore.examModeActive && settingsStore.settings.showSchedule && (currentLesson || nextLesson)" class="clock-schedule"><strong>{{ currentLesson ? `正在上课 · ${currentLesson.subject}` : `下一节 · ${nextLesson.subject}` }}</strong><span>{{ currentLesson ? `${currentLesson.startAt} - ${currentLesson.endAt}` : `${nextLesson.startAt} 开始` }}<template v-if="(currentLesson || nextLesson).room"> · {{ (currentLesson || nextLesson).room }}</template></span></div>
    <p v-if="!settingsStore.examModeActive && settingsStore.settings.showQuote && quote" class="hero-quote quote-clickable" :class="[`quote-${settingsStore.settings.quoteAnimation}`, { 'is-typing': isTyping }]" @click="quotesStore.refresh"><span class="quote-text">{{ quote }}</span><small v-if="quoteAttribution">{{ quoteAttribution }}</small></p>
  </section>
</template>
