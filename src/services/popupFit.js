const SELECT_DROPDOWN_CLASS = 'fluent-select-dropdown'
const SELECT_TRIGGER_CLASS = 'fluent-select'
const VIEWPORT_MARGIN = 8
const TRIGGER_GAP = 4

const naturalHeights = new WeakMap()

function measureNaturalHeight(element) {
  const previous = element.style.maxHeight
  element.style.maxHeight = 'none'
  const height = element.scrollHeight
  element.style.maxHeight = previous
  return height
}

function samePx(value, px) {
  return Math.abs((parseFloat(value) || 0) - px) < 0.6
}

function fitSelectDropdown(element) {
  if (!element.isConnected) return
  const trigger = document.querySelector(`.${SELECT_TRIGGER_CLASS}.open`)
  if (!trigger) return
  let natural = naturalHeights.get(element)
  if (natural === undefined) {
    natural = measureNaturalHeight(element)
    naturalHeights.set(element, natural)
  }
  const rect = trigger.getBoundingClientRect()
  const belowSpace = Math.max(0, window.innerHeight - rect.bottom - TRIGGER_GAP - VIEWPORT_MARGIN)
  const aboveSpace = Math.max(0, rect.top - TRIGGER_GAP - VIEWPORT_MARGIN)
  const openUp = natural > belowSpace && aboveSpace > belowSpace
  const space = openUp ? aboveSpace : belowSpace
  const height = Math.max(1, Math.min(natural, space))
  const top = openUp ? Math.max(VIEWPORT_MARGIN, rect.top - TRIGGER_GAP - height) : rect.bottom + TRIGGER_GAP
  if (samePx(element.style.top, top) && samePx(element.style.left, rect.left) && samePx(element.style.width, rect.width) && samePx(element.style.maxHeight, height)) return
  element.style.transitionProperty = 'opacity, transform'
  element.style.position = 'fixed'
  element.style.top = `${top}px`
  element.style.left = `${rect.left}px`
  element.style.width = `${rect.width}px`
  element.style.maxHeight = `${height}px`
  element.style.zIndex = '99999'
}

function isSelectDropdown(node) {
  return node.nodeType === 1 && Boolean(node.classList?.contains(SELECT_DROPDOWN_CLASS))
}

let observer = null

export function installPopupFit() {
  if (observer || typeof MutationObserver === 'undefined' || typeof document === 'undefined') return () => {}
  observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'childList') {
        for (const node of record.addedNodes) {
          if (isSelectDropdown(node)) fitSelectDropdown(node)
          else if (typeof node.querySelectorAll === 'function') {
            for (const nested of node.querySelectorAll(`.${SELECT_DROPDOWN_CLASS}`)) fitSelectDropdown(nested)
          }
        }
      } else if (record.type === 'attributes' && isSelectDropdown(record.target)) {
        fitSelectDropdown(record.target)
      }
    }
  })
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] })
  return () => {
    observer?.disconnect()
    observer = null
  }
}
