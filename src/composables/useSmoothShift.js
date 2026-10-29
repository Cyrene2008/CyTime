import { onBeforeUpdate, onScopeDispose, onUpdated, watch } from 'vue'

// 在容器内容重排（子元素高度变化）时，用 FLIP 把硬切位移变成平滑过渡。
// 使用独立的 translate 属性，避免覆盖元素自身的 transform（如数字字体的 scaleX）。
export function useSmoothShift(getContainer, isEnabled = () => true) {
  const before = new Map()
  const animations = new Map()
  let skipUpdate = true
  const motionQuery = typeof window === 'undefined' ? null : window.matchMedia?.('(prefers-reduced-motion: reduce)')
  const enabled = () => isEnabled() && !motionQuery?.matches

  const cancelAnimations = () => {
    for (const animation of animations.values()) animation.cancel()
    animations.clear()
  }
  const reset = () => {
    before.clear()
    cancelAnimations()
    skipUpdate = true
  }
  watch(isEnabled, reset, { flush: 'sync' })
  motionQuery?.addEventListener('change', reset)

  onBeforeUpdate(() => {
    before.clear()
    if (!enabled()) return
    // 关闭弹层后先恢复正常排版，不从隐藏或暂停时的坐标播放动画。
    if (skipUpdate) { skipUpdate = false; return }
    const container = getContainer()
    if (!container?.getClientRects().length) { reset(); return }
    const rect = container.getBoundingClientRect()
    const scale = container.offsetHeight ? rect.height / container.offsetHeight : 1
    for (const child of container.children) {
      const position = getComputedStyle(child).position
      if (position === 'absolute' || position === 'fixed' || !child.offsetHeight) continue
      before.set(child, (child.getBoundingClientRect().top - rect.top) / scale)
    }
  })

  onUpdated(() => {
    if (!before.size || !enabled()) return
    const container = getContainer()
    if (!container?.getClientRects().length) { reset(); return }
    cancelAnimations()
    const rect = container.getBoundingClientRect()
    const scale = container.offsetHeight ? rect.height / container.offsetHeight : 1
    for (const [child, oldTop] of before) {
      if (child.parentElement !== container || typeof child.animate !== 'function') continue
      const delta = oldTop - (child.getBoundingClientRect().top - rect.top) / scale
      if (Math.abs(delta) < 1) continue
      const animation = child.animate([{ translate: `0 ${delta}px` }, { translate: '0 0' }], {
        duration: 340,
        easing: 'cubic-bezier(.2,.8,.2,1)'
      })
      animations.set(child, animation)
      animation.onfinish = () => { if (animations.get(child) === animation) animations.delete(child) }
    }
    before.clear()
  })

  onScopeDispose(() => {
    cancelAnimations()
    motionQuery?.removeEventListener('change', reset)
  })
}
