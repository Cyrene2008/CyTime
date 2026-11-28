<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import ClassroomGroupsPanel from '../components/ClassroomGroupsPanel.vue'
import { useSettingsStore } from '../stores/settings'

defineOptions({ name: 'ClassroomView' })

const route = useRoute()
const settingsStore = useSettingsStore()
const viewport = ref(null)
const heading = ref(null)
const groupsOpen = computed(() => route.query.tool === 'groups')

const tools = [
  {
    title: '随机分组',
    icon: 'people-team-24-regular',
    path: { path: '/classroom', query: { tool: 'groups' } },
    description: '粘贴名单或填入值日成员，按组数或每组人数抽签。分完可直接投屏或复制。',
    action: '打开分组'
  },
  {
    title: '课堂流程',
    icon: 'timer-24-regular',
    path: '/classroom-flow',
    description: '把讲解、讨论和展示排成一条流程。每段到时先停下，由老师决定何时继续。',
    action: '打开计时'
  }
]

watch(() => route.query.tool, async (next, previous) => {
  if (route.path !== '/classroom' || (next !== 'groups' && previous !== 'groups')) return
  await nextTick()
  if (route.path !== '/classroom') return
  if (viewport.value) viewport.value.scrollTop = 0
  heading.value?.focus({ preventScroll: true })
})
</script>

<template>
  <section ref="viewport" class="classroom-view" aria-labelledby="classroom-title">
    <div class="classroom-wrap">
      <header class="classroom-header">
        <div>
          <p v-if="!settingsStore.examModeActive" class="classroom-kicker">CyTime · 班级大屏</p>
          <h1 id="classroom-title" ref="heading" tabindex="-1">课堂工具</h1>
          <p v-if="!groupsOpen && !settingsStore.examModeActive" class="classroom-lead">从分组讨论到限时展示，课上随手打开。</p>
        </div>
        <RouterLink v-if="groupsOpen && !settingsStore.examModeActive" class="classroom-back" to="/classroom">
          <FluentIcon icon="arrow-left-20-regular" :width="18" />工具首页
        </RouterLink>
      </header>

      <div v-if="settingsStore.examModeActive" class="classroom-empty">
        <p>退出纯净模式后，可使用课堂工具。</p>
        <RouterLink class="classroom-back" to="/time">返回时钟</RouterLink>
      </div>
      <div v-else-if="!groupsOpen" class="classroom-cards">
        <RouterLink v-for="tool in tools" :key="tool.title" class="classroom-card" :to="tool.path">
          <span class="classroom-card-icon" aria-hidden="true"><FluentIcon :icon="tool.icon" :width="27" /></span>
          <h2>{{ tool.title }}</h2>
          <p>{{ tool.description }}</p>
          <span class="classroom-card-action">{{ tool.action }}<FluentIcon icon="arrow-right-20-regular" :width="18" /></span>
        </RouterLink>
        <p class="classroom-local">两项工具都可离线使用，名单留在当前页面。</p>
      </div>
      <ClassroomGroupsPanel v-show="groupsOpen && !settingsStore.examModeActive" />
    </div>
  </section>
</template>

<style scoped>
.classroom-view {
  position: absolute;
  inset: var(--content-safe-top, 112px) 0 68px;
  overflow: hidden auto;
  overscroll-behavior: contain;
  padding: clamp(10px, 2vh, 24px) clamp(12px, 4vw, 38px) 24px;
  text-align: left;
}
.classroom-wrap { width: min(100%, 1200px); margin-inline: auto; container: classroom-page / inline-size; }
.classroom-header { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: clamp(16px, 3vh, 32px); }
.classroom-kicker { margin: 0 0 6px; color: var(--accent); font-size: calc(12px * var(--stage-read-scale, 1)); font-weight: 650; }
.classroom-header h1 { margin: 0; font-size: clamp(27px, calc(32px * var(--stage-read-scale, 1)), 54px); line-height: 1.15; }
.classroom-lead { margin: .6em 0 0; color: var(--text-secondary); font-size: calc(14px * var(--stage-read-scale, 1)); }
.classroom-back { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 44px; padding-inline: 10px; border: 1px solid var(--border-default); border-radius: 8px; color: var(--text-primary); background: var(--bg-card); font-size: 13px; text-decoration: none; white-space: nowrap; }
.classroom-back:hover { border-color: var(--accent); color: var(--accent); }
.classroom-cards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: clamp(12px, 2vw, 24px); }
.classroom-card, .classroom-empty {
  border: 1px solid var(--border-default);
  border-radius: 14px;
  background: color-mix(in srgb, var(--bg-card-solid), transparent 9%);
  box-shadow: var(--shadow-4);
}
.classroom-card {
  display: grid;
  justify-items: start;
  grid-template-rows: auto auto 1fr auto;
  gap: clamp(8px, 1.5vh, 16px);
  padding: clamp(16px, 3vw, 38px);
  color: var(--text-primary);
  text-decoration: none;
}
.classroom-card:hover { border-color: var(--accent); background: var(--bg-card-solid); }
.classroom-card:focus-visible, .classroom-back:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.classroom-card-icon { display: grid; place-items: center; width: calc(46px * var(--stage-read-scale, 1)); aspect-ratio: 1; border-radius: 12px; color: var(--accent); background: color-mix(in srgb, var(--accent), transparent 88%); }
.classroom-card h2 { margin: 0; font-size: calc(23px * var(--stage-read-scale, 1)); }
.classroom-card p { max-width: 32em; margin: 0; color: var(--text-secondary); font-size: calc(14px * var(--stage-read-scale, 1)); line-height: 1.65; }
.classroom-card-action { display: flex; align-items: center; gap: 8px; margin-top: 5px; color: var(--accent); font-size: calc(13px * var(--stage-read-scale, 1)); font-weight: 700; }
.classroom-local { grid-column: 1 / -1; margin: 0; color: var(--text-muted); font-size: calc(12px * var(--stage-read-scale, 1)); }
.classroom-empty { padding: 16px; color: var(--text-secondary); }
.classroom-empty p { margin: 0 0 10px; }
@container classroom-page (max-width: 530px) {
  .classroom-cards { grid-template-columns: minmax(0, 1fr); }
  .classroom-card-icon { width: 40px; }
}
:global(.mini-mode .classroom-view) { inset: max(92px, var(--content-safe-top, 92px)) 0 26px; padding-top: 4px; }
:global(.app-shell:not(.mini-mode):has(.task-docks.is-compact) .classroom-view) { bottom: var(--board-task-clearance, 150px); }
:global(.app-shell:not(.mini-mode):has(.task-docks-left:not(.is-compact)) .classroom-view) {
  padding-left: calc(var(--stage-gutter, 22px) + var(--task-side-width, 190px) + 12px);
}
:global(.app-shell:not(.mini-mode):has(.task-docks-right:not(.is-compact)) .classroom-view) {
  padding-right: calc(var(--stage-gutter, 22px) + var(--task-side-width, 190px) + 12px);
}
</style>
