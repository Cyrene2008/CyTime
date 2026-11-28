import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

const mouseMotion = '(pointer: fine) and (hover: hover) and (prefers-reduced-motion: no-preference) and (forced-colors: none)'
const hubPath = '/classroom'
const inputTarget = 'a, button, input, textarea, select, label, [contenteditable], [role="button"], [data-tauri-drag-region]'
const accent = 'var(--cytime-swarm-accent)'
const background = 'var(--bg-base)'

export function useSwarmEffects(router, { enabled, sound, suspended }) {
  const supported = ref(false)
  let preference
  let core
  let releaseNavigation
  let pending
  let playing = false
  let limitTimer
  let input = 'mouse'

  function clearRun() {
    playing = false
    window.clearTimeout(limitTimer)
  }

  function interrupt() {
    if (pending) pending.meta.swarmCursors = false
    if (!playing) return
    clearRun()
    // Clear engine keyboard listeners immediately and leave the browser event alone.
    core?.stop(false)
  }

  function onPointerDown(event) {
    input = event.pointerType || 'mouse'
    if (input !== 'mouse' || event.target.closest?.(inputTarget)) interrupt()
  }

  function onKeyDown(event) {
    if (['Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) return
    input = 'keyboard'
    interrupt()
  }

  function onFocus(event) {
    if (event.target.matches?.('input, textarea, select, [contenteditable]')) interrupt()
  }

  function updateSupport() {
    supported.value = preference?.matches === true
  }

  function onVisibility() {
    if (document.hidden) interrupt()
  }

  function shouldPlay(to, from) {
    return enabled() && supported.value && !suspended() && !document.hidden
      && input === 'mouse' && from.matched.length > 0 && from.path !== hubPath && to.fullPath === hubPath
  }

  function connect(createSwarmCursors) {
    // The package treats autoOnRoute as autoplay on the initial route too.
    // Mark the current location as silent before connecting the router.
    router.currentRoute.value.meta.swarmCursors = false
    const before = router.beforeEach((to, from) => {
      interrupt()
      pending = to
      playing = shouldPlay(to, from)
      to.meta.swarmCursors = playing ? { sound: sound() } : false
      // The cover opens before lazy routes finish resolving.
      if (playing) limitTimer = window.setTimeout(interrupt, 5500)
    })
    const after = router.afterEach((to, from, failure) => {
      if (pending === to) {
        pending = null
        if (failure) clearRun()
      }
      if (failure || !to.meta.swarmCursors) return
      if (!shouldPlay(to, from)) {
        to.meta.swarmCursors = false
        interrupt()
      }
    })
    const onError = router.onError((_error, to) => {
      if (pending !== to) return
      pending = null
      clearRun()
    })
    const overlays = new MutationObserver(records => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (!node.matches?.('swarm-cover, div-pointers')) continue
          node.setAttribute('aria-hidden', 'true')
          node.inert = true
        }
      }
    })
    overlays.observe(document.documentElement, { childList: true })
    releaseNavigation = () => { before(); after(); onError(); overlays.disconnect() }
    const instance = createSwarmCursors({
      button: false,
      auto: false,
      autoOnRoute: true,
      routeDelay: 80,
      captureDelay: 320,
      cover: true,
      coverColor: background,
      coverColorDark: background,
      accent,
      accentDark: accent,
      colors: [accent, 'var(--accent-light)', 'var(--accent-200)'],
      hud: false,
      sound: false,
      companion: true,
      companionMode: 'replace',
      autoReveal: true,
      autoRevealDelay: 120
    })
    core = instance
    instance.on('end', clearRun)
    instance.on('error', clearRun)
    instance.attachRouter(router)

    // Silencing a route also hides the companion. Restore just the native
    // arrow once that policy has been applied; this does not queue a rebuild.
    const restoreArrow = route => {
      if (core === instance && route.meta.swarmCursors === false) instance.setPageEnabled(true)
    }
    const releaseArrow = router.afterEach((to, _from, failure) => { if (!failure) restoreArrow(to) })
    const release = releaseNavigation
    releaseNavigation = () => { releaseArrow(); release() }
    Promise.resolve().then(() => restoreArrow(router.currentRoute.value))
  }

  function disconnect() {
    interrupt()
    pending = null
    releaseNavigation?.()
    releaseNavigation = undefined
    core?.destroy()
    core = undefined
  }

  watch(() => supported.value && enabled(), async (allowed, _previous, onCleanup) => {
    if (!allowed) { disconnect(); return }
    let canceled = false
    onCleanup(() => { canceled = true })
    try {
      const [{ createSwarmCursors }] = await Promise.all([import('swarm-cursors-vue'), router.isReady()])
      if (!canceled) connect(createSwarmCursors)
    } catch {
      if (!canceled) disconnect()
    }
  }, { flush: 'sync' })

  watch(suspended, paused => { if (paused) interrupt() }, { flush: 'sync' })

  onMounted(() => {
    preference = window.matchMedia(mouseMotion)
    preference.addEventListener('change', updateSupport)
    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('focusin', onFocus, true)
    document.addEventListener('visibilitychange', onVisibility)
    updateSupport()
  })
  onBeforeUnmount(() => {
    supported.value = false
    preference?.removeEventListener('change', updateSupport)
    window.removeEventListener('pointerdown', onPointerDown, true)
    window.removeEventListener('keydown', onKeyDown, true)
    window.removeEventListener('focusin', onFocus, true)
    document.removeEventListener('visibilitychange', onVisibility)
  })
}
