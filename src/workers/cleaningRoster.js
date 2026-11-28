import { parseRosterFile } from '../utils/dutyRoster.js'

self.onmessage = async ({ data: { file, selection } }) => {
  try {
    const roster = await parseRosterFile(file.name, await file.arrayBuffer(), { ...selection, requireComplete: true, interactive: true })
    self.postMessage({ roster })
  } catch (error) {
    self.postMessage({ error: error.message || '名单读取失败，请检查文件格式' })
  }
}
