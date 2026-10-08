const SELECT_DROPDOWN_CLASS = 'fluent-select-dropdown'
const VIEWPORT_MARGIN = 8

function fitSelectDropdown(element) {
  const top = parseFloat(element.style.top || '0') || 0
  const current = parseFloat(element.style.maxHeight || '0') || 0
  const available = Math.floor(window.innerHeight - top - VIEWPORT_MARGIN)
  if (available <= current + 24) return
  element.style.maxHeight = `${available}px`
}

let observer = null

export function installPopupFit() {
  if (observer || typeof MutationObserver === 'undefined' || typeof document === 'undefined') return () => {}
  observer = new MutationObserver(records => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType !== 1) continue
        const targets = []
        if (node.classList?.contains(SELECT_DROPDOWN_CLASS)) targets.push(node)
        else if (typeof node.querySelectorAll === 'function') targets.push(...node.querySelectorAll(`.${SELECT_DROPDOWN_CLASS}`))
        for (const target of targets) window.requestAnimationFrame(() => fitSelectDropdown(target))
      }
    }
  })
  observer.observe(document.body, { childList: true })
  return () => {
    observer?.disconnect()
    observer = null
  }
}
