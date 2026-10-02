const CSV_HEADERS = ['名单名称', '名单ID', '中文名', '英文名', '性别', '小组名称', '小组英文名', '小组ID', '人员UUID', '白名单']

const textDecoder = new TextDecoder('utf-8')

function baseName(name) {
  return String(name || '值日名单').replace(/\.[^.]+$/, '') || '值日名单'
}

function extensionOf(name) {
  return String(name || '').split('.').pop()?.toLowerCase() || ''
}

export function normalizeGender(value) {
  const text = String(value || '').trim().toLowerCase()
  if (['女', 'female', 'f', 'girl'].includes(text)) return 'female'
  if (['男', 'male', 'm', 'boy'].includes(text)) return 'male'
  return ''
}

function normalizeHeader(value) {
  return String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '')
}

function parseCsvRows(content) {
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  for (let index = 0; index < content.length; index++) {
    const character = content[index]
    if (quoted) {
      if (character === '"' && content[index + 1] === '"') {
        cell += '"'
        index++
      } else if (character === '"') quoted = false
      else cell += character
    } else if (character === '"') quoted = true
    else if (character === ',') { row.push(cell); cell = '' }
    else if (character === '\n' || character === '\r') {
      if (character === '\r' && content[index + 1] === '\n') index++
      row.push(cell)
      if (row.some(value => String(value).trim() !== '')) rows.push(row)
      row = []
      cell = ''
    } else cell += character
  }
  if (quoted) throw new Error('CSV 中存在未闭合的引号')
  row.push(cell)
  if (row.some(value => String(value).trim() !== '')) rows.push(row)
  return rows
}

const NAME_KEYS = ['中文名', '姓名', '名称', 'chinesename', 'name', 'cn']
const EN_KEYS = ['英文名', '英文', 'englishname', 'en', 'english', 'ename']
const GENDER_KEYS = ['性别', 'gender', 'sex']
const LISTNAME_KEYS = ['名单名称', '名单名', 'listname']

function findColumn(headers, keys) {
  for (const key of keys) {
    const index = headers.indexOf(key)
    if (index >= 0) return index
  }
  return -1
}

function rowsToMembers(rows, listName) {
  if (!rows.length) throw new Error('名单内容为空')
  const first = rows[0].map(normalizeHeader)
  const nameIndex = findColumn(first, NAME_KEYS)
  const hasHeader = nameIndex >= 0 || findColumn(first, GENDER_KEYS) >= 0 || findColumn(first, EN_KEYS) >= 0
  const members = []
  let name = listName
  let dataRows = rows
  let columns = { name: 0, en: 1, gender: 2, listName: -1 }
  if (hasHeader) {
    columns = {
      name: nameIndex,
      en: findColumn(first, EN_KEYS),
      gender: findColumn(first, GENDER_KEYS),
      listName: findColumn(first, LISTNAME_KEYS)
    }
    if (columns.name < 0) columns.name = first.indexOf('name')
    if (columns.name < 0) throw new Error('名单表头缺少姓名列（中文名/姓名）')
    dataRows = rows.slice(1)
  }
  for (const row of dataRows) {
    const cn = String(row[columns.name] ?? '').trim()
    if (!cn) continue
    if (!name || name === listName) {
      const fromRow = columns.listName >= 0 ? String(row[columns.listName] ?? '').trim() : ''
      if (fromRow && (!listName || listName === baseName(listName))) name = fromRow
    }
    members.push({
      name: cn,
      enName: columns.en >= 0 ? String(row[columns.en] ?? '').trim() : '',
      gender: columns.gender >= 0 ? normalizeGender(row[columns.gender]) : ''
    })
  }
  if (!members.length) throw new Error('名单中没有可导入的人员')
  return { name: name || listName || '导入名单', members }
}

function jsonToRoster(value, name) {
  const fallback = baseName(name)
  const list = Array.isArray(value) ? { name: fallback, names: value } : value
  const rows = Array.isArray(list?.names) ? list.names : Array.isArray(list?.members) ? list.members : Array.isArray(list) ? list : null
  if (!rows) throw new Error('JSON 中未识别到人员名单')
  const members = rows.map(row => {
    if (typeof row === 'string') return { name: row.trim(), enName: '', gender: '' }
    const cn = String(row.cn ?? row.name ?? row.中文名 ?? row.姓名 ?? '').trim()
    if (!cn) return null
    return {
      name: cn,
      enName: String(row.en ?? row.enName ?? row.英文名 ?? row.english ?? '').trim(),
      gender: normalizeGender(row.gender ?? row.sex ?? row.性别)
    }
  }).filter(Boolean)
  if (!members.length) throw new Error('JSON 名单中没有可导入的人员')
  return { name: String(list.name || fallback), members }
}

function parseRosterText(text, name) {
  const normalized = String(text || '').replace(/^\uFEFF/, '').trim()
  if (!normalized) throw new Error('文件内容为空')
  if (normalized.startsWith('{') || normalized.startsWith('[')) {
    return jsonToRoster(JSON.parse(normalized), name)
  }
  return rowsToMembers(parseCsvRows(normalized), baseName(name))
}

export async function parseRosterFile(name, input) {
  const extension = extensionOf(name)
  const bytes = input instanceof Uint8Array ? input : input instanceof ArrayBuffer ? new Uint8Array(input) : null
  if (extension === 'xlsx' || extension === 'xls') {
    if (!bytes) throw new Error('XLSX 文件读取失败')
    const XLSX = await import('xlsx')
    const workbook = XLSX.read(bytes, { type: 'array', cellDates: false })
    const sheetName = workbook.SheetNames[0]
    if (!sheetName) throw new Error('XLSX 中没有工作表')
    const sheet = workbook.Sheets[sheetName]
    const csv = XLSX.utils.sheet_to_csv(sheet)
    return parseRosterText(csv, baseName(name))
  }
  const text = bytes ? textDecoder.decode(bytes) : String(input ?? '')
  return parseRosterText(text, baseName(name))
}

function csvCell(value) {
  const text = value === null || value === undefined ? '' : String(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function serializeRosterFile(members, format = 'csv', listName = '值日名单') {
  if (format === 'json') {
    return JSON.stringify({
      name: listName,
      groups: [],
      names: members.map(member => ({
        id: member.uuid || '',
        cn: member.name,
        en: member.enName || '',
        gender: member.gender === 'female' ? 'female' : 'male',
        groupId: '',
        isWhiteList: false
      }))
    }, null, 2)
  }
  const rows = [CSV_HEADERS]
  for (const member of members) {
    rows.push([listName, '', member.name, member.enName || '', member.gender === 'female' ? '女' : member.gender === 'male' ? '男' : '', '', '', '', member.uuid || '', ''])
  }
  return `\uFEFF${rows.map(row => row.map(csvCell).join(',')).join('\r\n')}`
}

let collator
function pinyinCollator() {
  if (!collator) {
    try { collator = new Intl.Collator('zh-Hans-u-co-pinyin') } catch { collator = new Intl.Collator('zh') }
  }
  return collator
}

export function sortMembersPinyin(members) {
  const compare = pinyinCollator()
  return [...members].sort((a, b) => compare.compare(a.name, b.name) || a.name.localeCompare(b.name))
}
