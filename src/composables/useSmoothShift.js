import { onBeforeUpdate, onUpdated } from 'vue'

// 在容器内容重排（子元素高度变化）时，用 FLIP 把硬切位移变成平滑过渡。
// 使用独立的 translate 属性，避免覆盖元素自身的 transform（如数字字体的 scaleX）。
export function useSmoothShift(getContainer) {
  let before = new Map()
  const reduceMotion = () => typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)

  onBeforeUpdate(() => {
    const container = getContainer()
    if (!container) return
    const map = new Map()
    for (const child of container.children) map.set(child, child.getBoundingClientRect().top)
    before = map
  })

  onUpdated(() => {
    const container = getContainer()
    if (!container || reduceMotion()) return
    const children = [...container.children]
    for (const child of children) {
      child.style.transition = 'none'
      child.style.translate = 'none'
    }
    const shifts = []
    for (const child of children) {
      const oldTop = before.get(child)
      if (oldTop === undefined) continue
      const delta = oldTop - child.getBoundingClientRect().top
      if (Math.abs(delta) >= 1) shifts.push([child, delta])
    }
    if (!shifts.length) return
    for (const [child, delta] of shifts) child.style.translate = `0 ${delta}px`
    void container.offsetHeight
    for (const [child] of shifts) {
      child.style.transition = 'translate .34s cubic-bezier(.2,.8,.2,1)'
      child.style.translate = ''
    }
  })
}
