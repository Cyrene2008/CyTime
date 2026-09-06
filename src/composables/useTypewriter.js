import { onUnmounted, ref, watch } from 'vue'

export function useTypewriter(source, options = {}) {
  const displayed = ref('')
  const isTyping = ref(false)
  let timer
  let generation = 0

  watch([source, () => options.animation?.(), () => options.typeSpeed?.()], ([value]) => {
    const target = String(value || '')
    const currentGeneration = ++generation
    window.clearTimeout(timer)
    let index = displayed.value.length

    const animation = options.animation?.() || 'typewriter'
    const speedMap = { slow: 54, standard: 34, fast: 18 }
    const typeSpeed = speedMap[options.typeSpeed?.()] || 34
    const eraseSpeed = Math.max(12, Math.round(typeSpeed * 0.55))
    if (animation !== 'typewriter') {
      displayed.value = target
      isTyping.value = false
      return
    }

    isTyping.value = displayed.value !== target

    const type = () => {
      if (currentGeneration !== generation) return
      if (index < target.length) {
        displayed.value = target.slice(0, ++index)
        timer = window.setTimeout(type, typeSpeed)
      } else isTyping.value = false
    }
    const erase = () => {
      if (currentGeneration !== generation) return
      if (index > 0) {
        displayed.value = displayed.value.slice(0, --index)
        timer = window.setTimeout(erase, eraseSpeed)
      } else type()
    }
    erase()
  }, { immediate: true })

  onUnmounted(() => {
    window.clearTimeout(timer)
    isTyping.value = false
  })
  return { value: displayed, isTyping }
}
