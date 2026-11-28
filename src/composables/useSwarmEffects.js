import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

export const swarmMotionQuery = '(pointer: fine) and (hover: hover) and (prefers-reduced-motion: no-preference) and (forced-colors: none)'
const accent = 'var(--cytime-swarm-accent)'
const background = 'var(--bg-base)'

export function useSwarmEffects(router, { enabled, sound, hideWorkers, setChromePersistent, suspended, allowsRoute, allowsSurface }) {
  const supported = ref(false)
  const active = ref(false)
  let preference
  let core
  let releaseNavigation
  let pending
  let connecting = Promise.resolve()
  let limitTimer
  let lastPointerType
  let routeClick

  function clearRun() {
    active.value = false
    window.clearTimeout(limitTimer)
  }

  function interrupt() {
    if (pending) pending.meta.swarmCursors = false
    if (!active.value) return
    clearRun()
    // Clear engine keyboard listeners immediately and leave the browser event alone.
    core?.stop(false)
  }

  function onPointerDown(event) {
    lastPointerType = event.pointerType
    if (lastPointerType && lastPointerType !== 'mouse') interrupt()
  }

  function onClick(event) {
    // Keyboard and accessibility tools can activate a link without a pointer press.
    const pointerType = event.pointerType || (event.detail > 0 ? lastPointerType : undefined)
    if ((pointerType && pointerType !== 'mouse') || event.sourceCapabilities?.firesTouchEvents
      || event.button !== 0 || event.defaultPrevented
      || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return
    const link = event.target.closest?.('.app-shell a[href]')
    if (!link || link.hasAttribute('download') || (link.target && link.target.toLowerCase() !== '_self')) return
    const click = { href: link.href }
    routeClick = click
    // Only the navigation initiated by this click may draw; idle returns and history are silent.
    window.setTimeout(() => { if (routeClick === click) routeClick = null }, 0)
  }

  function onKeyDown(event) {
    // Preserve Esc to skip drawing without the engine consuming the event
    // before it reaches an existing control or its native close behavior.
    if (event.key === 'Escape') interrupt()
  }

  function updateSupport() {
    supported.value = preference?.matches === true
  }

  function onVisibility() {
    if (document.hidden) interrupt()
  }

  function canPlay() {
    return enabled() && supported.value && !suspended() && !document.hidden
  }

  function updateArrow() {
    core?.setPageEnabled(allowsSurface() && !suspended())
  }

  async function replay({ sounds, volume, valid = () => true } = {}) {
    await connecting
    if (!core || !valid() || !canPlay() || !allowsSurface()) return false
    interrupt()
    const instance = core
    instance.setPageEnabled(true)
    // Startup and explicit URI replay rebuild the full scene.
    setChromePersistent(false)
    active.value = true
    limitTimer = window.setTimeout(interrupt, 5500)
    instance.replay({ sound: sounds ?? sound(), volume }).catch(() => {
      if (instance === core) interrupt()
    })
    return true
  }

  function connect(createSwarmCursors) {
    // The package treats autoOnRoute as autoplay on the initial route too.
    // Mark the current location as silent before connecting the router.
    router.currentRoute.value.meta.swarmCursors = false
    const before = router.beforeEach((to, from) => {
      interrupt()
      const click = routeClick
      routeClick = null
      pending = to
      active.value = canPlay() && from.matched.length > 0 && from.fullPath !== to.fullPath
        && allowsRoute(to)
        && click?.href === new URL(router.resolve(to).href, window.location.href).href
      to.meta.swarmCursors = active.value ? { sound: sound() } : false
      // The cover opens before lazy routes finish resolving.
      if (active.value) {
        setChromePersistent(true)
        limitTimer = window.setTimeout(interrupt, 5500)
      }
    })
    const after = router.afterEach((to, _from, failure) => {
      if (failure && pending === to) {
        pending = null
        clearRun()
      }
      if (failure || !to.meta.swarmCursors) return
      if (!canPlay() || !allowsRoute(to)) interrupt()
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
      liveInteractions: true,
      companion: true,
      companionMode: 'replace',
      hideWorkerPointers: hideWorkers(),
      autoReveal: true,
      autoRevealDelay: 120
    })
    core = instance
    const finishPlayback = () => {
      // A new route can end the previous drawing before its own cover is handed off.
      if (!pending?.meta.swarmCursors) clearRun()
    }
    instance.on('end', finishPlayback)
    instance.on('error', finishPlayback)
    instance.attachRouter(router)

    // Silencing a route also hides the companion. Restore just the native
    // arrow once that policy has been applied; this does not queue a rebuild.
    const restoreArrow = route => {
      if (core === instance && route.meta.swarmCursors === false) updateArrow()
    }
    const releaseArrow = router.afterEach((to, _from, failure) => {
      if (pending === to) pending = null
      if (!failure) restoreArrow(to)
    })
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

  watch(() => supported.value && enabled(), (allowed, _previous, onCleanup) => {
    if (!allowed) { disconnect(); return }
    let canceled = false
    onCleanup(() => { canceled = true })
    connecting = Promise.all([import('swarm-cursors-vue'), router.isReady()]).then(([{ createSwarmCursors }]) => {
      if (!canceled) connect(createSwarmCursors)
    }).catch(() => { if (!canceled) disconnect() })
  }, { flush: 'sync' })

  watch([suspended, allowsSurface], ([paused, allowed]) => {
    if (paused || !allowed) interrupt()
    updateArrow()
  }, { flush: 'post' })

  watch(hideWorkers, hidden => core?.setWorkerPointersHidden(hidden), { flush: 'sync' })

  onMounted(() => {
    preference = window.matchMedia(swarmMotionQuery)
    preference.addEventListener('change', updateSupport)
    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('click', onClick, true)
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('resize', interrupt)
    document.addEventListener('visibilitychange', onVisibility)
    updateSupport()
  })
  onBeforeUnmount(() => {
    supported.value = false
    preference?.removeEventListener('change', updateSupport)
    window.removeEventListener('pointerdown', onPointerDown, true)
    window.removeEventListener('click', onClick, true)
    window.removeEventListener('keydown', onKeyDown, true)
    window.removeEventListener('resize', interrupt)
    document.removeEventListener('visibilitychange', onVisibility)
  })
  return { active, replay, interrupt }
}
