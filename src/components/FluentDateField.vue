<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import { isImportantDate } from '../services/importantDays'

const props = defineProps({
  modelValue: { type: String, default: '' },
  label: { type: String, required: true },
  required: Boolean,
  invalid: Boolean
})
const emit = defineEmits(['update:modelValue', 'change'])
const id = useId()
const picker = ref(null)
const input = ref(null)
const text = ref(props.modelValue)
const invalidText = ref(false)
const pickerValue = computed(() => isImportantDate(text.value) && Number(text.value.slice(0, 4)) >= 100 ? text.value : '')
let trigger
let popup

defineExpose({ focus: () => input.value?.focus() })

watch(() => props.modelValue, value => {
  text.value = value
  invalidText.value = false
})

function updateText(value) {
  text.value = value
  invalidText.value = false
  emit('update:modelValue', value)
}

function commitText() {
  const value = text.value.trim()
  if (value && !isImportantDate(value)) {
    invalidText.value = true
    return
  }
  if (value !== text.value) updateText(value)
  emit('change', value)
}

function forgetPopup() {
  popup?.removeEventListener('keydown', onPopupKey)
  popup = null
  trigger?.setAttribute('aria-expanded', 'false')
  document.removeEventListener('click', onOutsideClick)
}

function onOutsideClick(event) {
  if (!popup?.contains(event.target) && !trigger?.contains(event.target)) forgetPopup()
}

function onPopupKey(event) {
  if (event.key !== 'Escape') return
  event.preventDefault()
  event.stopPropagation()
  trigger?.click()
  trigger?.focus()
}

function onTriggerKey(event) {
  if (event.key === 'Escape' && popup) onPopupKey(event)
  else if (event.key === 'Enter' || event.key === ' ' || (event.key === 'ArrowDown' && !popup)) {
    event.preventDefault()
    trigger?.click()
  }
}

async function trackCalendar(event) {
  if (popup) {
    forgetPopup()
    return
  }
  const existing = new Set(document.querySelectorAll('.calendar-dropdown'))
  // Snapshot before the widget's click handler; the teleported popup appears on the next frame.
  await new Promise(requestAnimationFrame)
  await nextTick()
  if (!trigger?.isConnected) return
  popup = [...document.querySelectorAll('.calendar-dropdown')].find(element => !existing.has(element))
  if (!popup) return
  popup.id = `${id}-calendar`
  popup.setAttribute('role', 'dialog')
  popup.setAttribute('aria-label', `${props.label}日历`)
  const [previous, next] = popup.querySelectorAll('.nav-button')
  previous?.setAttribute('aria-label', '上一时间段')
  next?.setAttribute('aria-label', '下一时间段')
  trigger.setAttribute('aria-expanded', 'true')
  popup.addEventListener('keydown', onPopupKey)
  document.addEventListener('click', onOutsideClick)
  if (event.detail === 0) popup.querySelector('.header-title')?.focus()
}

function chooseDate(value) {
  forgetPopup()
  trigger?.focus()
  if (!isImportantDate(value)) return
  updateText(value)
  emit('change', value)
}

onMounted(() => {
  // The installed Fluent picker uses a div trigger; add keyboard and AT support here.
  trigger = picker.value?.$el.querySelector('.calendar-date-picker-input')
  if (!trigger) return
  trigger.tabIndex = 0
  trigger.setAttribute('role', 'button')
  trigger.setAttribute('aria-label', `打开${props.label}日历`)
  trigger.setAttribute('aria-haspopup', 'dialog')
  trigger.setAttribute('aria-controls', `${id}-calendar`)
  trigger.setAttribute('aria-expanded', 'false')
  trigger.addEventListener('click', trackCalendar, true)
  trigger.addEventListener('keydown', onTriggerKey)
})

onBeforeUnmount(() => {
  forgetPopup()
  trigger?.removeEventListener('click', trackCalendar, true)
  trigger?.removeEventListener('keydown', onTriggerKey)
})
</script>

<template>
  <div class="fluent-date-field">
    <label :for="id">{{ label }}</label>
    <div class="date-entry">
      <input :id="id" ref="input" :value="text" type="text" maxlength="10" placeholder="YYYY-MM-DD"
        autocomplete="off" spellcheck="false" :required="required" :aria-invalid="invalid || invalidText || undefined"
        :aria-describedby="invalidText && !required ? `${id}-hint` : undefined"
        @input="updateText($event.target.value)" @change="commitText" />
      <FluentDatePicker ref="picker" :model-value="pickerValue" min="0001-01-01" max="9999-12-31"
        @update:model-value="chooseDate" />
    </div>
    <small v-if="invalidText && !required" :id="`${id}-hint`" role="alert">请输入有效日期，格式为 YYYY-MM-DD。</small>
  </div>
</template>

<style scoped>
.fluent-date-field { display: grid; gap: 5px; min-width: 0; color: var(--text-secondary); font-size: 12px; }
.date-entry { display: grid; grid-template-columns: minmax(0, 1fr) 38px; gap: 4px; min-width: 0; }
.date-entry input {
  box-sizing: border-box; min-width: 0; width: 100%; min-height: 38px; padding: 0 9px;
  border: 1px solid var(--border-strong); border-radius: var(--radius-md); background: var(--bg-card-solid);
  color: var(--text-primary); font: inherit; font-variant-numeric: tabular-nums;
}
.date-entry :deep(.calendar-date-picker-input) { box-sizing: border-box; height: 38px; justify-content: center; padding: 0; }
.date-entry :deep(.input-text) { display: none; }
.date-entry input:focus-visible, .date-entry :deep(.calendar-date-picker-input:focus-visible) { outline: 2px solid var(--accent); outline-offset: 2px; }
</style>
