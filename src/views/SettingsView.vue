<script setup>
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { searchXiaomiCities, locateWeatherCity } from '../services/weather'
import { fetchQuoteCategories, fetchQuoteStats, quoteApiEndpoints, readQuoteFile } from '../services/quotes'
import { getPlatform } from '../services/platform'
import { checkDesktopUpdate, downloadDesktopUpdate, isDesktop as detectDesktop, setDesktopAutostart, setDesktopUriRegistration } from '../services/desktop'
import { fetchNetworkTime, timeSourceOptions } from '../services/timeSync'
import { useSettingsStore, defaultSettings } from '../stores/settings'
import { useContentStore } from '../stores/content'
import { useWeatherStore } from '../stores/weather'
import { useTimeStore } from '../stores/time'
import { FILING_NAME, FILING_URL, QUOTE_API_DOCS } from '../config/branding'
const QuoteSourcePanel = defineAsyncComponent(() => import('../components/QuoteSourcePanel.vue'))
const LocalQuoteSourcePanel = defineAsyncComponent(() => import('../components/LocalQuoteSourcePanel.vue'))
const DutySettingsPanel = defineAsyncComponent(() => import('../components/DutySettingsPanel.vue'))
const BackupPanel = defineAsyncComponent(() => import('../components/BackupPanel.vue'))
const ScheduleImportPanel = defineAsyncComponent(() => import('../components/ScheduleImportPanel.vue'))

const emit = defineEmits(['close'])
const props = defineProps({ desktopAvailable: { type: Boolean, default: false }, initialPane: { type: String, default: '' } })
const isDesktop = () => props.desktopAvailable || detectDesktop()
const settingsStore = useSettingsStore()
const contentStore = useContentStore()
const weatherStore = useWeatherStore()
const timeStore = useTimeStore()
const dockRef = ref(null)
const navIndicator = ref(null)
const indicatorGeom = ref(null)
let navSyncFrame = 0
let navAnimation = null
const draft = reactive({
  ...settingsStore.settings,
  quoteLocalSources: JSON.parse(JSON.stringify(settingsStore.settings.quoteLocalSources || {})),
  quoteSources: JSON.parse(JSON.stringify(settingsStore.settings.quoteSources || {})),
  quoteApiCategoryWeights: JSON.parse(JSON.stringify(settingsStore.settings.quoteApiCategoryWeights || {}))
})
const activePane = ref('startup')
const activeGroup = ref(null)
const groups = [
  { id: 'workspace', label: '基础功能', description: '启动、显示与课程', icon: 'options-20-regular', items: [{ id: 'startup', label: '启动页面', icon: 'clock-20-regular' }, { id: 'display', label: '显示内容', icon: 'eye-20-regular' }, { id: 'countdown', label: '重要日', icon: 'timer-20-regular' }, { id: 'schedule', label: '课程表', icon: 'calendar-20-regular' }, { id: 'duty', label: '值日管理', icon: 'people-20-regular' }] },
  { id: 'appearance', label: '视觉外观', description: '颜色、字体与背景', icon: 'color-20-regular', items: [{ id: 'overall', label: '整体样式', icon: 'color-20-regular' }, { id: 'time', label: '时间显示', icon: 'clock-20-regular' }, { id: 'layout', label: '组件布局', icon: 'panel-left-20-regular' }, { id: 'customize', label: '组件定制', icon: 'paint-brush-20-regular' }] },
  { id: 'environment', label: '环境提醒', description: '天气与城市', icon: 'alert-20-regular', items: [{ id: 'weather', label: '天气', icon: 'weather-partly-cloudy-day-20-regular' }, { id: 'location', label: '城市', icon: 'location-20-regular' }] },
  { id: 'content', label: '内容语录', description: '语录来源与样式', icon: 'book-open-20-regular', items: [{ id: 'refresh', label: '自动轮换', icon: 'arrow-clockwise-20-regular' }, { id: 'effects', label: '语录样式', icon: 'text-20-regular' }, { id: 'channels', label: '语录来源', icon: 'book-open-20-regular' }] },
  { id: 'system', label: '系统数据', description: '校时、备份与更新', icon: 'database-20-regular', items: [{ id: 'calibration', label: '时间校准', icon: 'time-and-weather-20-regular' }, { id: 'updates', label: '应用更新', icon: 'arrow-sync-20-regular' }, { id: 'data', label: '备份与数据', icon: 'database-20-regular' }] }
]
if (props.initialPane) {
  const targetGroup = groups.find(group => group.items.some(item => item.id === props.initialPane))
  if (targetGroup) {
    activeGroup.value = targetGroup
    activePane.value = props.initialPane
  }
}
const startupModeOptions = [{ value: 'time', label: '时钟' }, { value: 'countdown', label: '倒计时' }, { value: 'timer', label: '计时器' }]
const fontOptions = [{ value: 'wengfaluosi', label: '翁法罗斯（默认）' }, { value: 'system', label: '系统字体' }, { value: 'mono', label: '等宽数字' }, { value: 'serif', label: '衬线数字' }]
const backgroundOptions = [{ value: 'mica', label: '柔光' }, { value: 'acrylic', label: '渐变' }, { value: 'solid', label: '纯色' }]
const animationOptions = [{ value: 'typewriter', label: '自然打字' }, { value: 'crossfade', label: '平滑显示' }, { value: 'none', label: '直接显示' }]
const typeSpeedOptions = [{ value: 'slow', label: '慢速' }, { value: 'standard', label: '标准' }, { value: 'fast', label: '快速' }]
const weekdayOptions = [{ value: 1, label: '周一' }, { value: 2, label: '周二' }, { value: 3, label: '周三' }, { value: 4, label: '周四' }, { value: 5, label: '周五' }, { value: 6, label: '周六' }, { value: 0, label: '周日' }]
const subjectOptions = ['语文', '数学', '英语', '物理', '化学', '生物', '历史', '政治', '地理', '其他'].map(value => ({ value, label: value }))
const scheduleTabs = [{ value: 'overview', label: '概览' }, { value: 'library', label: '课程库' }, { value: 'daily', label: '日课程表' }]
const scheduleTab = ref('overview')
const scheduleDay = ref(1)
const scheduleDayLessons = computed(() => contentStore.content.schedule.filter(item => item.weekday === Number(scheduleDay.value)).sort((a, b) => a.startAt.localeCompare(b.startAt)))
const scheduleCourses = computed(() => [...new Map(contentStore.content.schedule.map(item => [item.subject, item])).values()])
const todayLessons = computed(() => contentStore.content.schedule.filter(item => item.weekday === new Date().getDay()).sort((a, b) => a.startAt.localeCompare(b.startAt)))

const importantName = ref('')
const importantDate = ref('')
const quoteDraft = ref('')
const quoteImportInput = ref(null)
const lessonSubject = ref('')
const lessonWeekday = ref(1)
const lessonStart = ref('08:00')
const lessonEnd = ref('08:45')
const lessonRoom = ref('')
const editingLessonId = ref(null)
const cityResults = ref([])
const citySearchOpen = ref(false)
const citySearchLoading = ref(false)
let selectedCityName = draft.weatherCityName
let citySearchGeneration = 0
let quoteConfigGeneration = 0
let quoteConfigController
let locateController
let manualTimeController
let disposed = false
const quoteCategories = ref([])
const quoteCounts = ref({})
const quoteTotal = ref(0)
const quoteCategoryLoading = ref(false)
const quoteConfigOpen = ref(false)
const quoteManagerOpen = ref(false)
const quotePage = ref(1)
const quotePageSize = ref(10)
const selectedQuotes = ref([])
const quotePageSizeOptions = [{ value: 10, label: '10 条/页' }, { value: 20, label: '20 条/页' }, { value: 50, label: '50 条/页' }, { value: 100, label: '100 条/页' }]
const quoteEndpointOptions = quoteApiEndpoints.map(item => ({ value: item.id, label: item.label }))
const quotePageCount = computed(() => Math.max(1, Math.ceil(contentStore.content.quotes.length / quotePageSize.value)))
const pagedQuotes = computed(() => contentStore.content.quotes.slice((quotePage.value - 1) * quotePageSize.value, quotePage.value * quotePageSize.value))
const allPageSelected = computed(() => pagedQuotes.value.length > 0 && pagedQuotes.value.every(quote => selectedQuotes.value.includes(quote)))
const platformLabel = ref('PWA')
const toastRef = ref(null)
const appVersion = __APP_VERSION__
const buildId = __BUILD_ID__
const autostartMessage = ref('')
const feedbackMessage = ref('')
const uriHelpOpen = ref(false)
const uriMessage = ref('')
const timeSyncMessage = ref('')
const locating = ref(false)
const locateMessage = ref('')
const updateState = reactive({ checking: false, installing: false, available: false, version: '', url: '', downloadUrl: '', message: '' })
const desktopMode = computed(() => props.desktopAvailable || isDesktop())
let citySearchTimer
let citySearchController

function enterGroup(group) { activeGroup.value = group; activePane.value = group.items[0]?.id || activePane.value; queueNavSync(true) }
function selectPane(pane) { activePane.value = pane; queueNavSync(true) }
function activeNavEl() {
  return dockRef.value?.querySelector('.settings-group-button.active, .settings-nav-item.active, .settings-nav-project.active')
}
function syncNavIndicator(animate = false) {
  const dock = dockRef.value
  const indicator = navIndicator.value
  if (!dock || !indicator) return
  navAnimation?.cancel()
  navAnimation = null
  const target = activeNavEl()
  if (!target) { indicator.style.opacity = '0'; indicatorGeom.value = null; return }
  const dockRect = dock.getBoundingClientRect()
  const rect = target.getBoundingClientRect()
  const scaleY = dock.offsetHeight ? (dockRect.height / dock.offsetHeight) : 1
  const top = (rect.top - dockRect.top) / (scaleY || 1) + dock.scrollTop + (rect.height / (scaleY || 1) - 20) / 2
  const next = { top, height: 20 }
  const prev = indicatorGeom.value
  const transform = geometry => `translateY(${geometry.top}px) scaleY(${geometry.height / 20})`
  indicator.style.opacity = '1'
  indicator.style.transform = transform(next)
  indicatorGeom.value = next
  if (!animate || !prev || prev.top === next.top || typeof indicator.animate !== 'function' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
  const goingDown = next.top + next.height / 2 >= prev.top + prev.height / 2
  const stretchTop = goingDown ? prev.top : next.top
  const stretchBottom = goingDown ? next.top + next.height : prev.top + prev.height
  const stretchHeight = Math.max(next.height, stretchBottom - stretchTop)
  navAnimation = indicator.animate([
    { transform: transform(prev) },
    { transform: transform({ top: stretchTop, height: stretchHeight }), offset: 0.52 },
    { transform: transform(next) }
  ], { duration: 200, easing: 'cubic-bezier(.1, .9, .2, 1)' })
}
function queueNavSync(animate = false) {
  if (navSyncFrame) cancelAnimationFrame(navSyncFrame)
  navSyncFrame = requestAnimationFrame(async () => {
    navSyncFrame = 0
    await nextTick()
    syncNavIndicator(animate)
  })
}
function save() {
  if (!draft.weatherCityNum) { toastRef.value?.add({ title: '请从搜索结果中选择城市', duration: 2400 }); return }
  settingsStore.update({ ...draft })
  toastRef.value?.add({ title: '设置已保存', duration: 2400 })
}
function cancel() { emit('close') }
function daysUntil(date) { return Math.max(0, Math.ceil((new Date(`${date}T00:00:00`).getTime() - Date.now()) / 86400000)) }
function addImportant() { contentStore.addImportantDay(importantName.value.trim(), importantDate.value); importantName.value = ''; importantDate.value = '' }
function addQuote() { const value = quoteDraft.value.trim(); if (!value) return; contentStore.addQuote(value); quoteDraft.value = ''; quotePage.value = quotePageCount.value }
function openQuoteManager() { quoteManagerOpen.value = true; quotePage.value = 1; selectedQuotes.value = [] }
function toggleAllPage() {
  if (allPageSelected.value) selectedQuotes.value = selectedQuotes.value.filter(quote => !pagedQuotes.value.includes(quote))
  else selectedQuotes.value = [...new Set([...selectedQuotes.value, ...pagedQuotes.value])]
}
function removeSelectedQuotes() { contentStore.removeQuotes(selectedQuotes.value); selectedQuotes.value = [] }
watch([quotePageSize, () => contentStore.content.quotes.length], () => { quotePage.value = Math.min(quotePage.value, quotePageCount.value); selectedQuotes.value = selectedQuotes.value.filter(quote => contentStore.content.quotes.includes(quote)) })
watch(() => draft.quoteApiEndpoint, () => { if (quoteConfigOpen.value) refreshQuoteCategories() })
function addLesson() { const lesson = { subject: lessonSubject.value.trim() || '未命名课程', weekday: Number(lessonWeekday.value), startAt: lessonStart.value, endAt: lessonEnd.value, room: lessonRoom.value.trim() }; const existing = contentStore.content.schedule.find(item => item.id === editingLessonId.value); if (existing) contentStore.updateLesson(existing, lesson); else contentStore.addLesson(lesson); editingLessonId.value = null; lessonSubject.value = ''; lessonRoom.value = '' }
function editLesson(lesson) { editingLessonId.value = lesson.id; lessonSubject.value = lesson.subject; lessonWeekday.value = lesson.weekday; lessonStart.value = lesson.startAt; lessonEnd.value = lesson.endAt; lessonRoom.value = lesson.room || '' }
function cancelLessonEdit() { editingLessonId.value = null; lessonSubject.value = ''; lessonRoom.value = '' }
async function importQuotes(event) { const file = event.target.files?.[0]; if (!file) return; try { contentStore.addQuotes(await readQuoteFile(file)); feedbackMessage.value = '语录已导入' } catch { feedbackMessage.value = '金句文件格式无效' }; event.target.value = '' }
async function refreshQuoteCategories() {
  const request = ++quoteConfigGeneration
  quoteConfigController?.abort()
  const controller = new AbortController()
  quoteConfigController = controller
  quoteCategoryLoading.value = true
  const preferred = draft.quoteApiEndpoint || settingsStore.settings.quoteApiEndpoint
  try {
    const [list, stats] = await Promise.all([fetchQuoteCategories(controller.signal, preferred).catch(() => []), fetchQuoteStats(controller.signal, preferred).catch(() => null)])
    if (disposed || request !== quoteConfigGeneration || controller.signal.aborted) return
    quoteCategories.value = list.length ? list : ['崩铁', '幽默解压', '名人名言', '学习', '人民日报']
    if (stats) { quoteCounts.value = stats.categories; quoteTotal.value = stats.total }
  } finally { if (!disposed && request === quoteConfigGeneration) quoteCategoryLoading.value = false }
}
function toggleQuoteCategory(category) { const selected = new Set(draft.quoteApiCategories || []); if (selected.has(category)) selected.delete(category); else selected.add(category); draft.quoteApiCategories = [...selected] }
function openQuoteConfig() { quoteConfigOpen.value = true; refreshQuoteCategories() }
function toggleCategoryWeights() {
  draft.quoteApiCategoryWeightsEnabled = !draft.quoteApiCategoryWeightsEnabled
  if (!draft.quoteApiCategoryWeightsEnabled) return
  if (!draft.quoteApiCategoryWeights || typeof draft.quoteApiCategoryWeights !== 'object') draft.quoteApiCategoryWeights = {}
  for (const category of draft.quoteApiCategories || []) {
    if (draft.quoteApiCategoryWeights[category] === undefined) draft.quoteApiCategoryWeights[category] = 1
  }
}
function categoryWeight(category) { return draft.quoteApiCategoryWeights?.[category] ?? 1 }
function setCategoryWeight(category, event) {
  if (!draft.quoteApiCategoryWeights || typeof draft.quoteApiCategoryWeights !== 'object') draft.quoteApiCategoryWeights = {}
  draft.quoteApiCategoryWeights[category] = Math.max(0, Number(event.target.value) || 0)
}
function reloadApp() { window.location.reload() }
function pickInstallerAsset(latest) {
  const assets = Array.isArray(latest?.assets) ? latest.assets : []
  const isWindowsInstaller = asset => /(-setup\.exe|setup\.exe|installer\.exe|\.msi)$/i.test(asset?.name || '') || /-setup\.exe$/i.test(asset?.browser_download_url || '')
  return assets.find(isWindowsInstaller)?.browser_download_url
    || assets.find(asset => /\.exe$/i.test(asset?.name || asset?.browser_download_url || ''))?.browser_download_url
    || ''
}
async function checkForUpdate() {
  updateState.checking = true
  try {
    const latest = await checkDesktopUpdate()
    const current = appVersion
    updateState.version = latest.tag_name || ''
    updateState.url = latest.html_url || ''
    updateState.downloadUrl = pickInstallerAsset(latest)
    updateState.available = Boolean(updateState.version && updateState.version.replace(/^v/, '') !== current)
    if (!updateState.available) updateState.message = `当前已是最新版本 v${current}`
    else if (!updateState.downloadUrl) updateState.message = `发现新版本 ${updateState.version}，但 Release 中没有 Windows 安装包`
    else updateState.message = `发现新版本 ${updateState.version}`
  } catch (error) {
    updateState.message = error?.message || '检查更新失败'
  } finally {
    updateState.checking = false
  }
}
function openReleasePage() {
  if (updateState.url) window.open(updateState.url, '_blank', 'noopener,noreferrer')
}
async function installUpdate() {
  if (updateState.installing) return
  if (!updateState.downloadUrl) {
    updateState.message = updateState.url
      ? '未找到可安装的 Windows 安装包，请到 Release 页面手动下载'
      : '请先检查更新'
    return
  }
  updateState.installing = true
  updateState.message = '正在下载安装包…'
  try {
    await downloadDesktopUpdate(updateState.downloadUrl)
    updateState.message = '安装程序已启动，请按提示完成升级'
  } catch (error) {
    updateState.message = error?.message || '下载安装包失败'
  } finally {
    updateState.installing = false
  }
}
async function requestNotifications() { if (typeof Notification === 'undefined') return; const permission = await Notification.requestPermission(); if (permission === 'granted') draft.notificationEnabled = true }
function openCitySearch() { citySearchOpen.value = true; scheduleCitySearch() }
function scheduleCitySearch() {
  window.clearTimeout(citySearchTimer)
  citySearchController?.abort()
  citySearchGeneration++
  cityResults.value = []
  citySearchLoading.value = Boolean(draft.weatherCityName.trim())
  citySearchTimer = window.setTimeout(searchCities, 240)
}
async function searchCities() {
  const query = draft.weatherCityName.trim()
  const request = ++citySearchGeneration
  if (!query) { cityResults.value = []; citySearchLoading.value = false; return }
  const controller = new AbortController()
  citySearchController = controller
  citySearchLoading.value = true
  try {
    const cities = await searchXiaomiCities(query, controller.signal)
    if (!disposed && request === citySearchGeneration && !controller.signal.aborted) cityResults.value = cities
  } catch { if (!disposed && request === citySearchGeneration) cityResults.value = [] }
  finally { if (!disposed && request === citySearchGeneration) citySearchLoading.value = false }
}
function selectCity(city) {
  locateController?.abort()
  locating.value = false
  selectedCityName = city.name
  draft.weatherCityName = city.name
  draft.weatherCityNum = city.locationKey.replace(/^weathercn:/, '')
  draft.weatherAutoLocated = true
  citySearchOpen.value = false
  window.clearTimeout(citySearchTimer)
  citySearchController?.abort()
  citySearchGeneration++
  citySearchLoading.value = false
}
function closeCitySearch() { citySearchOpen.value = false }
function refreshWeather() { if (draft.weatherCityNum) weatherStore.refresh(draft.weatherCityNum, true) }
async function toggleAutostart() { if (!desktopMode.value) return; autostartMessage.value = '正在设置…'; try { const enabled = await setDesktopAutostart(!draft.autostart, draft.autostartHidden); draft.autostart = enabled; settingsStore.update({ autostart: enabled, autostartHidden: draft.autostartHidden }); autostartMessage.value = enabled ? '已开启开机启动' : '已关闭'; } catch { autostartMessage.value = '设置失败，请重试' } }
async function setAutostartHidden(hidden) {
  if (draft.autostartHidden === hidden) return
  draft.autostartHidden = hidden
  if (!draft.autostart) { settingsStore.update({ autostartHidden: hidden }); return }
  autostartMessage.value = '正在设置…'
  try {
    await setDesktopAutostart(true, hidden)
    settingsStore.update({ autostart: true, autostartHidden: hidden })
    autostartMessage.value = hidden ? '将从后台启动' : '将显示主窗口'
  } catch {
    autostartMessage.value = '设置失败，请重试'
  }
}
async function toggleUriRegistration() { if (!desktopMode.value) return; uriMessage.value = '正在设置…'; try { const enabled = await setDesktopUriRegistration(!draft.uriRegistration); draft.uriRegistration = enabled; settingsStore.update({ uriRegistration: enabled }); uriMessage.value = enabled ? '已允许链接调用' : '已关闭链接调用'; } catch { uriMessage.value = '设置失败，请重试' } }
function toggleAutoTimeSync() {
  const enabled = draft.timeSyncEnabled && draft.timeSyncSource !== 'system'
  draft.timeSyncEnabled = !enabled
  if (!enabled && draft.timeSyncSource === 'system') draft.timeSyncSource = 'auto'
}
async function syncTimeNow() {
  manualTimeController?.abort()
  const controller = new AbortController()
  manualTimeController = controller
  const source = draft.timeSyncSource || 'auto'
  if (source === 'system') {
    timeStore.setClockOffset(0)
    timeSyncMessage.value = '已跟随电脑时间'
    return
  }
  timeSyncMessage.value = '正在校时…'
  const startedAt = Date.now()
  try {
    const serverTime = await fetchNetworkTime(source, controller.signal)
    if (disposed || controller.signal.aborted || source !== draft.timeSyncSource) return
    timeStore.setClockOffset(serverTime - (startedAt + (Date.now() - startedAt) / 2))
    timeSyncMessage.value = '时间已校准'
  } catch {
    if (!disposed && !controller.signal.aborted) timeSyncMessage.value = '暂时无法校时，请重试'
  }
}
async function autoLocate() {
  locateController?.abort()
  const controller = new AbortController()
  locateController = controller
  locating.value = true
  locateMessage.value = ''
  try {
    const located = await locateWeatherCity(controller.signal)
    if (disposed || controller.signal.aborted) return
    selectedCityName = located.name
    draft.weatherCityName = located.name
    draft.weatherCityNum = located.num
    draft.weatherAutoLocated = true
    locateMessage.value = `已定位到 ${located.name}，保存后生效`
    weatherStore.refresh(located.num, true)
  } catch {
    if (!disposed && !controller.signal.aborted) locateMessage.value = '无法获取位置，请手动选择城市'
  } finally {
    if (!disposed && controller === locateController) locating.value = false
  }
}

watch(() => draft.weatherCityName, name => {
  if (name !== selectedCityName) draft.weatherCityNum = ''
  if (citySearchOpen.value) scheduleCitySearch()
})
watch(quoteConfigOpen, open => { if (!open) { quoteConfigGeneration++; quoteConfigController?.abort(); quoteCategoryLoading.value = false } })
watch([activePane, activeGroup], () => queueNavSync(true))
watch(activePane, pane => {
  if (pane === 'weather' || pane === 'location') weatherStore.refresh(draft.weatherCityNum)
  else { citySearchGeneration++; window.clearTimeout(citySearchTimer); citySearchController?.abort(); citySearchOpen.value = false }
}, { immediate: true })
onMounted(() => {
  queueNavSync(false)
  getPlatform().then(platform => { platformLabel.value = String(platform).toUpperCase() }).catch(() => {})
})
onBeforeUnmount(() => {
  disposed = true
  window.clearTimeout(citySearchTimer)
  citySearchController?.abort()
  quoteConfigController?.abort()
  locateController?.abort()
  manualTimeController?.abort()
  if (navSyncFrame) cancelAnimationFrame(navSyncFrame)
  navAnimation?.cancel()
})
</script>

<template>
  <section class="settings-sheet" role="dialog" aria-label="设置">
    <header class="settings-header"><div class="settings-title"><FluentIcon icon="options-24-regular" :width="21" /><h1>设置</h1></div><button type="button" class="settings-close" aria-label="关闭设置" @click="cancel"><FluentIcon icon="dismiss-20-regular" :width="18" /></button></header>
    <div class="settings-workspace">
      <aside ref="dockRef" class="settings-dock">
        <div ref="navIndicator" class="settings-nav-indicator" aria-hidden="true" style="opacity: 0" />
        <template v-if="!activeGroup">
          <nav class="settings-nav settings-root-nav" aria-label="设置分类"><button v-for="group in groups" :key="group.id" type="button" class="settings-group-button" :class="{ active: activePane !== 'about' && group.items.some(item => item.id === activePane) }" @click="enterGroup(group)"><FluentIcon :icon="group.icon" :width="18" /><span><strong>{{ group.label }}</strong><small>{{ group.description }}</small></span><FluentIcon icon="chevron-right-16-regular" :width="14" class="group-chevron" /></button></nav>
          <button type="button" class="settings-nav-project" :class="{ active: activePane === 'about' }" @click="activePane = 'about'; queueNavSync(true)"><FluentIcon icon="info-20-regular" :width="17" /><span>项目信息</span></button>
        </template>
        <template v-else>
          <button type="button" class="settings-dock-back" @click="activeGroup = null; queueNavSync(true)"><FluentIcon icon="arrow-left-20-regular" :width="18" /><span>返回</span></button>
          <div class="settings-subnav-heading"><FluentIcon :icon="activeGroup.icon" :width="18" /><div><strong>{{ activeGroup.label }}</strong><small>{{ activeGroup.description }}</small></div></div>
          <nav class="settings-nav settings-subnav" :aria-label="`${activeGroup.label}设置`"><button v-for="item in activeGroup.items" :key="item.id" type="button" class="settings-nav-item" :class="{ active: activePane === item.id }" @click="selectPane(item.id)"><FluentIcon :icon="item.icon" :width="16" /><span>{{ item.label }}</span></button></nav>
        </template>
        <div class="settings-dock-footer">CyTime 昔时时钟 · v{{ appVersion }}<template v-if="buildId"> · build {{ buildId }}</template></div>
      </aside>

      <div class="settings-main"><div class="settings-scroll"><div :key="activePane" class="settings-pane-content">
        <template v-if="activePane === 'startup'">
          <span class="settings-kicker">基础功能</span><h2>启动页面</h2><p class="settings-lead">设置启动页面和常用行为。</p>
          <section class="setting-card">
            <div class="setting-card-heading"><FluentIcon icon="clock-20-regular" :width="20" /><div><h3>默认页面</h3><p>打开应用时显示的页面。</p></div></div>
            <div class="segmented-control segmented-three"><button v-for="item in startupModeOptions" :key="item.value" type="button" :class="{ active: draft.startupMode === item.value }" @click="draft.startupMode = item.value">{{ item.label }}</button></div>
            <label v-if="isDesktop()" class="setting-select-label startup-window-select">窗口模式<FluentSelect v-model="draft.startupWindowMode" :options="[{ value: 'mini', label: '小窗（Mini）' }, { value: 'normal', label: '常规窗口' }, { value: 'max', label: '最大化' }, { value: 'full', label: '全屏' }]" /></label>
          </section>
          <section class="setting-card setting-row"><div><h3>保持屏幕常亮</h3><p>使用时不自动息屏。</p></div><button type="button" class="switch" :class="{ on: draft.preventSleep }" :aria-pressed="draft.preventSleep" @click="draft.preventSleep = !draft.preventSleep"><i></i></button></section>
          <section class="setting-card setting-row"><div><h3>空闲返回时钟</h3><p>30 秒无操作时返回时钟。</p></div><button type="button" class="switch" :class="{ on: draft.idleReturnTime }" :aria-pressed="draft.idleReturnTime" @click="draft.idleReturnTime = !draft.idleReturnTime"><i></i></button></section>
          <section v-if="isDesktop()" class="setting-card">
            <div class="setting-row"><div><h3>开机自启动</h3><p>登录电脑后自动运行。</p><small v-if="autostartMessage" class="inline-status">{{ autostartMessage }}</small></div><button type="button" class="switch" :class="{ on: draft.autostart }" :aria-pressed="draft.autostart" @click="toggleAutostart"><i></i></button></div>
            <div v-if="draft.autostart" class="segmented-control segmented-two autostart-mode"><button type="button" :class="{ active: draft.autostartHidden }" @click="setAutostartHidden(true)">后台启动</button><button type="button" :class="{ active: !draft.autostartHidden }" @click="setAutostartHidden(false)">显示窗口</button></div>
          </section>
        </template>

        <template v-else-if="activePane === 'display'">
          <span class="settings-kicker">基础功能</span><h2>显示内容</h2><p class="settings-lead">选择时钟上要显示的内容。</p>
          <section class="setting-card"><div v-for="item in [{ key: 'showWeather', label: '天气' }, { key: 'showDayProgress', label: '每日进度', desc: '查看今天的时间进度。' }, { key: 'showDate', label: '日期与星期' }, { key: 'showLunar', label: '农历日期' }, { key: 'showAlmanac', label: '黄历宜忌' }, { key: 'showQuote', label: '语录' }, { key: 'showClockSeconds', label: '显示秒数' }, { key: 'showBlackboard', label: '小黑板', desc: '值日安排与计时任务。' }]" :key="item.key" class="setting-row"><div><h3>{{ item.label }}</h3><p v-if="item.desc">{{ item.desc }}</p></div><button type="button" class="switch" :class="{ on: draft[item.key] }" :aria-pressed="draft[item.key]" @click="draft[item.key] = !draft[item.key]"><i></i></button></div></section>
          <section class="setting-card setting-row"><div><h3>作业板</h3><p>查看和布置作业。</p></div><button type="button" class="switch" :class="{ on: draft.showHomework }" :aria-pressed="draft.showHomework" @click="draft.showHomework = !draft.showHomework"><i></i></button></section>
          <section class="setting-card setting-row"><div><h3>课程提示</h3><p>显示当前课程和下一节课。</p></div><button type="button" class="switch" :class="{ on: draft.showSchedule }" :aria-pressed="draft.showSchedule" @click="draft.showSchedule = !draft.showSchedule"><i></i></button></section>
        </template>

        <template v-else-if="activePane === 'countdown'"><span class="settings-kicker">基础功能</span><h2>重要日</h2><p class="settings-lead">记下考试、生日和其它重要日期。</p><section class="setting-card"><div class="card-toolbar"><div><h3>添加日期</h3></div><div class="inline-form"><input v-model="importantName" placeholder="名称" /><FluentDatePicker v-model="importantDate" placeholder="日期" /><button type="button" class="subtle-button" @click="addImportant">添加</button></div></div><div class="managed-list"><div v-for="item in contentStore.content.importantDays" :key="item.id" class="managed-item"><span><strong>{{ item.name }}</strong><small>{{ item.date }} · 还有 {{ daysUntil(item.date) }} 天</small></span><button type="button" class="icon-text-button" @click="contentStore.removeImportantDay(item)">删除</button></div></div></section></template>

        <template v-else-if="activePane === 'schedule'">
          <span class="settings-kicker">基础功能</span><h2>课程表</h2><p class="settings-lead">管理每周课程安排。</p>
          <ScheduleImportPanel @imported="$event && cancelLessonEdit()" />
          <div class="settings-tabs"><button v-for="tab in scheduleTabs" :key="tab.value" type="button" :class="{ active: scheduleTab === tab.value }" @click="scheduleTab = tab.value">{{ tab.label }}</button></div>
          <template v-if="scheduleTab === 'overview'">
            <section class="schedule-summary-grid"><div class="setting-card"><small>今日课程</small><strong>{{ todayLessons.length }}</strong><span>{{ todayLessons.length ? '今日课时' : '今天没有课程' }}</span></div><div class="setting-card"><small>每周课时</small><strong>{{ contentStore.content.schedule.length }}</strong></div><div class="setting-card"><small>课程种类</small><strong>{{ scheduleCourses.length }}</strong></div></section>
            <section class="setting-card"><h3>今日课程</h3><div v-if="todayLessons.length" class="managed-list"><div v-for="lesson in todayLessons" :key="lesson.id" class="managed-item"><span><strong>{{ lesson.subject }}</strong><small>{{ lesson.startAt }} - {{ lesson.endAt }} {{ lesson.room }}</small></span></div></div><p v-else class="empty-inline">今天没有课程。</p></section>
          </template>
          <template v-else-if="scheduleTab === 'library'">
            <section class="setting-card"><div class="card-toolbar"><h3>课程库</h3><span class="task-total">{{ scheduleCourses.length }} 门课程</span></div><div class="managed-list"><div v-for="course in scheduleCourses" :key="course.subject" class="managed-item"><span><strong>{{ course.subject }}</strong><small>{{ course.room || '未设置教室' }}</small></span></div><p v-if="!scheduleCourses.length" class="empty-inline">还没有课程。</p></div></section>
          </template>
          <template v-else-if="scheduleTab === 'daily'">
            <section class="setting-card">
              <div class="schedule-toolbar"><FluentSelect v-model="scheduleDay" :options="weekdayOptions" aria-label="查看星期" /><span>{{ scheduleDayLessons.length }} 节课</span></div>
              <div class="inline-form schedule-form"><input v-model="lessonSubject" placeholder="课程名称" /><FluentSelect v-model="lessonWeekday" :options="weekdayOptions" aria-label="上课星期" /><FluentTimePicker v-model="lessonStart" placeholder="上课时间" /><FluentTimePicker v-model="lessonEnd" placeholder="下课时间" /><input v-model="lessonRoom" placeholder="教室（选填）" /><button type="button" class="subtle-button" @click="addLesson">{{ editingLessonId ? '保存课程' : '添加课程' }}</button><button v-if="editingLessonId" type="button" class="subtle-button" @click="cancelLessonEdit">取消</button></div>
              <div class="managed-list"><div v-for="lesson in scheduleDayLessons" :key="lesson.id" class="managed-item"><span><strong>{{ lesson.subject }}</strong><small>{{ lesson.startAt }} - {{ lesson.endAt }} {{ lesson.room }}</small></span><span class="managed-actions"><button type="button" class="icon-text-button" @click="editLesson(lesson)">编辑</button><button type="button" class="icon-text-button" @click="contentStore.removeLesson(lesson)">删除</button></span></div><p v-if="!scheduleDayLessons.length" class="empty-inline">这一天还没有课程。</p></div>
            </section>
          </template>
        </template>

        <template v-else-if="activePane === 'duty'"><span class="settings-kicker">基础功能</span><h2>值日管理</h2><p class="settings-lead">管理成员、任务和轮换排班。</p><DutySettingsPanel :draft="draft" /></template>
        <template v-else-if="activePane === 'overall'">
          <span class="settings-kicker">视觉外观</span><h2>整体样式</h2><p class="settings-lead">选择主题、字体和背景。</p>
          <section class="setting-card"><h3>主题</h3><div class="theme-options"><button type="button" class="theme-option dark-option" :class="{ selected: draft.theme === 'dark-peach' }" @click="draft.theme = 'dark-peach'"><i></i><span>深色桃粉</span></button><button type="button" class="theme-option light-option" :class="{ selected: draft.theme === 'light-peach' }" @click="draft.theme = 'light-peach'"><i></i><span>浅色桃粉</span></button></div><div class="appearance-fields"><label>数字字体<FluentSelect v-model="draft.fontFamily" :options="fontOptions" /></label><label>背景<FluentSelect v-model="draft.background" :options="backgroundOptions" /></label><label class="range-control">整体缩放 <strong>{{ draft.uiScale }}%</strong><input v-model.number="draft.uiScale" type="range" min="50" max="200" step="5" /></label></div><div class="accent-row"><label class="color-field"><span>主题色</span><FluentColorPicker v-model="draft.accentColor" :showPresets="false" /></label><button type="button" class="subtle-button" @click="draft.accentColor = ''">恢复默认主题色</button></div></section>
          <section class="setting-card setting-row"><div><h3>沉浸模式</h3><p>隐藏小组件边框，让页面更简洁。</p></div><button type="button" class="switch" :class="{ on: draft.immersiveMode }" :aria-pressed="draft.immersiveMode" @click="draft.immersiveMode = !draft.immersiveMode"><i></i></button></section>
        </template>

        <template v-else-if="activePane === 'time'"><span class="settings-kicker">视觉外观</span><h2>时间显示</h2><p class="settings-lead">调整时钟、日期和语录的大小。</p><section class="setting-card"><label class="range-control">主时钟大小 <strong>{{ draft.clockFontScale }}</strong><input v-model.number="draft.clockFontScale" type="range" min="6" max="22" step="0.5" /></label><label class="range-control">日期字号 <strong>{{ draft.dateFontSize }}px</strong><input v-model.number="draft.dateFontSize" type="range" min="10" max="32" /></label><label class="range-control">语录字号 <strong>{{ draft.quoteFontSize }}px</strong><input v-model.number="draft.quoteFontSize" type="range" min="10" max="48" /></label></section></template>

        <template v-else-if="activePane === 'layout'">
          <span class="settings-kicker">视觉外观</span><h2>组件布局</h2><p class="settings-lead">调整状态栏与面板的大小和位置。</p>
          <section class="setting-card"><h3>状态栏</h3><label class="range-control">整体缩放 <strong>{{ draft.statusDockScale }}%</strong><input v-model.number="draft.statusDockScale" type="range" min="60" max="150" step="5" /></label><label class="range-control">垂直位置 <strong>{{ draft.statusDockOffsetY }}px</strong><input v-model.number="draft.statusDockOffsetY" type="range" min="0" max="240" step="2" /></label></section>
          <section class="setting-card"><h3>作业板</h3><label class="range-control">面板宽度 <strong>{{ draft.homeworkWidth }}px</strong><input v-model.number="draft.homeworkWidth" type="range" min="200" max="520" step="10" /></label><label class="range-control">贴边偏移 <strong>{{ draft.homeworkOffsetX }}px</strong><input v-model.number="draft.homeworkOffsetX" type="range" min="0" max="240" step="4" /></label><label class="range-control">翻页间隔 <strong>{{ draft.homeworkPageInterval }} 秒</strong><input v-model.number="draft.homeworkPageInterval" type="range" min="3" max="60" step="1" /></label></section>
          <section class="setting-card"><h3>小黑板</h3><label class="range-control">字体缩放 <strong>{{ draft.blackboardFontScale }}%</strong><input v-model.number="draft.blackboardFontScale" type="range" min="70" max="160" step="5" /></label></section>
        </template>

        <template v-else-if="activePane === 'customize'"><span class="settings-kicker">视觉外观</span><h2>组件定制</h2><p class="settings-lead">分别调整各组件的字体和颜色。</p>
        <section class="setting-card"><h3>字体大小</h3><div class="appearance-fields"><label class="range-control">小组件数字 <strong>{{ draft.widgetFontSize }}px</strong><input v-model.number="draft.widgetFontSize" type="range" min="10" max="32" step="1" /></label><label class="range-control">小组件标签 <strong>{{ draft.widgetLabelFontSize }}px</strong><input v-model.number="draft.widgetLabelFontSize" type="range" min="8" max="20" step="1" /></label><label class="range-control">状态栏天气 <strong>{{ draft.statusWeatherFontSize }}px</strong><input v-model.number="draft.statusWeatherFontSize" type="range" min="10" max="28" step="1" /></label><label class="range-control">倒计时显示 <strong>{{ draft.countdownFontSize }}px</strong><input v-model.number="draft.countdownFontSize" type="range" min="12" max="40" step="1" /></label><label class="range-control">作业时间 <strong>{{ draft.homeworkTimeFontSize }}px</strong><input v-model.number="draft.homeworkTimeFontSize" type="range" min="8" max="24" step="1" /></label></div><button type="button" class="subtle-button" @click="draft.widgetFontSize = defaultSettings.widgetFontSize; draft.widgetLabelFontSize = defaultSettings.widgetLabelFontSize; draft.statusWeatherFontSize = defaultSettings.statusWeatherFontSize; draft.countdownFontSize = defaultSettings.countdownFontSize; draft.homeworkTimeFontSize = defaultSettings.homeworkTimeFontSize">恢复默认字号</button></section>
        <section class="setting-card"><h3>字体颜色</h3><p>重置后恢复默认配色。</p><div class="color-fields"><label class="color-field"><span>语录文字</span><FluentColorPicker v-model="draft.quoteTextColor" :showPresets="false" /></label><label class="color-field"><span>作者与出处</span><FluentColorPicker v-model="draft.quoteAuthorColor" :showPresets="false" /></label><label class="color-field"><span>状态栏天气</span><FluentColorPicker v-model="draft.statusWeatherColor" :showPresets="false" /></label><label class="color-field"><span>计时小组件</span><FluentColorPicker v-model="draft.taskWidgetColor" :showPresets="false" /></label><label class="color-field"><span>小组件强调色</span><FluentColorPicker v-model="draft.taskWidgetAccentColor" :showPresets="false" /></label><label class="color-field"><span>作业进行中</span><FluentColorPicker v-model="draft.homeworkStatusOngoingColor" :showPresets="false" /></label><label class="color-field"><span>作业待开始</span><FluentColorPicker v-model="draft.homeworkStatusUpcomingColor" :showPresets="false" /></label><label class="color-field"><span>作业已结束</span><FluentColorPicker v-model="draft.homeworkStatusEndedColor" :showPresets="false" /></label><label class="color-field"><span>作业时间</span><FluentColorPicker v-model="draft.homeworkTimeColor" :showPresets="false" /></label></div><button type="button" class="subtle-button" @click="draft.quoteTextColor = defaultSettings.quoteTextColor; draft.quoteAuthorColor = defaultSettings.quoteAuthorColor; draft.statusWeatherColor = defaultSettings.statusWeatherColor; draft.taskWidgetColor = defaultSettings.taskWidgetColor; draft.taskWidgetAccentColor = defaultSettings.taskWidgetAccentColor; draft.homeworkStatusOngoingColor = defaultSettings.homeworkStatusOngoingColor; draft.homeworkStatusUpcomingColor = defaultSettings.homeworkStatusUpcomingColor; draft.homeworkStatusEndedColor = defaultSettings.homeworkStatusEndedColor; draft.homeworkTimeColor = defaultSettings.homeworkTimeColor">恢复默认颜色</button></section>
        </template>

        <template v-else-if="activePane === 'weather' || activePane === 'location'">
          <span class="settings-kicker">环境提醒</span><h2>{{ activePane === 'weather' ? '天气' : '城市' }}</h2><p class="settings-lead">查看天气和设置城市。</p>
          <section class="setting-card">
            <div class="weather-refresh-row"><span>自动定位</span><div class="uri-setting-actions"><small v-if="locateMessage" class="inline-status">{{ locateMessage }}</small><button type="button" class="subtle-button" :disabled="locating" @click="autoLocate">{{ locating ? '定位中…' : '自动定位' }}</button></div></div>
            <div class="city-picker wide-city-picker"><label class="setting-select-label">城市<input v-model="draft.weatherCityName" class="setting-input" autocomplete="off" @focus="openCitySearch" @pointerdown="openCitySearch" @input="openCitySearch" @blur="closeCitySearch" /></label>
              <div v-if="citySearchOpen" class="city-results"><div v-if="citySearchLoading" class="city-result-message">正在搜索…</div><div v-else-if="!cityResults.length" class="city-result-message">输入城市名称搜索</div><button v-for="city in cityResults" v-else :key="city.locationKey" type="button" class="city-result" @pointerdown.prevent="selectCity(city)"><strong>{{ city.name }}</strong><span>{{ city.affiliation || '中国' }}</span></button></div>
            </div>
            <p class="setting-copy">从搜索结果中选择城市。</p>
            <div v-if="activePane === 'weather'" class="weather-settings-grid"><div class="weather-refresh-row"><span>天气</span><button type="button" class="subtle-button" @click="refreshWeather">刷新天气</button></div><div v-if="weatherStore.current" class="weather-summary"><div><small>当前天气</small><strong>{{ weatherStore.currentLabel }}</strong></div><div><small>温度</small><strong>{{ weatherStore.current.temperature?.value }}{{ weatherStore.current.temperature?.unit || '℃' }}</strong></div><div><small>体感</small><strong>{{ weatherStore.current.feelsLike?.value ?? '--' }}℃</strong></div><div><small>湿度</small><strong>{{ weatherStore.current.humidity?.value ?? '--' }}%</strong></div><div><small>风速</small><strong>{{ weatherStore.current.wind?.speed?.value ?? '--' }}{{ weatherStore.current.wind?.speed?.unit || '' }}</strong></div></div></div>
          </section>
        </template>

        <template v-else-if="activePane === 'refresh'"><span class="settings-kicker">内容语录</span><h2>自动轮换</h2><p class="settings-lead">设置语录更换间隔。</p><section class="setting-card"><div class="setting-row"><div><h3>自动更换语录</h3></div><button type="button" class="switch" :class="{ on: draft.quoteRotation }" @click="draft.quoteRotation = !draft.quoteRotation"><i></i></button></div><label class="range-control">轮换间隔 <strong>{{ draft.quoteInterval }} 秒</strong><input v-model.number="draft.quoteInterval" type="range" min="30" max="1800" step="30" /></label></section></template>
        <template v-else-if="activePane === 'effects'"><span class="settings-kicker">内容语录</span><h2>语录样式</h2><p class="settings-lead">选择语录显示方式。</p><section class="setting-card"><label class="setting-select-label">显示动画<FluentSelect v-model="draft.quoteAnimation" :options="animationOptions" /></label><label class="setting-select-label">打字速度<FluentSelect v-model="draft.quoteTypeSpeed" :options="typeSpeedOptions" /></label></section></template>
        <template v-else-if="activePane === 'channels'"><span class="settings-kicker">内容语录</span><h2>语录来源</h2><p class="settings-lead">选择内容来源和出现比重。</p><LocalQuoteSourcePanel :draft="draft" :content="contentStore.content" @manage="openQuoteManager" /><QuoteSourcePanel :draft="draft" @configure="openQuoteConfig" /></template>

        <template v-else-if="activePane === 'calibration'"><span class="settings-kicker">系统数据</span><h2>时间校准</h2><p class="settings-lead">选择时间来源或手动校准。</p><section class="setting-card"><div class="setting-row"><div><h3>自动校时</h3><p>定期校准显示时间。</p><small v-if="timeSyncMessage" class="inline-status">{{ timeSyncMessage }}</small></div><button type="button" class="switch" :class="{ on: draft.timeSyncEnabled && draft.timeSyncSource !== 'system' }" @click="toggleAutoTimeSync"><i></i></button></div><label class="setting-select-label">时间来源<FluentSelect v-model="draft.timeSyncSource" :options="timeSourceOptions" /></label><label class="range-control">校时间隔 <strong>{{ draft.timeSyncInterval }} 分钟</strong><input v-model.number="draft.timeSyncInterval" type="range" min="5" max="360" step="5" /></label><div class="weather-refresh-row"><span>手动校准</span><button type="button" class="subtle-button" @click="syncTimeNow">立即校时</button></div></section></template>
        <template v-else-if="activePane === 'updates'"><span class="settings-kicker">系统数据</span><h2>应用更新</h2><p class="settings-lead">检查并安装新版本。</p><section class="setting-card"><div class="setting-row"><div><h3>当前版本</h3><p>v{{ appVersion }} · {{ platformLabel }}</p><small v-if="updateState.message" class="inline-status">{{ updateState.message }}</small></div><div class="update-actions"><button type="button" class="subtle-button" :disabled="updateState.checking || updateState.installing" @click="checkForUpdate">{{ updateState.checking ? '检查中…' : '检查更新' }}</button><button v-if="updateState.available && updateState.downloadUrl" type="button" class="save-button" :disabled="updateState.installing" @click="installUpdate">{{ updateState.installing ? '下载中…' : '安装更新' }}</button><button v-else-if="updateState.available && updateState.url" type="button" class="subtle-button" @click="openReleasePage">打开下载页</button></div></div></section></template>
        <template v-else-if="activePane === 'data'"><span class="settings-kicker">系统数据</span><h2>备份与数据</h2><p class="settings-lead">备份、恢复或重置这台设备上的数据。</p><BackupPanel /></template>
        <template v-else-if="activePane === 'about'">
          <span class="settings-kicker">关于</span><h2>项目信息</h2><p class="settings-lead">班级大屏与学习计时。</p>
          <section class="setting-card about-card">
            <div class="about-hero"><img class="about-app-mark" src="/icon-192.svg" alt="CyTime" /><h3>CyTime 昔时时钟</h3><strong>v{{ appVersion }}<template v-if="buildId"> · build {{ buildId }}</template></strong><p>昔光涟涟，时不我待。</p></div>
            <div class="about-credit-row"><div class="about-person"><img src="/avatars/Cyrene2008.png" alt="Cyrene2008" /><div><strong>Cyrene2008 <small>作者</small></strong><a class="project-link" href="https://github.com/Cyrene2008" target="_blank" rel="noreferrer">GitHub</a></div></div><div class="about-powered"><h3>Powered by VueFluentWidgets</h3><p>Fluent Design System for Vue · MIT License</p><p>Copyright © 2025-2026 Cyrene2008</p><a class="project-link" href="https://fluent.cyrene.hk" target="_blank" rel="noreferrer">VueFluentWidgets 官网</a></div></div>
            <div class="about-friends"><h3>友链</h3><div class="about-friend"><div><strong>Cyreneの随机点名器</strong><p>随机点名与班级活动。</p></div><div class="project-links"><a class="project-link" href="https://点名器.昔涟.cn" target="_blank" rel="noreferrer">官网</a><a class="project-link" href="https://web点名器.昔涟.cn" target="_blank" rel="noreferrer">在线版</a></div></div></div>
            <div class="about-license"><strong>开源许可</strong><p>GNU General Public License v3.0</p><div class="project-links"><a class="project-link" href="https://github.com/Cyrene2008/CyTime" target="_blank" rel="noreferrer">CyTime 仓库</a><a class="project-link" href="https://github.com/Cyrene2008/VueFluentWidgets" target="_blank" rel="noreferrer">VueFluentWidgets</a><a v-if="FILING_NAME" class="project-link" :href="FILING_URL" target="_blank" rel="noreferrer">{{ FILING_NAME }}</a></div></div>
          </section>
        </template>
        <section v-if="activePane === 'startup' && isDesktop()" class="setting-card setting-row uri-setting"><div><h3>链接调用</h3><p>允许其它应用通过链接打开昔时。</p><small v-if="uriMessage" class="inline-status">{{ uriMessage }}</small></div><div class="uri-setting-actions"><button type="button" class="subtle-button" @click="uriHelpOpen = true"><FluentIcon icon="info-20-regular" :width="16" />使用说明</button><button type="button" class="switch" :class="{ on: draft.uriRegistration }" :aria-pressed="draft.uriRegistration" @click="toggleUriRegistration"><i></i></button></div></section>
       </div></div><footer class="settings-actions"><span v-if="feedbackMessage" class="save-message">{{ feedbackMessage }}</span><button type="button" class="subtle-button action-button" @click="cancel"><FluentIcon icon="dismiss-20-regular" :width="15" /> 取消</button><button type="button" class="save-button action-button" @click="save"><FluentIcon icon="checkmark-20-regular" :width="15" /> 保存</button></footer><FluentToast ref="toastRef" /></div>
    </div>
    <div v-if="uriHelpOpen" class="uri-help-layer" role="dialog" aria-modal="true" aria-label="链接调用说明" @click.self="uriHelpOpen = false"><section class="uri-help-modal"><header><div><span class="settings-kicker">桌面端</span><h2>链接调用说明</h2></div><button type="button" class="dialog-close" aria-label="关闭说明" @click="uriHelpOpen = false"><FluentIcon icon="dismiss-20-regular" :width="18" /></button></header><div class="uri-help-content"><p>用链接打开昔时，或控制计时任务。</p><dl><dt>打开应用</dt><dd><code>cytime://</code></dd><dt>窗口模式</dt><dd><code>cytime://?mode=mini</code>、<code>normal</code>、<code>max</code> 或 <code>full</code></dd><dt>切换页面</dt><dd><code>cytime://page/time</code><br /><code>cytime://page/countdown</code><br /><code>cytime://page/timer</code></dd><dt>创建倒计时</dt><dd><code>cytime://countdown?target=20261101121500</code><br /><code>cytime://countdown?length=1800</code></dd><dt>控制倒计时</dt><dd><code>cytime://task/countdown/pause</code><br /><code>cytime://task/countdown/continue</code><br /><code>cytime://task/countdown/stop</code></dd></dl></div><footer><button type="button" class="save-button" @click="uriHelpOpen = false">知道了</button></footer></section></div>
    <div v-if="quoteConfigOpen" class="uri-help-layer" role="dialog" aria-modal="true" aria-label="CyQuote 昔言 · 分类" @click.self="quoteConfigOpen = false">
      <section class="uri-help-modal quote-config-modal">
        <header><div><span class="settings-kicker">在线来源</span><h2>CyQuote 昔言 · 分类</h2></div><button type="button" class="dialog-close" aria-label="关闭分类配置" @click="quoteConfigOpen = false"><FluentIcon icon="dismiss-20-regular" :width="18" /></button></header>
        <div class="uri-help-content">
          <p>选择喜欢的分类，或保留全部。</p><p class="setting-copy"><a class="project-link" :href="QUOTE_API_DOCS" target="_blank" rel="noreferrer">昔言说明</a></p>
          <div class="setting-row quote-weight-toggle"><div><h3>优先来源</h3><p>连接失败时会尝试其它来源。</p></div><FluentSelect v-model="draft.quoteApiEndpoint" :options="quoteEndpointOptions" aria-label="优先来源" /></div>
          <div class="category-chips quote-config-chips"><button type="button" class="category-chip" :class="{ active: !draft.quoteApiCategories?.length }" @click="draft.quoteApiCategories = []">全部<small v-if="quoteTotal">· {{ quoteTotal }}</small></button><button v-for="category in quoteCategories" :key="category" type="button" class="category-chip" :class="{ active: draft.quoteApiCategories?.includes(category) }" @click="toggleQuoteCategory(category)">{{ category }}<small v-if="quoteCounts[category] !== undefined">· {{ quoteCounts[category] }}</small></button><span v-if="quoteCategoryLoading" class="quote-config-hint">正在获取分类…</span></div>
          <div class="setting-row quote-weight-toggle"><div><h3>调整分类比重</h3><p>比重越大，出现机会越多。</p></div><button type="button" class="switch" :class="{ on: draft.quoteApiCategoryWeightsEnabled }" :disabled="!draft.quoteApiCategories?.length" @click="toggleCategoryWeights"><i></i></button></div>
          <div v-if="draft.quoteApiCategoryWeightsEnabled && draft.quoteApiCategories?.length" class="category-weight-list"><label v-for="category in draft.quoteApiCategories" :key="category" class="category-weight-row"><span>{{ category }}</span><input type="number" min="0" max="9999" :value="categoryWeight(category)" @input="setCategoryWeight(category, $event)" /></label></div>
        </div><footer><button type="button" class="save-button" @click="quoteConfigOpen = false">完成</button></footer>
      </section>
    </div>
    <div v-if="quoteManagerOpen" class="uri-help-layer" role="dialog" aria-modal="true" aria-label="本地语录管理" @click.self="quoteManagerOpen = false">
      <section class="uri-help-modal quote-manager-modal">
        <header><div><span class="settings-kicker">本地内容</span><h2>本地语录管理</h2></div><button type="button" class="dialog-close" aria-label="关闭语录管理" @click="quoteManagerOpen = false"><FluentIcon icon="dismiss-20-regular" :width="18" /></button></header>
        <div class="uri-help-content quote-manager-content">
          <div class="quote-manager-toolbar"><div class="inline-form"><input v-model="quoteDraft" placeholder="添加一句语录" @keydown.enter.prevent="addQuote" /><button type="button" class="subtle-button" @click="addQuote">添加</button><button type="button" class="subtle-button" @click="quoteImportInput?.click()">导入文件</button><input ref="quoteImportInput" type="file" accept=".txt,.json" hidden @change="importQuotes" /></div></div>
          <p class="setting-copy">支持 TXT 和 JSON，TXT 每行一条语录。</p>
          <div class="quote-manager-list-head"><label class="quote-manager-check"><input type="checkbox" :checked="allPageSelected" @change="toggleAllPage" />本页全选</label><div class="quote-manager-actions"><FluentSelect v-model="quotePageSize" :options="quotePageSizeOptions" aria-label="每页条数" /><button type="button" class="subtle-button danger-button" :disabled="!selectedQuotes.length" @click="removeSelectedQuotes">删除所选{{ selectedQuotes.length ? `（${selectedQuotes.length}）` : '' }}</button></div></div>
          <div class="quote-manager-list"><div v-for="quote in pagedQuotes" :key="quote" class="quote-manager-item"><input type="checkbox" :value="quote" v-model="selectedQuotes" /><span class="quote-manager-text">{{ quote }}</span><button type="button" class="icon-text-button" @click="contentStore.removeQuote(quote)">删除</button></div><p v-if="!pagedQuotes.length" class="empty-inline">还没有本地语录。</p></div>
          <div class="quote-manager-pager"><button type="button" class="subtle-button" :disabled="quotePage <= 1" @click="quotePage--">上一页</button><span>{{ quotePage }} / {{ quotePageCount }} 页 · 共 {{ contentStore.content.quotes.length }} 条</span><button type="button" class="subtle-button" :disabled="quotePage >= quotePageCount" @click="quotePage++">下一页</button></div>
        </div><footer><button type="button" class="save-button" @click="quoteManagerOpen = false">完成</button></footer>
      </section>
    </div>
  </section>
</template>
