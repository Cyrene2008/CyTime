import { nextTick, onMounted, onUnmounted, watch } from 'vue'

// 测量当前字体的最大数字宽度，写入 --clock-digit-ratio（相对 1em），
// 让每个数字拥有固定占位宽度，避免数字变化时整体抖动。
export function useDigitBox(elementRef, sources = []) {
  function measure() {
    const element = elementRef.value
    if (!element) return
    const style = getComputedStyle(element)
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (!context) return
    context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
    let max = 0
    for (let digit = 0; digit <= 9; digit += 1) max = Math.max(max, context.measureText(String(digit)).width)
    const fontSize = parseFloat(style.fontSize) || 1
    if (max > 0) element.style.setProperty('--clock-digit-ratio', String(max / fontSize))
  }

  const schedule = () => nextTick(measure)

  onMounted(() => {
    schedule()
    if (typeof document !== 'undefined' && document.fonts?.ready) document.fonts.ready.then(schedule).catch(() => {})
    window.addEventListener('resize', schedule)
  })
  onUnmounted(() => window.removeEventListener('resize', schedule))
  watch(sources, schedule)

  return measure
}
