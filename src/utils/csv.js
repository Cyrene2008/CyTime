export function parseCsvRows(input) {
  const content = String(input || '').replace(/^\uFEFF/, '')
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  for (let index = 0; index < content.length; index++) {
    const character = content[index]
    if (quoted) {
      if (character === '"' && content[index + 1] === '"') { cell += '"'; index++ }
      else if (character === '"') quoted = false
      else cell += character
    } else if (character === '"') quoted = true
    else if (character === ',') { row.push(cell); cell = '' }
    else if (character === '\n' || character === '\r') {
      if (character === '\r' && content[index + 1] === '\n') index++
      row.push(cell)
      if (row.some(value => value.trim() !== '')) rows.push(row)
      row = []
      cell = ''
    } else cell += character
  }
  if (quoted) throw new Error('CSV 引号未闭合')
  row.push(cell)
  if (row.some(value => value.trim() !== '')) rows.push(row)
  return rows
}

export function serializeCsv(rows) {
  const cell = value => {
    const text = value === null || value === undefined ? '' : String(value)
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }
  return `\uFEFF${rows.map(row => row.map(cell).join(',')).join('\r\n')}`
}

export function fileNamePart(value, fallback = '导出') {
  return String(value || '').trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/[ .]+$/g, '') || fallback
}
