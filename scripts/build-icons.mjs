import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const root = fileURLToPath(new URL('..', import.meta.url))
const collection = JSON.parse(readFileSync(join(root, 'node_modules/@iconify-json/fluent/icons.json'), 'utf8'))
const pattern = /['"]([a-z0-9]+(?:-[a-z0-9]+)*-\d+-(?:regular|filled))['"]/g
const names = new Set()
const required = new Set()
function scan(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) scan(path)
    else if (/\.(vue|js)$/.test(entry.name)) for (const match of readFileSync(path, 'utf8').matchAll(pattern)) { names.add(match[1]); required.add(match[1]) }
  }
}
scan(join(root, 'src'))
for (const match of readFileSync(join(root, 'node_modules/vue-fluent-widgets/dist/vue-fluent-widgets.js'), 'utf8').matchAll(pattern)) names.add(match[1])
const icons = {}
const aliases = {}
function include(name) {
  if (icons[name] || aliases[name]) return
  if (collection.icons[name]) icons[name] = collection.icons[name]
  else if (collection.aliases?.[name]) { aliases[name] = collection.aliases[name]; include(aliases[name].parent) }
  else if (required.has(name)) throw new Error(`Fluent icon missing: ${name}`)
}
for (const name of [...names].sort()) include(name)
const subset = { prefix: collection.prefix, width: collection.width || 24, height: collection.height || 24, icons, ...(Object.keys(aliases).length ? { aliases } : {}) }
writeFileSync(join(root, 'src/data/fluent-icons.json'), `${JSON.stringify(subset)}\n`)
console.log(`prepared ${Object.keys(icons).length} offline Fluent icons`)
