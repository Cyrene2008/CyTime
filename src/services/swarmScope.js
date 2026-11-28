export const swarmSurfaces = [
  ['time', '时钟'], ['countdown', '倒计时'], ['timer', '计时器'], ['classroom', '课堂工具'], ['settings', '设置页面']
]

export function normalizeSwarmPages(pages) {
  return swarmSurfaces.map(([key]) => key).filter(key => !Array.isArray(pages) || pages.includes(key))
}

export function allowsSwarmSurface(settings, surface, pure = false) {
  return Boolean(surface) && (!pure || settings.swarmDisablePure === false)
    && (settings.swarmScope !== 'selected' || normalizeSwarmPages(settings.swarmPages).includes(surface))
}
