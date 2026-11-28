import { parseRosterFile, workbookFile } from '../utils/dutyRoster.js'

export async function readCleaningRoster(file, signal, selection = {}) {
  const readHere = async () => {
    signal.throwIfAborted()
    return parseRosterFile(file.name, await file.arrayBuffer(), { ...selection, requireComplete: true, interactive: true })
  }
  const smallTextFile = !workbookFile(file.name) && file.size <= 64 * 1024
  if (smallTextFile || typeof Worker === 'undefined') return readHere()
  let worker
  try {
    const { default: RosterWorker } = await import('../workers/cleaningRoster.js?worker&inline')
    signal.throwIfAborted()
    worker = new RosterWorker()
  } catch {
    return readHere()
  }
  try {
    const result = await new Promise((resolve, reject) => {
      signal.onabort = () => reject(signal.reason)
      worker.onmessage = ({ data }) => resolve(data)
      // Some embedded browsers block workers. Retry locally only if it could not run.
      worker.onerror = event => { event.preventDefault(); resolve(null) }
      worker.postMessage({ file, selection })
    })
    if (!result) return readHere()
    if (result.error) throw new Error(result.error)
    return result.roster
  } finally {
    signal.onabort = null
    worker.terminate()
  }
}
