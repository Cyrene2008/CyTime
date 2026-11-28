export function readGroupRoster(text) {
  const names = text.split(/\r\n|[\n\r\u2028\u2029]/).map(line => line.trim()).filter(Boolean)
  const counts = new Map()
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1)

  const occurrences = new Map()
  const reservedLabels = new Set(names)
  const people = names.map((name, index) => {
    let label = name
    if (counts.get(name) > 1) {
      const occurrence = (occurrences.get(name) ?? 0) + 1
      occurrences.set(name, occurrence)
      label = `${name}（同名 ${occurrence}）`
      // A name already containing a note must stay distinguishable from generated labels.
      while (reservedLabels.has(label)) label += '＊'
      reservedLabels.add(label)
    }
    return { id: index + 1, name, label }
  })
  return { people, duplicateNames: occurrences.size }
}

export function planGroupSizes(total, mode, value) {
  const quantity = Number(value)
  if (!Number.isSafeInteger(total) || total < 1 || !Number.isSafeInteger(quantity) || quantity < 1) return []
  if ((mode !== 'count' && mode !== 'size') || (mode === 'count' && quantity > total)) return []
  const count = mode === 'size' ? Math.ceil(total / quantity) : quantity
  const smallest = Math.floor(total / count)
  const extra = total % count
  return Array.from({ length: count }, (_, index) => smallest + Number(index < extra))
}

export function drawGroups(people, mode, quantity, random = Math.random) {
  const sizes = planGroupSizes(people.length, mode, quantity)
  if (!sizes.length) return []

  const shuffled = [...people]
  for (let right = shuffled.length - 1; right > 0; right--) {
    const left = Math.floor(random() * (right + 1))
    ;[shuffled[left], shuffled[right]] = [shuffled[right], shuffled[left]]
  }

  let offset = 0
  return sizes.map(size => {
    const group = shuffled.slice(offset, offset + size)
    offset += size
    return group
  })
}

export function formatGroups(groups) {
  return groups.map((group, index) => `第 ${index + 1} 组（${group.length} 人）：${group.map(person => person.label).join('、')}`).join('\n')
}
