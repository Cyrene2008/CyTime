import { onUnmounted, ref, watch } from 'vue'

export function useTypewriter(source, options = {}) {
  const displayed = ref('')
  const displayedAttribution = ref('')
  const isTyping = ref(false)
  let timer
  let generation = 0
  let target = ''
  let phase = 'type'

  watch([source, () => options.attribution?.(), () => options.animation?.(), () => options.typeSpeed?.(), () => options.active?.() ?? true], ([value, attribution, , , active]) => {
    const nextTarget = String(value || '')
    if (nextTarget !== target) {
      target = nextTarget
      phase = displayed.value ? 'erase' : 'type'
    }
    const currentGeneration = ++generation
    window.clearTimeout(timer)

    const animation = options.animation?.() || 'typewriter'
    const speedMap = { slow: 54, standard: 34, fast: 18 }
    const typeSpeed = speedMap[options.typeSpeed?.()] || 34
    const eraseSpeed = Math.max(12, Math.round(typeSpeed * 0.55))
    if (animation !== 'typewriter') {
      displayed.value = target
      displayedAttribution.value = target ? attribution || '' : ''
      isTyping.value = false
      return
    }
    // 弹层打开时保留已显示的字和当前阶段，恢复后接着播放。
    if (!active) { isTyping.value = false; return }
    if (displayed.value === target) {
      displayedAttribution.value = target ? attribution || '' : ''
      isTyping.value = false
      return
    }

    isTyping.value = true

    const step = () => {
      if (currentGeneration !== generation) return
      if (phase === 'erase' && displayed.value.length) {
        displayed.value = displayed.value.slice(0, -1)
        if (!displayed.value) displayedAttribution.value = ''
        timer = window.setTimeout(step, eraseSpeed)
        return
      }
      phase = 'type'
      if (displayed.value.length < target.length) {
        displayedAttribution.value = attribution || ''
        displayed.value = target.slice(0, displayed.value.length + 1)
        timer = window.setTimeout(step, typeSpeed)
      } else isTyping.value = false
    }
    timer = window.setTimeout(step, phase === 'erase' ? eraseSpeed : typeSpeed)
  }, { immediate: true })

  onUnmounted(() => {
    window.clearTimeout(timer)
    isTyping.value = false
  })
  return { value: displayed, attribution: displayedAttribution, isTyping }
}
